import { Character, LorebookEntry, Message, ChatSession } from '@/types';

// 변수 치환 함수
export function replaceVariables(
  text: string,
  userName: string,
  characterName: string
): string {
  return text
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{char\}\}/gi, characterName);
}

// 이미지 코드 파싱 ({{img::캐릭터::키워드}} 형식)
export function parseImageCodes(text: string): string {
  // 이미지 코드를 마크다운 이미지로 변환
  return text.replace(
    /\{\{img::([^:}]+)(?:::([^}]+))?\}\}/g,
    (match, first, second) => {
      if (second) {
        // {{img::캐릭터::키워드}} 형식
        return `![${first}-${second}](/api/images/${first}/${second})`;
      } else {
        // {{img::키워드}} 형식 (배경/기타)
        return `![${first}](/api/images/_/${first})`;
      }
    }
  );
}

// 토큰 추정 함수 (한글 기준: 약 1.5자 = 1토큰)
function estimateTokens(text: string): number {
  // 한글은 영어보다 토큰 소모가 큼 (약 1-2자당 1토큰)
  return Math.ceil(text.length / 1.5);
}

// 대화 히스토리 포맷팅 (확장된 메모리)
export function formatConversationHistory(
  messages: Message[],
  userName: string,
  maxMessages: number = 500,  // 20 → 500으로 대폭 확장
  maxTokens: number = 200000  // 최대 토큰 한도 (안전 마진 고려)
): string {
  // 최신 메시지부터 역순으로 처리하여 토큰 한도 내에서 최대한 포함
  const recentMessages = messages.slice(-maxMessages);

  let formattedHistory = '';
  let currentTokens = 0;

  // 역순으로 메시지를 추가하면서 토큰 한도 체크
  const messagesToInclude: string[] = [];

  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    let formattedMsg: string;

    if (msg.characterId && msg.character) {
      formattedMsg = `${msg.character.name}: ${msg.content}`;
    } else {
      formattedMsg = `${userName}: ${msg.content}`;
    }

    const msgTokens = estimateTokens(formattedMsg);

    // 토큰 한도 초과 시 중단
    if (currentTokens + msgTokens > maxTokens) {
      console.log(`📊 메모리 한도 도달: ${currentTokens} 토큰 (${messagesToInclude.length}개 메시지)`);
      break;
    }

    messagesToInclude.unshift(formattedMsg);
    currentTokens += msgTokens;
  }

  console.log(`🧠 대화 기억: ${messagesToInclude.length}개 메시지, 약 ${currentTokens} 토큰`);

  return messagesToInclude.join('\n\n');
}

// 유저 프로필 추출 (대화에서 자동으로 정보 추출)
export interface UserProfile {
  name: string;
  preferences: Record<string, string>;  // 좋아하는 것들
  personalInfo: Record<string, string>;  // 직업, 생일 등
  importantEvents: string[];  // 중요 이벤트들
  relationshipNotes: string[];  // 관계 관련 메모
}

// 대화에서 유저 정보 추출하는 패턴들
const USER_INFO_PATTERNS = {
  favoriteColor: /(?:좋아하는|선호하는)\s*색(?:깔|상)?[은는이가]?\s*([가-힣a-zA-Z]+)/,
  favoriteFood: /(?:좋아하는|선호하는)\s*음식[은는이가]?\s*([가-힣a-zA-Z]+)/,
  job: /(?:내\s*)?직업[은는이가]?\s*([가-힣a-zA-Z]+)|([가-힣a-zA-Z]+)\s*(?:로|으로)\s*일/,
  birthday: /(?:내\s*)?생일[은는이가]?\s*(\d{1,2})월\s*(\d{1,2})일/,
  hobby: /(?:취미|좋아하는\s*것)[은는이가]?\s*([가-힣a-zA-Z]+)/,
  pet: /(?:키우는|기르는)\s*(?:동물|애완동물|펫)[은는이가]?\s*([가-힣a-zA-Z]+)/,
  origin: /(?:에서\s*왔|출신|태어난\s*곳)[은는이가]?\s*([가-힣a-zA-Z]+)/,
};

// 유저 메시지에서 프로필 정보 추출
export function extractUserProfileFromMessages(
  messages: Message[],
  userName: string,
  existingProfile?: UserProfile
): UserProfile {
  const profile: UserProfile = existingProfile || {
    name: userName,
    preferences: {},
    personalInfo: {},
    importantEvents: [],
    relationshipNotes: [],
  };

  // 유저 메시지만 필터링
  const userMessages = messages.filter(msg => !msg.characterId);

  for (const msg of userMessages) {
    const content = msg.content;

    // 패턴 매칭으로 정보 추출
    const colorMatch = content.match(USER_INFO_PATTERNS.favoriteColor);
    if (colorMatch) profile.preferences['좋아하는 색'] = colorMatch[1];

    const foodMatch = content.match(USER_INFO_PATTERNS.favoriteFood);
    if (foodMatch) profile.preferences['좋아하는 음식'] = foodMatch[1];

    const jobMatch = content.match(USER_INFO_PATTERNS.job);
    if (jobMatch) profile.personalInfo['직업'] = jobMatch[1] || jobMatch[2];

    const birthdayMatch = content.match(USER_INFO_PATTERNS.birthday);
    if (birthdayMatch) profile.personalInfo['생일'] = `${birthdayMatch[1]}월 ${birthdayMatch[2]}일`;

    const hobbyMatch = content.match(USER_INFO_PATTERNS.hobby);
    if (hobbyMatch) profile.preferences['취미'] = hobbyMatch[1];

    const petMatch = content.match(USER_INFO_PATTERNS.pet);
    if (petMatch) profile.preferences['반려동물'] = petMatch[1];

    const originMatch = content.match(USER_INFO_PATTERNS.origin);
    if (originMatch) profile.personalInfo['출신'] = originMatch[1];
  }

  return profile;
}

