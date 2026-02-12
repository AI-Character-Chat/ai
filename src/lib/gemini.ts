/**
 * Gemini AI 통합 모듈 (v5 - Pro + Flash 혼합 + Context Caching + Narrative Memory)
 *
 * 모델 전략:
 * - 스토리 생성 (generateStoryResponse): gemini-2.5-pro (최고 품질 + thinking)
 * - 보조 작업 (요약 등): gemini-2.5-flash (빠르고 저렴)
 *
 * 핵심:
 * - @google/genai SDK
 * - implicit caching (systemInstruction)
 * - systemInstruction(정적, 캐시됨) + contents(동적) 2계층 분리
 * - JSON 응답 모드
 * - narrative-memory 컨텍스트 주입
 *
 * 프롬프트 계층:
 * [systemInstruction - 캐시됨]
 *   [1] 응답 규칙 + JSON 형식
 *   [2] 세계관 (작품별 고정)
 *   [3] 캐릭터 페르소나 (작품별 고정)
 *   [4] 로어북 정적 항목
 * [contents - 매 턴 변경]
 *   [5] 유저 페르소나
 *   [6] 캐릭터별 기억 (narrative-memory)
 *   [7] 세션 요약 (장기 기억)
 *   [8] 현재 장면 + 대화 이력
 *   [9] 유저 메시지
 */

import { GoogleGenAI, Type, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { replaceVariables } from './prompt-builder';

// ============================================================
// 클라이언트 초기화
// ============================================================

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const MODEL_PRO = 'gemini-2.5-pro';    // 스토리 생성 (최고 품질)
const MODEL_FLASH = 'gemini-2.5-flash'; // 보조 작업 (요약 등)

// ============================================================
// 타입 정의
// ============================================================

interface CharacterInfo {
  id: string;
  name: string;
  prompt: string;
}

interface SceneState {
  location: string;
  time: string;
  presentCharacters: string[];
  recentEvents: string[];
}

interface UserPersona {
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
}

export interface StoryTurn {
  type: 'narrator' | 'dialogue';
  characterId: string;
  characterName: string;
  content: string;
  emotion: { primary: string; intensity: number };
}

export interface ResponseMetadata {
  model: string;
  thinking: boolean;
  promptTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  cacheHitRate: number;
  finishReason: string;
  geminiApiMs: number;
}

export interface StoryResponse {
  turns: StoryTurn[];
  updatedScene: {
    location: string;
    time: string;
    presentCharacters: string[];
  };
  metadata: ResponseMetadata;
}

// ============================================================
// 재시도 설정
// ============================================================

const MAX_RETRIES = 2;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// 표정 타입
// ============================================================

const EXPRESSION_TYPES = [
  'neutral', 'smile', 'cold', 'angry', 'sad', 'happy', 'surprised', 'embarrassed'
] as const;

// ============================================================
// 안전 필터 설정 (창작 콘텐츠 허용)
// ============================================================

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
];

// ============================================================
// JSON Response Schema
// ============================================================

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    turns: {
      type: Type.ARRAY,
      description: '나레이션과 대사를 교차 배치. 최소 5개 이상.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: '"narrator" 또는 "dialogue"',
          },
          character: {
            type: Type.STRING,
            description: 'dialogue일 때 캐릭터 이름. narrator일 때 빈 문자열.',
          },
          content: {
            type: Type.STRING,
            description: 'narrator: 감각+심리 포함 2-3문장 묘사. dialogue: 세계관 디테일이 녹아든 2-4문장 대사.',
          },
          emotion: {
            type: Type.STRING,
            description: 'dialogue일 때 표정. narrator일 때 "neutral".',
          },
          emotionIntensity: {
            type: Type.NUMBER,
            description: 'dialogue일 때 감정 강도 0.0~1.0. narrator일 때 0.5.',
          },
        },
        required: ['type', 'character', 'content', 'emotion', 'emotionIntensity'],
      },
    },
    scene: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING, description: '현재 장소' },
        time: { type: Type.STRING, description: '현재 시간대' },
        presentCharacters: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '이 턴 종료 시점에 장면에 있는 모든 캐릭터 이름',
        },
      },
      required: ['location', 'time', 'presentCharacters'],
    },
  },
  required: ['turns', 'scene'],
};

// ============================================================
// [1] systemInstruction 빌더 (작품별 고정 → 캐시됨)
// ============================================================

