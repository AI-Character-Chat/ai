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

export interface MessageWithCharacter {
  id?: string;
  content: string;
  messageType: string;
  embedding?: string;
  createdAt?: Date;
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
// 선별적 대화 히스토리 (Selective History)
// ============================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * 현재 메시지 임베딩으로 과거 유저 메시지 중 관련 있는 것을 검색
 * 즉시 컨텍스트에 포함된 메시지는 제외
 */
export function findRelevantMessages(
  allMessages: MessageWithCharacter[],
  immediateIds: Set<string>,
  queryEmbedding: number[],
  topK: number = 5
): MessageWithCharacter[] {
  if (queryEmbedding.length === 0) return [];

  // 즉시 컨텍스트 제외, 임베딩 있는 유저 메시지만
  const candidates = allMessages.filter(m =>
    m.id &&
    !immediateIds.has(m.id) &&
    m.messageType === 'user' &&
    m.embedding && m.embedding !== '[]'
  );

  // 코사인 유사도 계산 + 정렬
  const scored = candidates.map(msg => {
    const emb = JSON.parse(msg.embedding || '[]') as number[];
    return { msg, similarity: cosineSimilarity(queryEmbedding, emb) };
  })
    .filter(s => s.similarity > 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  if (scored.length === 0) return [];

  // 선택된 유저 메시지의 직후 AI 응답도 포함
  const selectedIds = new Set(scored.map(s => s.msg.id));
  const result: MessageWithCharacter[] = [];

  for (let i = 0; i < allMessages.length; i++) {
    const m = allMessages[i];
    if (m.id && selectedIds.has(m.id)) {
      result.push(m);
      // 직후 AI 응답 포함
      if (i + 1 < allMessages.length) {
        const next = allMessages[i + 1];
        if (next.messageType === 'dialogue' || next.messageType === 'narrator') {
          result.push(next);
        }
      }
    }
  }

  return result;
}

/**
 * 단일 메시지 포맷
 */
function formatSingleMessage(msg: MessageWithCharacter, userName: string): string {
  switch (msg.messageType) {
    case 'narrator': return `[상황 묘사] ${msg.content}`;
    case 'user': return `${userName}의 행동: ${msg.content}`;
    case 'system': return `[오프닝] ${msg.content}`;
    case 'dialogue':
      return msg.character
        ? `${msg.character.name}의 반응: ${msg.content}`
        : `${userName}의 행동: ${msg.content}`;
    default:
      return msg.character
        ? `${msg.character.name}: ${msg.content}`
        : `${userName}: ${msg.content}`;
  }
}

/**
 * 선별적 히스토리: [관련 과거] + [즉시 컨텍스트]
 */
export function buildSelectiveHistory(
  relevantHistory: MessageWithCharacter[],
  immediateMessages: MessageWithCharacter[],
  userName: string,
  maxTokens: number = 40000
): string {
  const sections: string[] = [];
  let currentTokens = 0;

  // 1. 관련 과거 대화 (시간순)
  if (relevantHistory.length > 0) {
    const formatted = relevantHistory.map(m => formatSingleMessage(m, userName));
    const block = `[관련 과거 대화]\n${formatted.join('\n')}`;
    const tokens = estimateTokens(block);
    if (currentTokens + tokens <= maxTokens) {
      sections.push(block);
      currentTokens += tokens;
    }
  }

  // 2. 즉시 컨텍스트 (최근, 역순으로 처리하여 최신 우선 보장)
  const immediateFormatted: string[] = [];
  for (let i = immediateMessages.length - 1; i >= 0; i--) {
    const line = formatSingleMessage(immediateMessages[i], userName);
    const tokens = estimateTokens(line);
    if (currentTokens + tokens > maxTokens) break;
    immediateFormatted.unshift(line);
    currentTokens += tokens;
  }

  if (immediateFormatted.length > 0) {
    sections.push(`[최근 대화]\n${immediateFormatted.join('\n\n')}`);
  }

  return sections.join('\n\n---\n\n');
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
  const MAX_DEPTH = 3;
  const activatedIndices = new Set<number>();
  let scanText = recentText.toLowerCase();

  // 키워드 사전 파싱 (1회만)
  const parsedEntries = entries.map((entry, idx) => {
    let keywords: string[];
    if (typeof entry.keywords === 'string') {
      try { keywords = JSON.parse(entry.keywords); }
      catch { keywords = [entry.keywords]; }
    } else {
      keywords = entry.keywords;
    }
    return { idx, keywords: keywords.map(kw => kw.toLowerCase()), entry };
  });

  // 재귀 스캔 (최대 MAX_DEPTH 라운드)
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    let newActivations = 0;

    for (const { idx, keywords, entry } of parsedEntries) {
      if (activatedIndices.has(idx)) continue;

      const hasMatch = keywords.some(kw => scanText.includes(kw));
      if (!hasMatch) continue;

      // 조건 확인
      if (entry.minIntimacy !== null && intimacy < entry.minIntimacy) continue;
      if (entry.minTurns !== null && turnCount < entry.minTurns) continue;
      if (
        entry.requiredCharacter !== null &&
        !presentCharacters.includes(entry.requiredCharacter)
      ) continue;

      activatedIndices.add(idx);
      scanText += ' ' + entry.content.toLowerCase();
      newActivations++;
    }

    if (newActivations === 0) break; // 더 이상 새 활성화 없으면 조기 종료
  }

  // 활성화된 항목들을 우선순위로 정렬
  const activeEntries = Array.from(activatedIndices)
    .map(idx => ({ content: entries[idx].content, priority: entries[idx].priority ?? 0 }))
    .sort((a, b) => a.priority - b.priority);

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