// 유저 프로필을 컨텍스트 문자열로 변환
export function formatUserProfileContext(profile: UserProfile): string {
  const lines: string[] = [];

  lines.push(`## 🧑 유저 정보 (${profile.name})`);

  if (Object.keys(profile.personalInfo).length > 0) {
    lines.push('\n### 개인 정보');
    for (const [key, value] of Object.entries(profile.personalInfo)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  if (Object.keys(profile.preferences).length > 0) {
    lines.push('\n### 선호도');
    for (const [key, value] of Object.entries(profile.preferences)) {
      lines.push(`- ${key}: ${value}`);
    }
  }

  if (profile.importantEvents.length > 0) {
    lines.push('\n### 중요 이벤트');
    for (const event of profile.importantEvents.slice(-5)) {
      lines.push(`- ${event}`);
    }
  }

  if (profile.relationshipNotes.length > 0) {
    lines.push('\n### 관계 메모');
    for (const note of profile.relationshipNotes.slice(-3)) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join('\n');
}

// 로어북 항목 필터링 (조건에 맞는 것만)
export function filterActiveLorebookEntries(
  entries: LorebookEntry[],
  recentText: string,
  session: ChatSession,
  presentCharacters: string[]
): LorebookEntry[] {
  const activeEntries: LorebookEntry[] = [];

  for (const entry of entries) {
    // 키워드 매칭 확인
    const hasMatchingKeyword = entry.keywords.some((keyword) =>
      recentText.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!hasMatchingKeyword) continue;

    // 친밀도 조건 확인
    if (entry.minIntimacy !== null && session.intimacy < entry.minIntimacy) {
      continue;
    }

    // 턴 수 조건 확인
    if (entry.minTurns !== null && session.turnCount < entry.minTurns) {
      continue;
    }

    // 동석 캐릭터 조건 확인
    if (
      entry.requiredCharacter !== null &&
      !presentCharacters.includes(entry.requiredCharacter)
    ) {
      continue;
    }

    activeEntries.push(entry);
  }

  // 우선순위 정렬 (낮은 숫자가 높은 우선순위)
  activeEntries.sort((a, b) => a.priority - b.priority);

  // 최대 5개만 반환
  return activeEntries.slice(0, 5);
}

// 캐릭터별 시스템 프롬프트 생성
export function buildCharacterSystemPrompt(
  character: Character,
  otherCharacters: Character[],
  activeLorebookEntries: LorebookEntry[],
  session: ChatSession
): string {
  const userName = session.userName;
  const otherCharacterNames = otherCharacters.map((c) => c.name).join(', ');

  let prompt = `당신은 "${character.name}" 캐릭터입니다. 아래의 캐릭터 설정에 따라 행동하고 대화하세요.

## 캐릭터 설정
${replaceVariables(character.prompt, userName, character.name)}

## 현재 상황
- 유저 이름: ${userName}
- 대화 턴: ${session.turnCount}턴
- 친밀도: ${session.intimacy}
${otherCharacterNames ? `- 함께 있는 캐릭터: ${otherCharacterNames}` : ''}
`;

  // 활성화된 로어북 정보 추가
  if (activeLorebookEntries.length > 0) {
    prompt += `\n## 활성화된 추가 정보\n`;
    for (const entry of activeLorebookEntries) {
      prompt += `\n### ${entry.name}\n${replaceVariables(entry.content, userName, character.name)}\n`;
    }
  }

  prompt += `
## 응답 규칙
1. 캐릭터의 성격과 말투를 일관되게 유지하세요.
2. 대화 상황에 자연스럽게 반응하세요.
3. 다른 캐릭터가 있다면 그들의 존재를 인식하고 필요시 상호작용하세요.
4. 유저(${userName})의 행동이나 대사를 대신 작성하지 마세요.
5. 응답은 캐릭터의 대사, 행동, 생각만 포함하세요.
6. 행동 묘사는 *별표*로 감싸서 작성하세요.
`;

  return prompt;
}

// 최근 대화에서 키워드 검색을 위한 텍스트 추출
export function extractRecentText(
  messages: Message[],
  userMessage: string,
  turnCount: number = 3
): string {
  const recentMessages = messages.slice(-turnCount * 2); // 각 턴에 유저+캐릭터 응답
  const texts = recentMessages.map((m) => m.content);
  texts.push(userMessage);
  return texts.join(' ');
}