export function buildSystemInstruction(params: {
  worldSetting: string;
  characters: Array<{ name: string; prompt: string }>;
  lorebookStatic: string;
  userName: string;
}): string {
  const parts: string[] = [];

  // 응답 규칙 (전역 고정)
  const un = params.userName;
  parts.push(`당신은 인터랙티브 스토리 AI입니다.
turns 배열에 narrator와 dialogue를 교차 배치하세요.

## 핵심 원칙 (우선순위 순)
1. ${un}의 말/행동이 이번 응답의 중심 사건이다. 첫 narrator에서 ${un}의 행동 결과를 즉시 묘사하라.
2. 한 응답에 1~2명에 집중하라. 한 캐릭터가 깊이 반응하는 것이 여러 캐릭터가 한 마디씩 하는 것보다 낫다.
3. 다른 캐릭터는 장소·동기·관계가 뒷받침될 때만 등장시켜라. 모든 캐릭터를 매번 등장시키지 마라.

## 응답 분량 (유저 입력에 비례)
- ${un}의 입력이 짧은 확인/동의/이동 ("좋아", "가보자", "알겠어"): turns 3~4개
- ${un}의 입력이 구체적 행동/대화: turns 4~6개
- ${un}의 입력이 긴 서술/복잡한 행동: turns 5~8개

## 사건 전진 (최우선)
- 매 응답은 반드시 스토리를 새로운 상황으로 전진시켜야 한다. 같은 자리에서 대화만 하면 안 된다.
- ${un}이 행동/결정을 했으면, 그 결과로 상황이 실제로 변해야 한다 (장소 이동, 새 인물 등장, 새 정보 발견, 위기 발생 등).
- ${un}이 "가자/하자/진행해" 같은 행동 의지를 보이면, 캐릭터가 "위험해/기다려" 로 제지하지 마라. 즉시 행동으로 옮기고 그 결과를 보여줘라.
- 캐릭터가 설명할 내용이 있으면, 행동하면서 짧게 말하게 하라. 행동 전에 긴 설명을 하지 마라.

## 씬 페이싱 (클리프행어)
- 스토리를 새 상황까지 전진시킨 후, 그 새 상황의 긴장 순간에서 끊어라.
- 좋은 예: 이동 → 도착 → 문을 여는 순간 예상 못한 것이 보임 (여기서 끊기)
- 나쁜 예: "위험해" → "준비돼?" → "정말?" → 제자리에서 대화만 반복

## 형식
- narrator: 2-3문장. 아래 기법 중 매번 다른 것을 선택하라:
  · 환경/공간 묘사 (조명, 날씨, 건물, 거리 풍경)
  · 감각 디테일 (소리, 냄새, 촉감, 온도, 맛)
  · 행동 비트 (캐릭터의 미세한 몸짓, 시선, 손동작)
  · 객관적 관찰 (카메라가 비추듯 장면을 묘사)
  · 시간/분위기 전환 (장면 전환, 시간 경과)
- narrator 금지 표현: "심장이 요동쳤다/두근거렸다/뛰었다", "머릿속에는 X라는 일념", "본능적으로", "온몸에 전율이", "숨이 막혔다", "눈앞이 아찔했다" — 이런 내면 감정 클리셰를 매번 쓰지 마라. 감정은 행동과 표정으로 보여줘라.
- 나레이션에서 유저를 지칭할 때는 반드시 "${un}"이라고 쓴다.
- dialogue: 반드시 2-4문장. 세계관 용어와 상황 디테일을 자연스럽게 녹여서. 한 문장 대사 금지.
- 새 캐릭터 등장 시 narrator에서 등장 이유와 외모 묘사
- 표정: neutral/smile/cold/angry/sad/happy/surprised/embarrassed

## 서사 연속성 (최우선)
- 이 응답은 대화 이력의 직접적인 연속이다. 대화 이력에 나온 모든 사건, 감정, 관계 변화를 기억하고 이어가라.
- 이미 등장한 캐릭터가 다시 나올 때, 절대 처음 만난 것처럼 행동하지 마라. 이전에 있었던 일을 반드시 기억하고 반영하라.
- 캐릭터의 감정 상태는 직전 대화에서 이어진다. 슬펐으면 여전히 슬프고, 화났으면 여전히 화난 상태에서 시작하라.
- ${un}이 장소를 이동해도 세계관과 스토리는 연속된다. 새 장면 = 새 시작이 아니다.

## 반복 금지
- 이전 턴에서 이미 사용한 대사나 표현은 이번 턴에서 절대 다시 쓰지 마라.
- 캐릭터의 대표 표현/캐치프레이즈는 첫 등장 시 1회만 허용. 이후에는 같은 뜻을 다른 말로 표현하라.
- 한 응답 안에서도 같은 표현을 두 번 쓰지 마라.
- narrator도 매 턴 다른 기법을 써라. 직전 턴에서 감각 묘사를 했으면 이번엔 행동 비트나 환경 묘사를 써라.
- 대사는 반드시 2문장 이상. 캐릭터의 의도와 상황 맥락을 담아라.`);

  // 세계관 (작품별 고정 - 전체 포함)
  if (params.worldSetting) {
    parts.push(`## 세계관\n${params.worldSetting}`);
  }

  // 캐릭터 페르소나 (작품별 고정 - 전체 포함)
  if (params.characters.length > 0) {
    const charSection = params.characters
      .map((char) => {
        const prompt = replaceVariables(char.prompt, params.userName, char.name);
        return `### ${char.name}\n${prompt}`;
      })
      .join('\n\n');

    parts.push(`## 캐릭터\n${charSection}`);
  }

  // 로어북 정적 항목 (작품별 고정 - 전체 포함)
  if (params.lorebookStatic) {
    parts.push(`## 참고 설정\n${params.lorebookStatic}`);
  }

  return parts.join('\n\n');
}

