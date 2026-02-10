/**
 * Gemini AI 통합 모듈 (v2 - 최적화)
 *
 * 경쟁사 가이드라인 적용:
 * - Markdown 기반 프롬프트 (토큰 효율)
 * - 정보/지시 분리 구조
 * - 간결한 규칙
 * - gemini-2.5-flash 사용 (품질 최적화)
 *
 * 프롬프트 계층:
 * [1] 세계관 (창작자 설정)
 * [2] 캐릭터 (personality + 기억)
 * [3] 로어북 (조건부)
 * [4] 상황 + 대화
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { replaceVariables } from './prompt-builder';

// Gemini API 클라이언트 초기화
if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Safety Settings - 창작 콘텐츠용 설정
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// 품질 최적화: gemini-2.5-flash (Google 공식 price-performance 최고 모델)
export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.85,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 2500,  // 풍부한 응답을 위한 토큰 증가
  },
  safetySettings,
});

// Pro 모델 (복잡한 시나리오용 백업)
export const geminiModelPro = genAI.getGenerativeModel({
  model: 'gemini-2.5-pro-preview-06-05',
  generationConfig: {
    temperature: 0.9,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
  },
  safetySettings,
});

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

// 유저 페르소나 타입
interface UserPersona {
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
}

interface StoryResponse {
  responses: Array<{
    characterId: string;
    characterName: string;
    content: string;
    emotion: {
      primary: string;
      intensity: number;
    };
  }>;
  narratorNote: string;
  updatedScene: {
    location: string;
    time: string;
    presentCharacters: string[];
  };
}

// ============================================================
// Rate Limit 관리 (Google 공식 권장: Truncated Exponential Backoff)
// 참고: https://cloud.google.com/vertex-ai/generative-ai/docs/error-code-429
// ============================================================

let lastRequestTime = 0;
let consecutiveErrors = 0;

// Google 공식 권장 설정 (강화 버전)
const MIN_REQUEST_INTERVAL = 500;   // 요청 간격 500ms (안정성 강화)
const BASE_DELAY = 2000;            // 기본 대기 2초
const MAX_DELAY = 60000;            // 최대 대기 60초
const MAX_RETRIES = 8;              // 최대 재시도 8회

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Truncated Exponential Backoff with Jitter
 * Google 공식 권장 방식
 */
function getBackoffDelay(attempt: number): number {
  // 지수 백오프: 1초, 2초, 4초, 8초, 16초...
  const exponentialDelay = BASE_DELAY * Math.pow(2, attempt - 1);
  // 최대 지연 시간으로 제한
  const cappedDelay = Math.min(exponentialDelay, MAX_DELAY);
  // Jitter 추가 (±25% 무작위 변동으로 요청 분산)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.round(cappedDelay + jitter);
}

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await delay(MIN_REQUEST_INTERVAL - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();
}

/**
 * Rate Limit 에러 시 호출 (Exponential Backoff)
 */
function handleRateLimitError(attempt: number): number {
  consecutiveErrors++;
  const waitTime = getBackoffDelay(attempt);
  console.log(`⏳ Rate Limit - ${(waitTime / 1000).toFixed(1)}초 대기... (시도 ${attempt}/${MAX_RETRIES})`);
  return waitTime;
}

/**
 * 성공 시 호출
 */
function handleSuccess(): void {
  consecutiveErrors = 0;
}

// ============================================================
// 유틸리티 함수
// ============================================================

// ============================================================
// 표정 타입 (FACS 기반) - 간소화
// ============================================================

const EXPRESSION_TYPES = [
  'neutral', 'smile', 'cold', 'angry', 'sad', 'happy', 'surprised', 'embarrassed'
] as const;

// ============================================================
// 응답 형식 (Markdown 기반 - 품질 최적화)
// ============================================================

// 상세한 응답 형식 (품질 우선)
const RESPONSE_FORMAT_GUIDE = `응답형식:
[나레이션] 2-4문장. 분위기, 감각, 환경 묘사 포함. 시각/청각/촉각 등 오감 활용
[캐릭터|표정] "대사 2-3문장 이상" *상세한 행동과 표정 묘사*
[장면] 장소|시간|인물들
표정: neutral/smile/cold/angry/sad/happy/surprised/embarrassed
규칙:
- 캐릭터 성격과 말투를 일관되게 유지
- 구체적인 행동과 감정 묘사 필수
- 상황에 맞는 자연스러운 반응`;

