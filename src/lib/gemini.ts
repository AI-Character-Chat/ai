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
      description: '응답 턴 배열',
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
            description: '턴 내용',
          },
          sensory: {
            type: Type.STRING,
            description: 'narrator일 때 오감(시각·청각·촉각·후각) 묘사. dialogue일 때 빈 문자열.',
          },
          emotion: {
            type: Type.STRING,
            description: 'dialogue일 때 표정. narrator일 때 "neutral".',
          },
          emotionIntensity: {
            type: Type.NUMBER,
            description: '0.0~1.0',
          },
        },
        required: ['type', 'character', 'content', 'sensory', 'emotion', 'emotionIntensity'],
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
          description: '장면에 있는 캐릭터 이름',
        },
      },
      required: ['location', 'time', 'presentCharacters'],
    },
    extractedFacts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '유저가 밝힌 새 정보. 없으면 빈 배열.',
    },
  },
  required: ['turns', 'scene', 'extractedFacts'],
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

  // 응답 규칙 (2줄 체제: role + compound)
  const un = params.userName;
  parts.push(`당신은 유저(${un})와 함께 인터랙티브 소설을 공동 집필하는 작가입니다.
나레이션에서 유저를 "${un}"으로 지칭하세요.
각 캐릭터의 말투(반말/존댓말/은어)는 캐릭터 설정 그대로 절대 바꾸지 말고, 유저의 행동·발화를 그대로 수용하여 나레이션과 캐릭터 반응에 구체적으로 반영하며, 매 턴 새로운 정보·장소 이동·인물 등장·감정 전환 중 하나 이상으로 상황을 진전시키세요.`);

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
}): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
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

  // 현재 상황 (데이터만)
  sections.push(`## 상황\n${params.sceneState.location}, ${params.sceneState.time}\n등장: ${params.sceneState.presentCharacters.join(', ')}`);

  // 대화 이력
  if (params.conversationHistory) {
    sections.push(`## 대화 이력\n${params.conversationHistory}`);
  } else {
    sections.push(`## 대화 이력\n(시작)`);
  }

  // 유저 메시지
  sections.push(`## ${params.userName}의 입력\n${params.userMessage}`);

  // post-history 리마인더
  sections.push(`※ 각 캐릭터 말투를 설정 그대로 유지`);

  return [
    {
      role: 'user' as const,
      parts: [{ text: sections.join('\n\n') }],
    },
  ];
}

// ============================================================
// [3] 메인 스토리 응답 생성
// ============================================================

