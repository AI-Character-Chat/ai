/**
 * Gemini AI 통합 모듈 (v4 - Context Caching + Narrative Memory)
 *
 * 핵심:
 * - @google/genai SDK (신규)
 * - gemini-2.5-flash + implicit caching (systemInstruction)
 * - systemInstruction(정적, 캐시됨) + contents(동적) 2계층 분리
 * - JSON 응답 모드 (Markdown 파싱 제거)
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

const MODEL = 'gemini-2.5-flash';

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

export interface StoryResponse {
  turns: StoryTurn[];
  updatedScene: {
    location: string;
    time: string;
    presentCharacters: string[];
  };
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
        },
        required: ['type', 'character', 'content', 'emotion'],
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
  parts.push(`당신은 인터랙티브 스토리 AI입니다.
turns 배열에 narrator와 dialogue를 교차 배치하세요.

## 핵심 원칙 (우선순위 순)
1. 유저의 말/행동이 이번 응답의 중심 사건이다. 첫 narrator에서 유저 행동의 결과를 즉시 묘사하라.
2. 한 응답에 1~2명에 집중하라. 한 캐릭터가 깊이 반응하는 것이 여러 캐릭터가 한 마디씩 하는 것보다 낫다.
3. 다른 캐릭터는 장소·동기·관계가 뒷받침될 때만 등장시켜라. 모든 캐릭터를 매번 등장시키지 마라.

## 형식
- turns 5~8개, narrator와 dialogue 교차
- narrator: 감각(소리/냄새/촉감/빛) + 캐릭터의 내면 심리 묘사. 2-3문장.
- dialogue: 반드시 2-4문장. 세계관 용어와 상황 디테일을 자연스럽게 녹여서. 한 문장 대사 금지.
- 새 캐릭터 등장 시 narrator에서 등장 이유와 외모 묘사
- 표정: neutral/smile/cold/angry/sad/happy/surprised/embarrassed

## 반복 금지 (최우선)
- 대화 이력을 확인하라. 이전 턴에서 이미 사용한 대사나 표현은 이번 턴에서 절대 다시 쓰지 마라.
- 캐릭터의 대표 표현/캐치프레이즈는 첫 등장 시 1회만 허용. 이후에는 같은 뜻을 다른 말로 표현하라.
- 한 응답 안에서도 같은 표현을 두 번 쓰지 마라.
- 대사는 반드시 2문장 이상. 캐릭터의 의도와 상황 맥락을 담아라.`);

  // 세계관 (작품별 고정)
  if (params.worldSetting) {
    const trimmed = params.worldSetting.length > 2000
      ? params.worldSetting.substring(0, 2000) + '...'
      : params.worldSetting;
    parts.push(`## 세계관\n${trimmed}`);
  }

  // 캐릭터 페르소나 (작품별 고정)
  if (params.characters.length > 0) {
    const maxLength = params.characters.length <= 2 ? 1500 :
                      params.characters.length <= 3 ? 1000 : 700;

    const charSection = params.characters
      .map((char) => {
        let prompt = replaceVariables(char.prompt, params.userName, char.name);
        if (prompt.length > maxLength) {
          prompt = prompt.substring(0, maxLength) + '...';
        }
        return `### ${char.name}\n${prompt}`;
      })
      .join('\n\n');

    parts.push(`## 캐릭터\n${charSection}`);
  }

  // 로어북 정적 항목 (작품별 고정)
  if (params.lorebookStatic) {
    const trimmed = params.lorebookStatic.length > 1000
      ? params.lorebookStatic.substring(0, 1000) + '...'
      : params.lorebookStatic;
    parts.push(`## 참고 설정\n${trimmed}`);
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
      const trimmed = params.userPersona.description.length > 800
        ? params.userPersona.description.substring(0, 800) + '...'
        : params.userPersona.description;
      personaParts.push(trimmed);
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

  // 첫 등장 가이드
  const newChars = params.sceneState.presentCharacters.filter(
    name => !(params.previousPresentCharacters || []).includes(name)
  );
  const firstAppearance = newChars.length > 0
    ? `\n(첫등장: ${newChars.join(', ')} → 외모+등장묘사 필수)`
    : '';

  // 현재 상황
  sections.push(`## 상황\n${params.sceneState.location}, ${params.sceneState.time}\n등장: ${params.sceneState.presentCharacters.join(', ')}${firstAppearance}`);

  // 대화 이력
  sections.push(`## 대화\n${params.conversationHistory || '(시작)'}`);

  // 유저 메시지
  sections.push(`## ${params.userName}\n${params.userMessage}`);

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
        model: MODEL,
        config: {
          systemInstruction,
          temperature: 0.85,
          topP: 0.9,
          topK: 40,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          safetySettings: SAFETY_SETTINGS,
          thinkingConfig: { thinkingBudget: 0 },
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
      let parsed: { turns?: Array<{ type: string; character: string; content: string; emotion: string }>; scene?: { location: string; time: string; presentCharacters: string[] } };
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
        .map((turn: { type: string; character: string; content: string; emotion: string }) => {
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
              intensity: 0.7,
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
      const cacheHitRate = promptTokens > 0 ? Math.round((cachedTokens / promptTokens) * 100) : 0;
      console.log(`✅ Gemini 응답 완료 (${elapsed}ms)`);
      console.log(`   📊 토큰: prompt=${promptTokens}, cached=${cachedTokens} (${cacheHitRate}%), output=${outputTokens}, total=${usage?.totalTokenCount || '?'}`);
      if (cachedTokens > 0) console.log(`   💰 캐시 HIT! ${cachedTokens}토큰 90% 할인 적용`);

      return {
        turns,
        updatedScene: {
          location: parsed.scene?.location || sceneState.location,
          time: parsed.scene?.time || sceneState.time,
          presentCharacters: parsed.scene?.presentCharacters || sceneState.presentCharacters,
        },
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
      model: MODEL,
      contents: prompt,
    });
    return result.text?.trim() || existingSummary || '';
  } catch (error) {
    console.error('[Summary] 요약 생성 실패:', error);
    return existingSummary || '';
  }
}

export default ai;
