/**
 * Gemini AI 통합 모듈 (v3 - 속도 최적화)
 *
 * 핵심:
 * - Markdown 기반 프롬프트 (토큰 효율)
 * - 세션 요약으로 장기 기억 지원
 * - 최소 재시도, 빠른 응답
 * - gemini-2.5-flash 사용
 *
 * 프롬프트 계층:
 * [1] 세계관 (창작자 설정)
 * [2] 캐릭터 (personality)
 * [3] 장기 기억 (세션 요약)
 * [4] 로어북 (조건부)
 * [5] 상황 + 대화
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

export const geminiModel = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  generationConfig: {
    temperature: 0.85,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 2500,
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
// 재시도 설정 (rate limit 제거 - 불필요한 딜레이 없음)
// ============================================================

const MAX_RETRIES = 2;  // 최대 2회 재시도

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
// 응답 형식
// ============================================================

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
// 프롬프트 빌더
// ============================================================

function buildCharacterSection(characters: CharacterInfo[], userName: string): string {
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

function buildDynamicSections(params: {
  worldSetting: string;
  lorebookContext: string;
}): string {
  const parts: string[] = [];

  if (params.worldSetting) {
    const trimmed = params.worldSetting.length > 1200
      ? params.worldSetting.substring(0, 1200) + '...'
      : params.worldSetting;
    parts.push(`## 세계관\n${trimmed}`);
  }

  if (params.lorebookContext) {
    const trimmed = params.lorebookContext.length > 800
      ? params.lorebookContext.substring(0, 800) + '...'
      : params.lorebookContext;
    parts.push(`## 참고\n${trimmed}`);
  }

  return parts.join('\n\n');
}

function buildUserPersonaSection(persona: UserPersona): string {
  const parts: string[] = [];
  parts.push(`이름: ${persona.name}`);
  if (persona.age) parts.push(`나이: ${persona.age}세`);
  if (persona.gender && persona.gender !== 'private') {
    parts.push(`성별: ${persona.gender === 'male' ? '남성' : '여성'}`);
  }
  if (persona.description) {
    const trimmed = persona.description.length > 800
      ? persona.description.substring(0, 800) + '...'
      : persona.description;
    parts.push(`${trimmed}`);
  }
  return `## 유저 (${persona.name})\n${parts.join('\n')}`;
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

  const narratorMatch = text.match(/\[나레이션\]\s*([\s\S]*?)(?=\[|$)/i);
  if (narratorMatch) {
    result.narrator = narratorMatch[1].trim();
  }

  const characterPattern = /\[([^\|\]]+)\|?([^\]]*)\]\s*([\s\S]*?)(?=\[|$)/g;
  let match;

  while ((match = characterPattern.exec(text)) !== null) {
    const [, charName, emotionStr, content] = match;

    if (['나레이션', '장면', 'scene'].includes(charName.toLowerCase().trim())) {
      continue;
    }

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
// 메인 스토리 응답 생성 함수 (v3 - 장기 기억 + 속도 최적화)
// ============================================================

export async function generateStoryResponse(
  characters: CharacterInfo[],
  conversationHistory: string,
  userMessage: string,
  userName: string,
  sceneState: SceneState,
  lorebookContext: string,
  worldSetting: string = '',
  previousPresentCharacters: string[] = [],
  userPersona?: UserPersona,
  sessionSummary?: string
): Promise<StoryResponse> {
  const startTime = Date.now();

  const characterSection = buildCharacterSection(characters, userName);
  const firstAppearanceGuide = buildFirstAppearanceGuide(
    sceneState.presentCharacters,
    previousPresentCharacters
  );
  const dynamicSections = buildDynamicSections({ worldSetting, lorebookContext });
  const userPersonaSection = userPersona ? buildUserPersonaSection(userPersona) : '';

  // 장기 기억 섹션 (세션 요약)
  const memorySummarySection = sessionSummary
    ? `## 이전 대화 요약 (장기 기억)\n${sessionSummary}`
    : '';

  const prompt = `${dynamicSections}
${userPersonaSection ? '\n' + userPersonaSection + '\n' : ''}
## 캐릭터
${characterSection}
${memorySummarySection ? '\n' + memorySummarySection + '\n' : ''}
## 상황
${sceneState.location}, ${sceneState.time}
등장: ${sceneState.presentCharacters.join(', ')}${firstAppearanceGuide}

## 대화
${conversationHistory || '(시작)'}

## ${userName}
${userMessage}

---
${RESPONSE_FORMAT_GUIDE}`;

  console.log(`📤 Gemini 요청 (${prompt.length}자)`);

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
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

      const parsed = parseMarkdownResponse(text, characters, sceneState);

      const responseWithIds = parsed.responses.map((r) => {
        const char = characters.find((c) => c.name === r.character);
        return {
          characterId: char?.id || '',
          characterName: r.character,
          content: r.content,
          emotion: r.emotion,
        };
      }).filter((r) => r.characterId);

      // 응답이 없으면 첫 번째 캐릭터로 폴백
      if (responseWithIds.length === 0 && characters.length > 0) {
        const firstChar = characters[0];
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

      let narratorNote = parsed.narrator;
      if (!narratorNote || narratorNote.length < 10) {
        narratorNote = `${userName}의 행동에 공기가 미묘하게 흔들린다.`;
      }

      const elapsed = Date.now() - startTime;
      console.log(`✅ Gemini 응답 완료 (${elapsed}ms)`);

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

      // 콘텐츠 차단 → 즉시 폴백 (재시도 무의미)
      if (errorMessage.includes('blocked') || errorMessage.includes('prohibited')) {
        console.warn('⚠️ 콘텐츠 필터 차단 - 폴백 응답');
        break;
      }

      // 429 포함 모든 에러 → 짧은 대기 후 재시도
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
 * 대화 요약 생성 (세션 요약용 - 장기 기억)
 * 20턴마다 호출하여 대화 맥락을 압축
 */
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
    const result = await geminiModel.generateContent(prompt);
    const text = result.response.text();
    return text.trim();
  } catch (error) {
    console.error('[Summary] 요약 생성 실패:', error);
    return existingSummary || '';
  }
}

export default genAI;