// ============================================================
// [2] contents 빌더 (매 턴 변경)
// ============================================================

export function buildContents(params: {
  userPersona?: UserPersona;
  narrativeContexts: string[];
  sessionSummary?: string;
  proAnalysis?: string;
  sceneState: SceneState;
  conversationHistory: string;
  userMessage: string;
  userName: string;
  previousPresentCharacters?: string[];
}): Array<{ role: 'user'; parts: Array<{ text: string }> }> {
  const sections: string[] = [];

  // 유저 페르소나
  if (params.userPersona) {
    const personaParts: string[] = [];
    personaParts.push(`이름: ${params.userPersona.name}`);
    if (params.userPersona.age) personaParts.push(`나이: ${params.userPersona.age}세`);
    if (params.userPersona.gender && params.userPersona.gender !== 'private') {
      personaParts.push(`성별: ${params.userPersona.gender === 'male' ? '남성' : '여성'}`);
    }
    if (params.userPersona.description) {
      personaParts.push(params.userPersona.description);
    }
    sections.push(`## 유저 (${params.userPersona.name})\n${personaParts.join('\n')}`);
  }

  // 캐릭터별 기억 (narrative-memory 결과)
  if (params.narrativeContexts.length > 0) {
    sections.push(`## 캐릭터 기억\n${params.narrativeContexts.join('\n\n')}`);
  }

  // 세션 요약 (장기 기억)
  if (params.sessionSummary) {
    sections.push(`## 이전 대화 요약 (장기 기억)\n${params.sessionSummary}`);
  }

  // 디렉터 노트 (Pro 분석 결과 - 하이브리드 아키텍처)
  if (params.proAnalysis) {
    sections.push(`## 디렉터 노트 (이전 분석)\n${params.proAnalysis}`);
  }

  // 첫 등장 가이드
  const newChars = params.sceneState.presentCharacters.filter(
    name => !(params.previousPresentCharacters || []).includes(name)
  );
  const firstAppearance = newChars.length > 0
    ? `\n(첫등장: ${newChars.join(', ')} → 외모+등장묘사 필수)`
    : '';

  // 현재 상황
  sections.push(`## 상황\n${params.sceneState.location}, ${params.sceneState.time}\n등장: ${params.sceneState.presentCharacters.join(', ')}${firstAppearance}`);

  // 대화 이력 (과거 경계 명시 → 반복 방지)
  if (params.conversationHistory) {
    sections.push(`## 대화 이력 (이미 완료된 과거 — 아래 내용을 절대 반복하지 마세요)\n${params.conversationHistory}\n\n---\n[위는 과거 대화입니다. 같은 대사, 묘사, 표현을 재사용하지 마세요.]`);
  } else {
    sections.push(`## 대화 이력\n(시작)`);
  }

  // 유저 메시지 (현재 입력 — 이것에 대해서만 새 응답 생성)
  sections.push(`## ${params.userName}의 새 입력 (이것에 대해 새로운 응답을 생성하세요)\n${params.userMessage}`);

  return [{
    role: 'user' as const,
    parts: [{ text: sections.join('\n\n') }],
  }];
}

// ============================================================
// [3] 메인 스토리 응답 생성
// ============================================================