// ============================================================
// 프롬프트 빌더 함수들 (경쟁사 가이드 적용)
// ============================================================

/**
 * 캐릭터 섹션 생성 (품질 최적화 - 충분한 공간 확보)
 */
function buildCharacterSection(
  characters: CharacterInfo[],
  userName: string
): string {
  // 캐릭터 수에 따른 동적 길이 제한 (품질 우선)
  const maxLength = characters.length <= 2 ? 1500 :
                    characters.length <= 3 ? 1000 : 700;

  return characters
    .map((char) => {
      let prompt = replaceVariables(char.prompt, userName, char.name);

      if (prompt.length > maxLength) {
        prompt = prompt.substring(0, maxLength) + '...';
      }

      return `### ${char.name}\n${prompt}`;
    })
    .join('\n');
}

/**
 * 첫 등장 캐릭터 가이드 생성 (간소화)
 */
function buildFirstAppearanceGuide(
  presentCharacters: string[],
  previousPresentCharacters: string[]
): string {
  const newCharacters = presentCharacters.filter(
    charName => !previousPresentCharacters.includes(charName)
  );

  if (newCharacters.length === 0) return '';

  return `\n(첫등장: ${newCharacters.join(', ')} → 외모+등장묘사 필수)`;
}

/**
 * 동적 컨텍스트 섹션 생성 (품질 최적화 - 충분한 컨텍스트)
 */
function buildDynamicSections(params: {
  worldSetting: string;
  recentEvents: string[];
  lorebookContext: string;
}): string {
  const parts: string[] = [];

  if (params.worldSetting) {
    // 세계관 (1200자로 확장)
    const worldSettingTrimmed = params.worldSetting.length > 1200
      ? params.worldSetting.substring(0, 1200) + '...'
      : params.worldSetting;
    parts.push(`## 세계관\n${worldSettingTrimmed}`);
  }

  if (params.lorebookContext) {
    // 로어북 (800자로 확장)
    const lorebookTrimmed = params.lorebookContext.length > 800
      ? params.lorebookContext.substring(0, 800) + '...'
      : params.lorebookContext;
    parts.push(`## 참고\n${lorebookTrimmed}`);
  }

  return parts.join('\n\n');
}

/**
 * 유저 페르소나 섹션 생성
 * 캐릭터들이 유저를 어떤 사람으로 인지할지 정의
 */
function buildUserPersonaSection(persona: UserPersona): string {
  const parts: string[] = [];

  parts.push(`이름: ${persona.name}`);

  if (persona.age) {
    parts.push(`나이: ${persona.age}세`);
  }

  if (persona.gender && persona.gender !== 'private') {
    const genderText = persona.gender === 'male' ? '남성' : '여성';
    parts.push(`성별: ${genderText}`);
  }

  if (persona.description) {
    const descTrimmed = persona.description.length > 800
      ? persona.description.substring(0, 800) + '...'
      : persona.description;
    parts.push(`${descTrimmed}`);
  }

  return `## 유저 (${persona.name})
${parts.join('\n')}`;
}

// ============================================================
// Markdown 응답 파서
// ============================================================

interface ParsedMarkdownResponse {
  narrator: string;
  responses: Array<{
    character: string;
    content: string;
    emotion: { primary: string; intensity: number };
  }>;
  scene: {
    location: string;
    time: string;
    presentCharacters: string[];
  };
}

/**
 * Markdown 형식 응답 파싱
 * 형식:
 * [나레이션]
 * 내용...
 *
 * [캐릭터명|표정]
 * "대사" *행동*
 *
 * [장면]
 * 장소|시간|인물1,인물2
 */