export async function generateStoryResponse(params: {
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
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
          temperature: 1.4,
          topP: 0.95,
          topK: 50,
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

      // SAFETY 필터 차단 → 재시도
      if (finishReason === 'SAFETY') {
        throw new Error(`SAFETY_BLOCK (attempt ${attempt})`);
      }

      if (!text || text.length === 0) {
        throw new Error(`EMPTY_RESPONSE (finishReason: ${finishReason || 'unknown'})`);
      }

      // JSON 파싱
      let parsed: { turns?: Array<{ type: string; character: string; content: string; sensory?: string; emotion: string; emotionIntensity?: number }>; scene?: { location: string; time: string; presentCharacters: string[] } };
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
        .map((turn: { type: string; character: string; content: string; sensory?: string; emotion: string; emotionIntensity?: number }) => {
          if (turn.type === 'narrator') {
            const sensory = turn.sensory?.trim() || '';
            const rawContent = turn.content?.trim() || '';
            const mergedContent = sensory ? `${sensory} ${rawContent}` : rawContent;
            return {
              type: 'narrator' as const,
              characterId: '',
              characterName: '',
              content: mergedContent,
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
      if (errorMessage.includes('blocked') || errorMessage.includes('prohibited') || errorMessage.includes('safety')) {
        console.warn(`⚠️ 콘텐츠 필터 차단 (시도 ${attempt}) - 온도 높여서 재시도`);
        if (attempt < MAX_RETRIES) {
          await delay(300);
          continue; // 온도는 매 시도마다 동일하지만 재시도로 다른 토큰 샘플링
        }
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
  | { type: 'turn-start'; turnIndex: number; turnType: 'narrator' | 'dialogue'; characterName: string; characterId: string }
  | { type: 'turn-delta'; turnIndex: number; content: string }
  | { type: 'scene'; scene: { location: string; time: string; presentCharacters: string[] } }
  | { type: 'extractedFacts'; facts: string[] }
  | { type: 'metadata'; metadata: ResponseMetadata };

function parseSingleTurn(
  raw: { type: string; character: string; content: string; sensory?: string; emotion: string; emotionIntensity?: number },
  characters: Array<{ id: string; name: string }>,
): StoryTurn | null {
  const rawContent = raw.content?.trim() || '';
  const sensory = raw.type === 'narrator' ? (raw.sensory?.trim() || '') : '';
  const content = sensory ? `${sensory} ${rawContent}` : rawContent;
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

  // AI가 반환한 emotionIntensity 사용 (없으면 0.7 폴백)
  const intensity = typeof raw.emotionIntensity === 'number'
    ? Math.max(0, Math.min(1, raw.emotionIntensity))
    : 0.7;

  return {
    type: 'dialogue',
    characterId: char.id,
    characterName: raw.character || '',
    content,
    emotion: {
      primary: EXPRESSION_TYPES.includes(raw.emotion as typeof EXPRESSION_TYPES[number]) ? raw.emotion : 'neutral',
      intensity,
    },
  };
}

/**
 * 스트리밍 JSON 버퍼에서 완성된 turn 객체를 점진적으로 추출
 * brace depth tracking으로 JSON 문자열 내 중괄호와 실제 구분자를 구별
 */
export function extractNewTurnsFromBuffer(
  buffer: string,
  alreadyProcessed: number,
  characters: Array<{ id: string; name: string }>,
): { newTurns: StoryTurn[]; totalObjectCount: number; lastCompleteEndPos: number } {
  const turnsMatch = buffer.match(/"turns"\s*:\s*\[/);
  if (!turnsMatch || turnsMatch.index === undefined) return { newTurns: [], totalObjectCount: alreadyProcessed, lastCompleteEndPos: 0 };

  const arrayStart = turnsMatch.index + turnsMatch[0].length;
  const newTurns: StoryTurn[] = [];
  let pos = arrayStart;
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let turnStart = -1;
  let objectCount = 0;
  let lastCompleteEnd = arrayStart;

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
        lastCompleteEnd = pos + 1;
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

  return { newTurns, totalObjectCount: objectCount, lastCompleteEndPos: lastCompleteEnd };
}

/**
 * 스트리밍 중 아직 완성되지 않은 turn 객체에서 type/character/content 추출
 * 토큰 단위 스트리밍을 위해 부분 content를 점진적으로 전달
 */
function extractPartialTurnInfo(
  buffer: string,
  searchStartPos: number,
  characters: Array<{ id: string; name: string }>,
): { turnType: string; characterName: string; characterId: string; contentSoFar: string } | null {
  const remaining = buffer.substring(searchStartPos);

  // 불완전한 turn 객체의 시작 { 찾기
  const objStart = remaining.indexOf('{');
  if (objStart === -1) return null;
  const partial = remaining.substring(objStart);

  // type 필드 추출 (필수)
  const typeMatch = partial.match(/"type"\s*:\s*"([^"]*)"/);
  if (!typeMatch) return null;

  // character 필드 추출
  const charMatch = partial.match(/"character"\s*:\s*"([^"]*)"/);
  const charName = charMatch ? charMatch[1] : '';

  // content 필드에서 부분 텍스트 추출
  const contentKeyMatch = partial.match(/"content"\s*:\s*"/);
  let content = '';
  if (contentKeyMatch && contentKeyMatch.index !== undefined) {
    const valueStart = contentKeyMatch.index + contentKeyMatch[0].length;
    let i = valueStart;
    while (i < partial.length) {
      const ch = partial[i];
      if (ch === '\\') {
        if (i + 1 < partial.length) {
          const next = partial[i + 1];
          if (next === '"') content += '"';
          else if (next === 'n') content += '\n';
          else if (next === 't') content += '\t';
          else if (next === '\\') content += '\\';
          else if (next === '/') content += '/';
          else content += next;
          i += 2;
        } else {
          break; // 불완전한 이스케이프 시퀀스 — 다음 청크에서 처리
        }
      } else if (ch === '"') {
        break; // content 문자열 종료
      } else {
        content += ch;
        i++;
      }
    }
  }

  // 캐릭터 ID 해석
  let characterId = '';
  if (typeMatch[1] !== 'narrator' && charName) {
    const char = characters.find(
      (c) => c.name === charName ||
             c.name.includes(charName) ||
             charName.includes(c.name) ||
             c.name.toLowerCase() === charName.toLowerCase()
    );
    characterId = char?.id || '';
  }

  return {
    turnType: typeMatch[1],
    characterName: charName,
    characterId,
    contentSoFar: content,
  };
}

export async function* generateStoryResponseStream(params: {
  systemInstruction: string;
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
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
      temperature: 1.2,
      topP: 0.95,
      topK: 50,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      safetySettings: SAFETY_SETTINGS,
      thinkingConfig: { thinkingBudget: 512 },
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
  // 토큰 단위 스트리밍: 부분 turn 추적
  let currentStreamingTurnType: string | null = null;
  let lastPartialContentLength = 0;

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
    const { newTurns, totalObjectCount, lastCompleteEndPos } = extractNewTurnsFromBuffer(
      buffer, processedObjectCount, characters
    );

    // 완성된 turn 처리
    if (newTurns.length > 0) {
      // 이전 부분 스트리밍 상태 초기화
      currentStreamingTurnType = null;
      lastPartialContentLength = 0;
      processedObjectCount = totalObjectCount;

      for (const turn of newTurns) {
        console.log(`   🔄 스트리밍 turn ${emittedTurns.length + 1}: ${turn.type} (chunk #${chunkIndex})`);
        emittedTurns.push(turn);
        yield { type: 'turn', turn };
      }
    }

    // 토큰 단위 스트리밍: 아직 완성되지 않은 turn에서 부분 content 추출
    const partial = extractPartialTurnInfo(buffer, lastCompleteEndPos, characters);
    if (partial && partial.turnType) {
      if (currentStreamingTurnType === null) {
        // 새 turn 시작 감지 — turn-start 이벤트
        currentStreamingTurnType = partial.turnType;
        yield {
          type: 'turn-start',
          turnIndex: emittedTurns.length,
          turnType: partial.turnType === 'narrator' ? 'narrator' : 'dialogue',
          characterName: partial.characterName,
          characterId: partial.characterId,
        };
      }

      // content가 성장했으면 delta 전송
      if (partial.contentSoFar.length > lastPartialContentLength) {
        const delta = partial.contentSoFar.substring(lastPartialContentLength);
        yield {
          type: 'turn-delta',
          turnIndex: emittedTurns.length,
          content: delta,
        };
        lastPartialContentLength = partial.contentSoFar.length;
      }
    }
  }

  // 스트림 완료 - 누락된 turn + scene + extractedFacts 파싱
  const fullText = buffer.trim();
  let parsedScene: { location: string; time: string; presentCharacters: string[] } | null = null;
  let parsedFacts: string[] = [];

  if (fullText) {
    try {
      const parsed = JSON.parse(fullText);

      // 스트리밍 중 누락된 turn 보완
      const allTurns = (parsed.turns || [])
        .map((raw: { type: string; character: string; content: string; sensory?: string; emotion: string; emotionIntensity?: number }) => parseSingleTurn(raw, characters))
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

      // extractedFacts 파싱
      if (Array.isArray(parsed.extractedFacts)) {
        parsedFacts = parsed.extractedFacts.filter((f: unknown) => typeof f === 'string' && f.length > 0);
      }
    } catch {
      if (lastFinishReason === 'MAX_TOKENS') {
        console.warn('⚠️ 스트리밍: MAX_TOKENS로 JSON 잘림, 복구 시도');
      }
      const repaired = repairTruncatedJson(fullText, sceneState);
      const repairedTurns = (repaired.turns || [])
        .map((raw: { type: string; character: string; content: string; sensory?: string; emotion: string; emotionIntensity?: number }) => parseSingleTurn(raw, characters))
        .filter((t: StoryTurn | null): t is StoryTurn => t !== null);

      for (let i = emittedTurns.length; i < repairedTurns.length; i++) {
        emittedTurns.push(repairedTurns[i]);
        yield { type: 'turn', turn: repairedTurns[i] };
      }

      parsedScene = repaired.scene;
      // repaired JSON에서도 extractedFacts 시도
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray((repaired as any).extractedFacts)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parsedFacts = (repaired as any).extractedFacts.filter((f: unknown) => typeof f === 'string' && f.length > 0);
      }
    }
  }

  // SAFETY 차단 감지
  if (emittedTurns.length === 0 && (lastFinishReason === 'SAFETY' || lastFinishReason === 'RECITATION')) {
    console.warn(`⚠️ 스트리밍 SAFETY 차단 (finishReason: ${lastFinishReason}) — 폴백 응답 사용`);
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

  // extractedFacts (유저가 밝힌 새로운 정보)
  if (parsedFacts.length > 0) {
    console.log(`   🧠 추출된 사실: ${parsedFacts.join(', ')}`);
  }
  yield { type: 'extractedFacts', facts: parsedFacts };

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
  memoryContext?: string;
}): Promise<ProAnalysisResult> {
  const { systemInstruction, conversationSummary, currentTurnSummary, sceneState, characterNames, memoryContext } = params;

  const analysisPrompt = `이번 턴의 대화를 분석하고, 각 캐릭터와 유저 사이의 관계 변화를 JSON으로 반환하세요.

등장인물: ${characterNames.join(', ')}
장소: ${sceneState.location}, 시간: ${sceneState.time}

이전 요약: ${conversationSummary}
${memoryContext ? `유저 정보: ${memoryContext}\n` : ''}이번 턴: ${currentTurnSummary}

관계 변화를 아래 형식으로 출력 (변화 없는 축은 0, 범위 -10~+10):
\`\`\`json
{"relationshipDeltas": {"캐릭터이름": {"trust": 0, "affection": 0, "respect": 0, "rivalry": 0, "familiarity": 0.5}}}
\`\`\``;

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
    const values = result.embeddings?.[0]?.values || [];
    if (values.length === 0) {
      console.warn(`[Embedding] empty result for text (${text.length}자): "${text.substring(0, 50)}..."`);
    }
    return values;
  } catch (e) {
    console.error('[Embedding] failed for text:', text.substring(0, 50), '| error:', e instanceof Error ? e.message : String(e));
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

  const prompt = `3~5문장 요약.
${existingSummary ? `이전: ${existingSummary}\n` : ''}${messagesText}`;

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