export async function generateStoryResponse(params: {
  systemInstruction: string;
  contents: Array<{ role: 'user'; parts: Array<{ text: string }> }>;
  characters: Array<{ id: string; name: string }>;
  sceneState: SceneState;
}): Promise<StoryResponse> {
  const startTime = Date.now();
  const { systemInstruction, contents, characters, sceneState } = params;

  console.log(`📤 Gemini 요청 (systemInstruction: ${systemInstruction.length}자, contents: ${JSON.stringify(contents).length}자)`);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await ai.models.generateContent({
        model: MODEL_PRO,
        config: {
          systemInstruction,
          temperature: 0.85,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 16384,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
          thinkingConfig: { thinkingBudget: -1 },
        },
        contents,
      });

      const text = result.text?.trim();

      // finishReason 체크
      const finishReason = (result as any).candidates?.[0]?.finishReason;
      if (finishReason && finishReason !== 'STOP') {
        console.warn(`⚠️ finishReason: ${finishReason} (토큰 부족 또는 필터)`);
      }

      if (!text || text.length === 0) {
        throw new Error(`EMPTY_RESPONSE (finishReason: ${finishReason || 'unknown'})`);
      }

      // JSON 파싱
      let parsed: { turns?: Array<{ type: string; character: string; content: string; emotion: string; emotionIntensity?: number }>; scene?: { location: string; time: string; presentCharacters: string[] } };
      try {
        parsed = JSON.parse(text);
      } catch {
        // MAX_TOKENS로 JSON이 잘린 경우 → 복구 시도
        if (finishReason === 'MAX_TOKENS') {
          console.warn('⚠️ MAX_TOKENS로 JSON 잘림, 복구 시도');
          parsed = repairTruncatedJson(text, sceneState);
        } else {
          console.warn('⚠️ JSON 파싱 실패, 폴백 파서 시도');
          parsed = parseMarkdownFallback(text, characters, sceneState);
        }
      }

      // turns 파싱
      const turns: StoryTurn[] = (parsed.turns || [])
        .map((turn: { type: string; character: string; content: string; emotion: string; emotionIntensity?: number }) => {
          if (turn.type === 'narrator') {
            return {
              type: 'narrator' as const,
              characterId: '',
              characterName: '',
              content: turn.content?.trim() || '',
              emotion: { primary: 'neutral', intensity: 0.5 },
            };
          }
          // dialogue
          const char = characters.find(
            (c) => c.name === turn.character ||
                   c.name.includes(turn.character) ||
                   turn.character?.includes(c.name) ||
                   c.name.toLowerCase() === turn.character?.toLowerCase()
          );
          return {
            type: 'dialogue' as const,
            characterId: char?.id || '',
            characterName: turn.character || '',
            content: turn.content?.trim() || '',
            emotion: {
              primary: EXPRESSION_TYPES.includes(turn.emotion as typeof EXPRESSION_TYPES[number]) ? turn.emotion : 'neutral',
              intensity: typeof turn.emotionIntensity === 'number'
                ? Math.max(0, Math.min(1, turn.emotionIntensity))
                : 0.5,
            },
          };
        })
        .filter((t: StoryTurn) => t.content && (t.type === 'narrator' || t.characterId));

      // turns가 비어있을 때 폴백
      if (turns.length === 0 && characters.length > 0) {
        turns.push({
          type: 'narrator',
          characterId: '', characterName: '',
          content: '잠시 정적이 흐른다.',
          emotion: { primary: 'neutral', intensity: 0.5 },
        });
        turns.push({
          type: 'dialogue',
          characterId: characters[0].id, characterName: characters[0].name,
          content: '*조용히 당신을 바라본다*',
          emotion: { primary: 'neutral', intensity: 0.5 },
        });
      }

      const elapsed = Date.now() - startTime;
      const usage = result.usageMetadata;
      const cachedTokens = (usage as any)?.cachedContentTokenCount || 0;
      const promptTokens = usage?.promptTokenCount || 0;
      const outputTokens = usage?.candidatesTokenCount || 0;
      const thinkingTokens = (usage as any)?.thoughtsTokenCount || 0;
      const cacheHitRate = promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0;
      console.log(`✅ Gemini 응답 완료 (${elapsed}ms)`);
      console.log(`   📊 토큰: prompt=${promptTokens}, cached=${cachedTokens} (${cacheHitRate}%), output=${outputTokens}, thinking=${thinkingTokens}, total=${usage?.totalTokenCount || '?'}`);
      if (cachedTokens > 0) console.log(`   💰 캐시 HIT! ${cachedTokens}토큰 90% 할인 적용`);

      const metadata: ResponseMetadata = {
        model: MODEL_PRO,
        thinking: thinkingTokens > 0,
        promptTokens,
        outputTokens,
        cachedTokens,
        thinkingTokens,
        totalTokens: usage?.totalTokenCount || 0,
        cacheHitRate,
        finishReason: finishReason || 'STOP',
        geminiApiMs: elapsed,
      };

      return {
        turns,
        updatedScene: {
          location: parsed.scene?.location || sceneState.location,
          time: parsed.scene?.time || sceneState.time,
          presentCharacters: parsed.scene?.presentCharacters || sceneState.presentCharacters,
        },
        metadata,
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ 시도 ${attempt}/${MAX_RETRIES}:`, lastError.message);

      const errorMessage = lastError.message.toLowerCase();
      if (errorMessage.includes('blocked') || errorMessage.includes('prohibited')) {
        console.warn('⚠️ 콘텐츠 필터 차단 - 폴백 응답');
        break;
      }

      if (attempt < MAX_RETRIES) {
        await delay(200);
        continue;
      }
      break;
    }
  }

  console.error('🚨 모든 재시도 실패:', lastError?.message);

  // 에러 원인을 그대로 전달 (디버깅용)
  throw new Error(lastError?.message || 'AI 응답 생성 실패');
}

// ============================================================
// [3-B] 스트리밍 스토리 응답 생성
// ============================================================

export type StreamEvent =
  | { type: 'turn'; turn: StoryTurn }
  | { type: 'scene'; scene: { location: string; time: string; presentCharacters: string[] } }
  | { type: 'metadata'; metadata: ResponseMetadata };

function parseSingleTurn(
  raw: { type: string; character: string; content: string; emotion: string },
  characters: Array<{ id: string; name: string }>,
): StoryTurn | null {
  const content = raw.content?.trim() || '';
  if (!content) return null;

  if (raw.type === 'narrator') {
    return {
      type: 'narrator',
      characterId: '',
      characterName: '',
      content,
      emotion: { primary: 'neutral', intensity: 0.5 },
    };
  }

  const char = characters.find(
    (c) => c.name === raw.character ||
           c.name.includes(raw.character) ||
           raw.character?.includes(c.name) ||
           c.name.toLowerCase() === raw.character?.toLowerCase()
  );
  if (!char?.id) return null;

  return {
    type: 'dialogue',
    characterId: char.id,
    characterName: raw.character || '',
    content,
    emotion: {
      primary: EXPRESSION_TYPES.includes(raw.emotion as typeof EXPRESSION_TYPES[number]) ? raw.emotion : 'neutral',
      intensity: 0.7,
    },
  };
}

/**
 * 스트리밍 JSON 버퍼에서 완성된 turn 객체를 점진적으로 추출
 * brace depth tracking으로 JSON 문자열 내 중괄호와 실제 구분자를 구별
 */
function extractNewTurnsFromBuffer(
  buffer: string,
  alreadyProcessed: number,
  characters: Array<{ id: string; name: string }>,
): { newTurns: StoryTurn[]; totalObjectCount: number } {
  const turnsMatch = buffer.match(/"turns"\s*:\s*\[/);
  if (!turnsMatch || turnsMatch.index === undefined) return { newTurns: [], totalObjectCount: alreadyProcessed };

  const arrayStart = turnsMatch.index + turnsMatch[0].length;
  const newTurns: StoryTurn[] = [];
  let pos = arrayStart;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let turnStart = -1;
  let objectCount = 0;

  while (pos < buffer.length) {
    const ch = buffer[pos];

    if (escapeNext) { escapeNext = false; pos++; continue; }
    if (ch === '\\' && inString) { escapeNext = true; pos++; continue; }
    if (ch === '"') { inString = !inString; pos++; continue; }
    if (inString) { pos++; continue; }

    if (ch === '{') {
      if (depth === 0) turnStart = pos;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && turnStart !== -1) {
        objectCount++;
        if (objectCount > alreadyProcessed) {
          try {
            const turnJson = buffer.substring(turnStart, pos + 1);
            const raw = JSON.parse(turnJson);
            const turn = parseSingleTurn(raw, characters);
            if (turn) newTurns.push(turn);
          } catch { /* 불완전한 JSON - 다음 청크에서 재시도 */ }
        }
        turnStart = -1;
      }
    } else if (ch === ']' && depth === 0) {
      break;
    }

    pos++;
  }

  return { newTurns, totalObjectCount: objectCount };
}

export async function* generateStoryResponseStream(params: {
  systemInstruction: string;
  contents: Array<{ role: 'user'; parts: Array<{ text: string }> }>;
  characters: Array<{ id: string; name: string }>;
  sceneState: SceneState;
}): AsyncGenerator<StreamEvent> {
  const startTime = Date.now();
  const { systemInstruction, contents, characters, sceneState } = params;

  console.log(`📤 Gemini 스트리밍 요청 (systemInstruction: ${systemInstruction.length}자)`);

  const stream = await ai.models.generateContentStream({
    model: MODEL_FLASH,
    config: {
      systemInstruction,
      temperature: 0.85,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      safetySettings: SAFETY_SETTINGS,
      thinkingConfig: { thinkingBudget: 1024 },  // 최소 사고: 반복 방지 + 맥락 파악 (0→1024)
    },
    contents,
  });

  let buffer = '';
  let processedObjectCount = 0;
  const emittedTurns: StoryTurn[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lastUsageMetadata: any = null;
  let lastFinishReason = 'STOP';

  let chunkIndex = 0;
  for await (const chunk of stream) {
    chunkIndex++;
    if (chunk.usageMetadata) lastUsageMetadata = chunk.usageMetadata;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = (chunk as any).candidates;
    if (candidates?.[0]?.finishReason) lastFinishReason = candidates[0].finishReason;

    // chunk.text가 thinking 청크에서 throw할 수 있음
    let text = '';
    try {
      text = chunk.text || '';
    } catch {
      // thinking 또는 빈 청크 - 건너뛰기
      continue;
    }
    if (!text) continue;
    buffer += text;

    // 새로 완성된 turn 객체 추출
    const { newTurns, totalObjectCount } = extractNewTurnsFromBuffer(
      buffer, processedObjectCount, characters
    );
    processedObjectCount = totalObjectCount;

    for (const turn of newTurns) {
      console.log(`   🔄 스트리밍 turn ${emittedTurns.length + 1}: ${turn.type} (chunk #${chunkIndex})`);
      emittedTurns.push(turn);
      yield { type: 'turn', turn };
    }
  }

  // 스트림 완료 - 누락된 turn + scene 파싱
  const fullText = buffer.trim();
  let parsedScene: { location: string; time: string; presentCharacters: string[] } | null = null;

  if (fullText) {
    try {
      const parsed = JSON.parse(fullText);

      // 스트리밍 중 누락된 turn 보완
      const allTurns = (parsed.turns || [])
        .map((raw: { type: string; character: string; content: string; emotion: string }) => parseSingleTurn(raw, characters))
        .filter((t: StoryTurn | null): t is StoryTurn => t !== null);

      for (let i = emittedTurns.length; i < allTurns.length; i++) {
        emittedTurns.push(allTurns[i]);
        yield { type: 'turn', turn: allTurns[i] };
      }

      parsedScene = {
        location: parsed.scene?.location || sceneState.location,
        time: parsed.scene?.time || sceneState.time,
        presentCharacters: parsed.scene?.presentCharacters || sceneState.presentCharacters,
      };
    } catch {
      if (lastFinishReason === 'MAX_TOKENS') {
        console.warn('⚠️ 스트리밍: MAX_TOKENS로 JSON 잘림, 복구 시도');
      }
      const repaired = repairTruncatedJson(fullText, sceneState);
      const repairedTurns = (repaired.turns || [])
        .map((raw: { type: string; character: string; content: string; emotion: string }) => parseSingleTurn(raw, characters))
        .filter((t: StoryTurn | null): t is StoryTurn => t !== null);

      for (let i = emittedTurns.length; i < repairedTurns.length; i++) {
        emittedTurns.push(repairedTurns[i]);
        yield { type: 'turn', turn: repairedTurns[i] };
      }

      parsedScene = repaired.scene;
    }
  }

  // 폴백: turn이 하나도 없을 때
  if (emittedTurns.length === 0 && characters.length > 0) {
    const fb1: StoryTurn = {
      type: 'narrator', characterId: '', characterName: '',
      content: '잠시 정적이 흐른다.',
      emotion: { primary: 'neutral', intensity: 0.5 },
    };
    const fb2: StoryTurn = {
      type: 'dialogue', characterId: characters[0].id, characterName: characters[0].name,
      content: '*조용히 당신을 바라본다*',
      emotion: { primary: 'neutral', intensity: 0.5 },
    };
    yield { type: 'turn', turn: fb1 };
    yield { type: 'turn', turn: fb2 };
    emittedTurns.push(fb1, fb2);
  }

  // Scene 업데이트
  yield {
    type: 'scene',
    scene: parsedScene || {
      location: sceneState.location,
      time: sceneState.time,
      presentCharacters: sceneState.presentCharacters,
    },
  };

  // 메타데이터
  const elapsed = Date.now() - startTime;
  const usage = lastUsageMetadata;
  const cachedTokens = usage?.cachedContentTokenCount || 0;
  const promptTokens = usage?.promptTokenCount || 0;
  const outputTokens = usage?.candidatesTokenCount || 0;
  const thinkingTokens = usage?.thoughtsTokenCount || 0;
  const cacheHitRate = promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0;

  console.log(`✅ Gemini 스트리밍 완료 (${elapsed}ms, ${emittedTurns.length} turns)`);
  console.log(`   📊 토큰: prompt=${promptTokens}, cached=${cachedTokens} (${cacheHitRate}%), output=${outputTokens}, thinking=${thinkingTokens}`);
  if (cachedTokens > 0) console.log(`   💰 캐시 HIT! ${cachedTokens}토큰 90% 할인 적용`);

  yield {
    type: 'metadata',
    metadata: {
      model: MODEL_FLASH,
      thinking: thinkingTokens > 0,
      promptTokens,
      outputTokens,
      cachedTokens,
      thinkingTokens,
      totalTokens: usage?.totalTokenCount || 0,
      cacheHitRate,
      finishReason: lastFinishReason,
      geminiApiMs: elapsed,
    },
  };
}

