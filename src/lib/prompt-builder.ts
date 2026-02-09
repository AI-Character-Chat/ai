/**
 * 프롬프트 빌더 유틸리티
 *
 * 역할:
 * - 변수 치환 ({{user}}, {{char}})
 * - 이미지 코드 파싱
 * - 대화 히스토리 포맷팅
 * - 로어북 필터링
 * - 토큰 추정
 */

import { LorebookEntry, Message } from '@/types';

// ============================================================
// 변수 치환
// ============================================================

/**
 * {{user}}, {{char}} 변수를 실제 이름으로 치환
 */
export function replaceVariables(
  text: string,
  userName: string,
  characterName: string
): string {
  return text
    .replace(/\{\{user\}\}/gi, userName)
    .replace(/\{\{char\}\}/gi, characterName);
}

// ============================================================
// 이미지 코드 파싱
// ============================================================

/**
 * {{img::캐릭터::키워드}} 형식을 마크다운 이미지로 변환
 */
export function parseImageCodes(text: string): string {
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

// ============================================================
// 토큰 추정
// ============================================================

/**
 * 텍스트의 토큰 수 추정 (한글 기준: 약 1.5자 = 1토큰)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 1.5);
}

// ============================================================
// 대화 히스토리 포맷팅
// ============================================================

interface MessageWithCharacter {
  content: string;
  messageType: string;
  character?: { name: string } | null;
}

/**
 * 대화 히스토리를 AI 프롬프트용 문자열로 포맷팅
 *
 * @param messages - 메시지 배열
 * @param userName - 유저 이름
 * @param maxMessages - 최대 메시지 수 (기본 30)
 * @param maxTokens - 최대 토큰 수 (기본 50000)
 */
export function formatConversationHistory(
  messages: MessageWithCharacter[],
  userName: string,
  maxMessages: number = 30,
  maxTokens: number = 50000
): string {
  const recentMessages = messages.slice(-maxMessages);

  let currentTokens = 0;
  const messagesToInclude: string[] = [];

  // 최신 메시지부터 역순으로 처리하여 토큰 한도 내에서 최대한 포함
  for (let i = recentMessages.length - 1; i >= 0; i--) {
    const msg = recentMessages[i];
    let formattedMsg: string;

    switch (msg.messageType) {
      case 'narrator':
        formattedMsg = `[상황 묘사] ${msg.content}`;
        break;
      case 'user':
        formattedMsg = `${userName}의 행동: ${msg.content}`;
        break;
      case 'system':
        formattedMsg = `[오프닝] ${msg.content}`;
        break;
      case 'dialogue':
        if (msg.character) {
          formattedMsg = `${msg.character.name}의 반응: ${msg.content}`;
        } else {
          formattedMsg = `${userName}의 행동: ${msg.content}`;
        }
        break;
      default:
        formattedMsg = msg.character
          ? `${msg.character.name}: ${msg.content}`
          : `${userName}: ${msg.content}`;
    }

    const msgTokens = estimateTokens(formattedMsg);

    // 토큰 한도 초과 시 중단
    if (currentTokens + msgTokens > maxTokens) {
      break;
    }

    messagesToInclude.unshift(formattedMsg);
    currentTokens += msgTokens;
  }

  return messagesToInclude.join('\n\n');
}

// ============================================================
// 로어북 필터링
// ============================================================

interface LorebookEntryInput {
  keywords: string | string[];
  content: string;
  priority?: number;
  minIntimacy: number | null;
  minTurns: number | null;
  requiredCharacter: string | null;
}

/**
 * 조건에 맞는 로어북 항목만 필터링
 *
 * @param entries - 로어북 항목들
 * @param recentText - 최근 대화 텍스트 (키워드 매칭용)
 * @param intimacy - 현재 친밀도
 * @param turnCount - 현재 턴 수
 * @param presentCharacters - 현재 등장 캐릭터들
 * @param maxEntries - 최대 항목 수 (기본 5)
 */
export function filterActiveLorebookEntries(
  entries: LorebookEntryInput[],
  recentText: string,
  intimacy: number,
  turnCount: number,
  presentCharacters: string[],
  maxEntries: number = 5
): string {
  const activeEntries: { content: string; priority: number }[] = [];
  const lowerRecentText = recentText.toLowerCase();

  for (const entry of entries) {
    // 키워드 파싱 (JSON 문자열 또는 배열)
    let keywords: string[];
    if (typeof entry.keywords === 'string') {
      try {
        keywords = JSON.parse(entry.keywords);
      } catch {
        keywords = [entry.keywords];
      }
    } else {
      keywords = entry.keywords;
    }

    // 키워드 매칭 확인
    const hasMatch = keywords.some((kw) =>
      lowerRecentText.includes(kw.toLowerCase())
    );
    if (!hasMatch) continue;

    // 조건 확인
    if (entry.minIntimacy !== null && intimacy < entry.minIntimacy) continue;
    if (entry.minTurns !== null && turnCount < entry.minTurns) continue;
    if (
      entry.requiredCharacter !== null &&
      !presentCharacters.includes(entry.requiredCharacter)
    ) continue;

    activeEntries.push({
      content: entry.content,
      priority: entry.priority ?? 0,
    });
  }

  // 우선순위 정렬 (낮은 숫자가 높은 우선순위)
  activeEntries.sort((a, b) => a.priority - b.priority);

  // 최대 개수만 반환
  return activeEntries
    .slice(0, maxEntries)
    .map(e => e.content)
    .join('\n\n');
}

// ============================================================
// 키워드 추출 (간단 버전)
// ============================================================

/**
 * 텍스트에서 주요 키워드 추출 (한글 패턴 기반)
 */
export function extractKeywords(text: string, maxKeywords: number = 5): string[] {
  const patterns = [
    /(?:나는?|내가|저는?)\s*([가-힣]+)(?:을|를)?\s*(?:좋아|싫어|원해|하고싶)/g,
    /([가-힣]+)\s*(?:이야기|얘기|말|대화)/g,
    /([가-힣]{2,})\s*(?:했어|했다|할래|할게)/g,
  ];

  const keywords: string[] = [];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      if (match[1] && match[1].length >= 2) {
        keywords.push(match[1].replace(/을$|를$/, ''));
      }
    }
  }

  // 중복 제거하고 최대 개수만
  return Array.from(new Set(keywords)).slice(0, maxKeywords);
}

// ============================================================
// 최근 텍스트 추출 (로어북 키워드 매칭용)
// ============================================================

/**
 * 최근 대화에서 로어북 키워드 매칭용 텍스트 추출
 */
export function extractRecentText(
  messages: MessageWithCharacter[],
  userMessage: string,
  turnCount: number = 3
): string {
  const recentMessages = messages.slice(-turnCount * 2);
  const texts = recentMessages.map((m) => m.content);
  texts.push(userMessage);
  return texts.join(' ');
}