function parseMarkdownResponse(
  text: string,
  characters: CharacterInfo[],
  sceneState: SceneState
): ParsedMarkdownResponse {
  const result: ParsedMarkdownResponse = {
    narrator: '',
    responses: [],
    scene: {
      location: sceneState.location,
      time: sceneState.time,
      presentCharacters: sceneState.presentCharacters,
    },
  };

  // [나레이션] 파싱
  const narratorMatch = text.match(/\[나레이션\]\s*([\s\S]*?)(?=\[|$)/i);
  if (narratorMatch) {
    result.narrator = narratorMatch[1].trim();
  }

  // [캐릭터|표정] 파싱
  const characterPattern = /\[([^\|\]]+)\|?([^\]]*)\]\s*([\s\S]*?)(?=\[|$)/g;
  let match;

  while ((match = characterPattern.exec(text)) !== null) {
    const [, charName, emotionStr, content] = match;

    // "나레이션", "장면" 키워드 스킵
    if (['나레이션', '장면', 'scene'].includes(charName.toLowerCase().trim())) {
      continue;
    }

    // 캐릭터 매칭
    const char = characters.find(
      (c) => c.name === charName.trim() ||
             c.name.includes(charName.trim()) ||
             charName.trim().includes(c.name) ||
             c.name.toLowerCase() === charName.trim().toLowerCase()
    );

    if (char) {
      const emotion = emotionStr?.trim() || 'neutral';
      result.responses.push({
        character: char.name,
        content: content.trim(),
        emotion: {
          primary: EXPRESSION_TYPES.includes(emotion as any) ? emotion : 'neutral',
          intensity: 0.7,
        },
      });
    }
  }

  // [장면] 파싱
  const sceneMatch = text.match(/\[장면\]\s*([^\n]+)/i);
  if (sceneMatch) {
    const sceneParts = sceneMatch[1].split('|').map(s => s.trim());
    if (sceneParts.length >= 2) {
      result.scene.location = sceneParts[0] || sceneState.location;
      result.scene.time = sceneParts[1] || sceneState.time;
      if (sceneParts[2]) {
        result.scene.presentCharacters = sceneParts[2].split(',').map(s => s.trim());
      }
    }
  }

  return result;
}

// ============================================================
// 메인 스토리 응답 생성 함수 (v2 - Markdown 기반)
// ============================================================

/**
 * 통합 스토리 응답 생성
 *
 * 경쟁사 가이드 적용:
 * - Markdown 기반 응답 (JSON 대비 토큰 효율 30%+)
 * - 간결한 프롬프트 구조
 * - gemini-2.5-flash 사용
 * - 유저 페르소나 반영
 */