// ============================================================
// [3-C] Pro 백그라운드 분석 (하이브리드 아키텍처)
// ============================================================

export interface ProAnalysisResult {
  analysis: string;
  timeMs: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export async function generateProAnalysis(params: {
  systemInstruction: string;
  conversationSummary: string;
  currentTurnSummary: string;
  sceneState: SceneState;
  characterNames: string[];
}): Promise<ProAnalysisResult> {
  const { systemInstruction, conversationSummary, currentTurnSummary, sceneState, characterNames } = params;

  const analysisPrompt = `당신은 인터랙티브 스토리의 서사 디렉터입니다.
다음 턴의 AI가 참조할 "앞으로의 방향 가이드"를 작성하세요.

## 중요: 과거 묘사 금지
- 이미 일어난 장면이나 대사를 다시 묘사하지 마세요
- "~했다", "~흔들렸다" 같은 과거형 서술 대신, "~해야 한다", "~방향으로" 같은 지시형으로 작성하세요

## 작성 항목
1. 다음 턴 방향: 유저의 마지막 행동에 대해 어떤 새로운 전개가 자연스러운지
2. 캐릭터 내면 상태: 각 캐릭터(${characterNames.join(', ')})가 지금 느끼는 감정과 다음에 취할 태도
3. 미해결 복선: 아직 풀리지 않은 갈등이나 떡밥
4. 금지 사항: 이전 턴에서 이미 사용된 표현/대사 중 절대 반복하면 안 되는 것들
5. 관계 변화 분석: 이번 대화에서 각 캐릭터와 유저 사이의 관계 변화를 아래 JSON 형식으로 반드시 포함하세요.
변화가 없는 축은 0으로 표기. 값 범위: -10 ~ +10.
- trust(신뢰): 약속 이행/위반, 비밀 공유 시 변화
- affection(호감): 따뜻한/차가운 대화 시 변화
- respect(존경): 현명한 조언/무례한 행동 시 변화
- rivalry(경쟁심): 도전적/양보적 발언 시 변화
- familiarity(친숙도): 대화할 때마다 +0.5~1 기본 증가

\`\`\`json
{"relationshipDeltas": {"캐릭터이름": {"trust": 0, "affection": 1, "respect": 0, "rivalry": 0, "familiarity": 0.5}}}
\`\`\`

## 현재 장면
장소: ${sceneState.location}, 시간: ${sceneState.time}
등장인물: ${sceneState.presentCharacters.join(', ')}

## 이전 대화 요약
${conversationSummary}

## 이번 턴
${currentTurnSummary}

간결하고 핵심적으로, 미래 지향적으로 작성하세요 (500자 이내). 과거에 무슨 일이 있었는지가 아니라, 다음에 무엇을 해야 하는지에 집중하세요.`;

  const startTime = Date.now();
  console.log(`[ProAnalysis] 시작 (캐릭터: ${characterNames.join(', ')})`);

  try {
    const result = await ai.models.generateContent({
      model: MODEL_PRO,
      config: {
        systemInstruction,
        temperature: 0.5,
        maxOutputTokens: 4096,
        safetySettings: SAFETY_SETTINGS,
        thinkingConfig: { thinkingBudget: -1 },
      },
      contents: analysisPrompt,
    });

    const elapsed = Date.now() - startTime;
    const text = result.text?.trim() || '';
    const usage = result.usageMetadata;
    const thinkingTokens = (usage as any)?.thoughtsTokenCount || 0;
    console.log(`[ProAnalysis] 완료 (${elapsed}ms, thinking: ${thinkingTokens}, output: ${usage?.candidatesTokenCount || 0})`);

    return {
      analysis: text,
      timeMs: elapsed,
      promptTokens: usage?.promptTokenCount || 0,
      outputTokens: usage?.candidatesTokenCount || 0,
      thinkingTokens,
      totalTokens: usage?.totalTokenCount || 0,
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[ProAnalysis] 실패 (${elapsed}ms):`, error instanceof Error ? error.message : String(error));
    return { analysis: '', timeMs: elapsed, promptTokens: 0, outputTokens: 0, thinkingTokens: 0, totalTokens: 0 };
  }
}

// ============================================================
// [8] 임베딩 생성 (메모리 검색용)
// ============================================================

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 256;

/**
 * 텍스트를 256차원 임베딩 벡터로 변환
 * 실패 시 빈 배열 반환 (호출자가 폴백 처리)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    return result.embeddings?.[0]?.values || [];
  } catch (e) {
    console.error('[Embedding] failed:', e instanceof Error ? e.message : String(e));
    return [];
  }
}

// ============================================================
// 잘린 JSON 복구 (MAX_TOKENS 대응)
// ============================================================

function repairTruncatedJson(
  text: string,
  sceneState: SceneState,
): { turns: Array<{ type: string; character: string; content: string; emotion: string }>; scene: { location: string; time: string; presentCharacters: string[] } } {
  // turns 배열에서 완성된 항목만 추출
  const turns: Array<{ type: string; character: string; content: string; emotion: string }> = [];
  const turnPattern = /\{\s*"type"\s*:\s*"(narrator|dialogue)"\s*,\s*"character"\s*:\s*"([^"]*)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"emotion"\s*:\s*"([^"]*)"\s*\}/g;
  let match;
  while ((match = turnPattern.exec(text)) !== null) {
    turns.push({
      type: match[1],
      character: match[2],
      content: match[3].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
      emotion: match[4],
    });
  }

  console.log(`🔧 잘린 JSON에서 ${turns.length}개 턴 복구`);

  return {
    turns,
    scene: {
      location: sceneState.location,
      time: sceneState.time,
      presentCharacters: sceneState.presentCharacters,
    },
  };
}

// ============================================================
// Markdown 폴백 파서 (JSON 파싱 실패 시)
// ============================================================

function parseMarkdownFallback(
  text: string,
  characters: Array<{ id: string; name: string }>,
  sceneState: SceneState,
): { turns: Array<{ type: string; character: string; content: string; emotion: string }>; scene: { location: string; time: string; presentCharacters: string[] } } {
  const turns: Array<{ type: string; character: string; content: string; emotion: string }> = [];
  const scene = {
    location: sceneState.location,
    time: sceneState.time,
    presentCharacters: sceneState.presentCharacters,
  };

  // 나레이션 추출
  const narratorMatch = text.match(/\[나레이션\]\s*([\s\S]*?)(?=\[|$)/i);
  if (narratorMatch) {
    turns.push({ type: 'narrator', character: '', content: narratorMatch[1].trim(), emotion: 'neutral' });
  }

  // 캐릭터 대사 추출 → turns에 narrator/dialogue 교차 추가
  const characterPattern = /\[([^\|\]]+)\|?([^\]]*)\]\s*([\s\S]*?)(?=\[|$)/g;
  let match;

  while ((match = characterPattern.exec(text)) !== null) {
    const [, charName, emotionStr, content] = match;
    if (['나레이션', '장면', 'scene'].includes(charName.toLowerCase().trim())) continue;

    const char = characters.find(
      (c) => c.name === charName.trim() ||
             c.name.includes(charName.trim()) ||
             charName.trim().includes(c.name) ||
             c.name.toLowerCase() === charName.trim().toLowerCase()
    );

    if (char) {
      const emotion = emotionStr?.trim() || 'neutral';
      turns.push({
        type: 'dialogue',
        character: char.name,
        content: content.trim(),
        emotion: EXPRESSION_TYPES.includes(emotion as typeof EXPRESSION_TYPES[number]) ? emotion : 'neutral',
      });
    }
  }

  // 장면 추출
  const sceneMatch = text.match(/\[장면\]\s*([^\n]+)/i);
  if (sceneMatch) {
    const sceneParts = sceneMatch[1].split('|').map(s => s.trim());
    if (sceneParts.length >= 2) {
      scene.location = sceneParts[0] || sceneState.location;
      scene.time = sceneParts[1] || sceneState.time;
      if (sceneParts[2]) {
        scene.presentCharacters = sceneParts[2].split(',').map(s => s.trim());
      }
    }
  }

  return { turns, scene };
}

// ============================================================
// [4] 세션 요약 생성 (장기 기억)
// ============================================================

export async function generateSessionSummary(
  messages: Array<{ role: string; content: string; characterName?: string }>,
  existingSummary?: string
): Promise<string> {
  const messagesText = messages
    .map((m) => {
      if (m.characterName) return `${m.characterName}: ${m.content}`;
      return `${m.role === 'user' ? '유저' : '나레이터'}: ${m.content}`;
    })
    .join('\n')
    .substring(0, 4000);

  const prompt = `다음 대화를 3~5문장으로 핵심만 요약해주세요. 인물 관계 변화, 주요 사건, 현재 상황을 포함하세요.
${existingSummary ? `\n이전 요약:\n${existingSummary}\n` : ''}
최근 대화:
${messagesText}

요약:`;

  try {
    const result = await ai.models.generateContent({
      model: MODEL_FLASH,
      contents: prompt,
    });
    return result.text?.trim() || existingSummary || '';
  } catch (error) {
    console.error('[Summary] 요약 생성 실패:', error);
    return existingSummary || '';
  }
}

export default ai;
