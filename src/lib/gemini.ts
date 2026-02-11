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

import { GoogleGenAI, Type } from '@google/genai';
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
            description: 'narrator: 1-2문장 행동/반응 묘사. dialogue: 대사 1-3문장.',
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
turns 배열에 narrator와 dialogue를 교차 배치하여 드라마처럼 응답하세요.

## 최우선 규칙: 유저 행동 중심
- 유저의 메시지/행동이 이번 응답의 핵심 사건이다. 유저가 한 말이나 행동을 절대 무시하지 말 것.
- 첫 번째 narrator 턴은 반드시 유저의 행동에 대한 즉각적인 반응/결과를 묘사할 것.
- 모든 캐릭터는 유저의 행동에 먼저 반응한 뒤, 서로 상호작용할 것.
- 이전 대화 흐름을 이어가되, 유저의 새 입력이 장면 전환의 트리거가 되어야 한다.

## 응답 규칙
- turns 배열에 최소 5개 이상의 턴을 생성
- narrator와 dialogue를 번갈아 배치 (narrator → dialogue → narrator → dialogue ...)
- narrator: 캐릭터의 행동, 표정, 물리적 반응 묘사 (1-2문장). 환경 반복 금지.
- dialogue: 캐릭터의 대사 (1-3문장). 대사 안에 *행동묘사* 넣지 말 것.
- 같은 캐릭터가 여러 번 발화 가능 (각각 다른 맥락에서)
- 캐릭터 간 상호작용 필수: 서로에게 반응하고, 의견 충돌하고, 대화하는 장면
- 현재 장면에 없는 캐릭터도 상황에 맞으면 등장시킬 수 있음 (narrator로 등장 묘사 후 dialogue)
- 새 캐릭터 등장 시 외모와 등장 방식을 narrator에서 묘사
- 매 턴 새로운 정보, 이벤트, 또는 긴장감 요소를 1개 이상 도입
- 캐릭터 성격과 말투를 절대 일관되게 유지
- 표정: neutral/smile/cold/angry/sad/happy/surprised/embarrassed`);

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
          maxOutputTokens: 4000,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
        contents,
      });

      const text = result.text?.trim();

      if (!text || text.length === 0) {
        throw new Error('EMPTY_RESPONSE');
      }

      // JSON 파싱
      let parsed: { turns?: Array<{ type: string; character: string; content: string; emotion: string }>; scene?: { location: string; time: string; presentCharacters: string[] } };
      try {
        parsed = JSON.parse(text);
      } catch {
        // JSON 파싱 실패 → 폴백 (Markdown 파서)
        console.warn('⚠️ JSON 파싱 실패, 폴백 파서 시도');
        parsed = parseMarkdownFallback(text, characters, sceneState);
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

  // 최종 폴백
  if (characters.length > 0) {
    const firstChar = characters[0];
    return {
      turns: [
        {
          type: 'narrator', characterId: '', characterName: '',
          content: '잠시 정적이 흐른다.',
          emotion: { primary: 'neutral', intensity: 0.5 },
        },
        {
          type: 'dialogue',
          characterId: firstChar.id, characterName: firstChar.name,
          content: `*${firstChar.name}이(가) 당신을 바라본다*\n\n"..."`,
          emotion: { primary: 'neutral', intensity: 0.5 },
        },
      ],
      updatedScene: {
        location: sceneState.location,
        time: sceneState.time,
        presentCharacters: sceneState.presentCharacters,
      },
    };
  }

  throw new Error('AI 응답 생성 실패');
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