export async function generateStoryResponse(
  characters: CharacterInfo[],
  conversationHistory: string,
  userMessage: string,
  userName: string,
  sceneState: SceneState,
  lorebookContext: string,
  worldSetting: string = '',
  previousPresentCharacters: string[] = [],
  userPersona?: UserPersona
): Promise<StoryResponse> {
  await waitForRateLimit();
  const startTime = Date.now();

  // 캐릭터 섹션 생성
  const characterSection = buildCharacterSection(characters, userName);

  // 첫 등장 가이드
  const firstAppearanceGuide = buildFirstAppearanceGuide(
    sceneState.presentCharacters,
    previousPresentCharacters
  );

  // 동적 섹션들
  const dynamicSections = buildDynamicSections({
    worldSetting,
    recentEvents: sceneState.recentEvents,
    lorebookContext,
  });

  // 유저 페르소나 섹션 (설정된 경우)
  const userPersonaSection = userPersona
    ? buildUserPersonaSection(userPersona)
    : '';

  // 대화 히스토리는 prompt-builder.ts에서 이미 토큰 기반으로 최적화됨
  // (formatConversationHistory: 최대 30개 메시지, 50000 토큰 제한)

  // === 프롬프트 구성 (품질 최적화 + 페르소나 반영) ===
  const prompt = `${dynamicSections}
${userPersonaSection ? '\n' + userPersonaSection + '\n' : ''}
## 캐릭터
${characterSection}

## 상황
${sceneState.location}, ${sceneState.time}
등장: ${sceneState.presentCharacters.join(', ')}${firstAppearanceGuide}

## 대화
${conversationHistory || '(시작)'}

## ${userName}
${userMessage}

---
${RESPONSE_FORMAT_GUIDE}`;

  console.log(`📤 Gemini Flash 요청 (프롬프트: ${prompt.length}자)`);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await waitForRateLimit();

      // Markdown 기반 응답 요청 (JSON 스키마 제거 → 속도 향상)
      const result = await geminiModel.generateContent(prompt);

      const response = await result.response;
      const candidates = response.candidates;

      if (!candidates || candidates.length === 0) {
        const blockReason = response.promptFeedback?.blockReason;
        if (blockReason) throw new Error(`BLOCKED: ${blockReason}`);
        throw new Error('NO_CANDIDATES');
      }

      const finishReason = candidates[0].finishReason;
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new Error(`BLOCKED: ${finishReason}`);
      }

      let text: string;
      try {
        text = response.text().trim();
      } catch {
        throw new Error(`TEXT_EXTRACT_FAILED: ${candidates[0]?.finishReason}`);
      }

      if (!text || text.length === 0) throw new Error('EMPTY_RESPONSE');

      // Markdown 응답 파싱
      const parsed = parseMarkdownResponse(text, characters, sceneState);

      // 응답 처리
      const responseWithIds = parsed.responses.map((r) => {
        const char = characters.find((c) => c.name === r.character);
        return {
          characterId: char?.id || '',
          characterName: r.character,
          content: r.content,
          emotion: r.emotion,
        };
      }).filter((r) => r.characterId);

      // 응답이 없으면 첫 번째 캐릭터로 폴백 (원본 텍스트 사용)
      if (responseWithIds.length === 0 && characters.length > 0) {
        const firstChar = characters[0];
        // 나레이션을 제외한 나머지를 캐릭터 응답으로 처리
        const contentWithoutNarrator = text
          .replace(/\[나레이션\][\s\S]*?(?=\[|$)/i, '')
          .replace(/\[장면\][\s\S]*/i, '')
          .trim();

        responseWithIds.push({
          characterId: firstChar.id,
          characterName: firstChar.name,
          content: contentWithoutNarrator || '*조용히 당신을 바라본다*',
          emotion: { primary: 'neutral', intensity: 0.5 },
        });
      }

      // 나레이션 처리
      let narratorNote = parsed.narrator;
      if (!narratorNote || narratorNote.length < 10) {
        narratorNote = `${userName}의 행동에 공기가 미묘하게 흔들린다.`;
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ Gemini 응답 완료 (${elapsed}ms)`);

      // 성공 시 에러 카운트 리셋
      handleSuccess();

      return {
        responses: responseWithIds,
        narratorNote,
        updatedScene: {
          location: parsed.scene.location,
          time: parsed.scene.time,
          presentCharacters: parsed.scene.presentCharacters,
        },
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ 시도 ${attempt}/${MAX_RETRIES}:`, lastError.message);

      const errorMessage = lastError.message.toLowerCase();
      const httpStatus = (lastError as any)?.status || (lastError as any)?.statusCode;

      // Rate Limit 처리 (Google 권장: Truncated Exponential Backoff)
      if (httpStatus === 429 || errorMessage.includes('429') || errorMessage.includes('resource exhausted')) {
        if (attempt < MAX_RETRIES) {
          const waitTime = handleRateLimitError(attempt);
          await delay(waitTime);
          continue;
        }
      }

      // 콘텐츠 차단 - 즉시 폴백
      if (errorMessage.includes('blocked') || errorMessage.includes('prohibited')) {
        console.warn('⚠️ 콘텐츠 필터 차단 - 폴백 응답');
        break;
      }

      // 그 외 에러는 한 번만 재시도
      if (attempt === 1) {
        await delay(500);
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
      responses: [{
        characterId: firstChar.id,
        characterName: firstChar.name,
        content: `*${firstChar.name}이(가) 당신을 바라본다*\n\n"..."`,
        emotion: { primary: 'neutral', intensity: 0.5 },
      }],
      narratorNote: '잠시 정적이 흐른다.',
      updatedScene: {
        location: sceneState.location,
        time: sceneState.time,
        presentCharacters: sceneState.presentCharacters,
      },
    };
  }

  throw new Error('AI 응답 생성 실패');
}

/**
 * 대화 요약 생성 (세션 요약용)
 *
 * 20턴마다 호출하여 대화 맥락을 압축
 */
export async function generateSessionSummary(
  messages: Array<{ role: string; content: string; characterName?: string }>,
  existingSummary?: string
): Promise<string> {
  await waitForRateLimit();

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
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    handleSuccess();
    return text.trim();
  } catch (error) {
    console.error('[Summary] 요약 생성 실패:', error);
    return existingSummary || '';
  }
}

export default genAI;
