/**
 * Mem0 기반 장기 기억 시스템 (최적화 버전 v2)
 *
 * 기능:
 * - 캐릭터별 유저 기억 관리 (agentId로 분리)
 * - 의미 기반 기억 검색
 * - 다중 캐릭터 병렬 검색 지원
 *
 * 최적화 (429 에러 해결):
 * - infer: false 사용 → LLM 호출 제거 (Embedding만 사용)
 * - 병렬 검색으로 다중 캐릭터 동시 처리
 * - Rate Limit 감지 및 자동 쿨다운
 *
 * 참고: Mem0 공식 문서 (https://docs.mem0.ai)
 * - agentId: 캐릭터별 기억 분리
 * - parallel_search: 다중 쿼리 동시 처리
 */

import { Memory } from 'mem0ai/oss';

// Rate Limit 관리
let isRateLimited = false;
let rateLimitResetTime = 0;
const RATE_LIMIT_COOLDOWN = 60000; // 1분 쿨다운

// 환경변수로 저장소 타입 설정 (기본: memory, 프로덕션: qdrant)
const VECTOR_STORE_PROVIDER = process.env.VECTOR_STORE_PROVIDER || 'memory';

// Mem0 설정 - Embedder만 사용 (LLM 호출 제거로 429 에러 방지)
const mem0Config = {
  // Embedder: 의미 기반 검색에만 사용 (API 호출 최소화)
  embedder: {
    provider: "google" as const,
    config: {
      apiKey: process.env.GOOGLE_API_KEY,
      model: "gemini-embedding-001",
      embeddingDims: 1536,
    }
  },
  // Vector Store: 환경변수에 따라 설정
  // - memory: 개발용 (휘발성)
  // - qdrant: 프로덕션용 (영구 저장)
  vectorStore: VECTOR_STORE_PROVIDER === 'qdrant'
    ? {
        provider: "qdrant" as const,
        config: {
          collectionName: "character-memories",
          host: process.env.QDRANT_HOST || "localhost",
          port: parseInt(process.env.QDRANT_PORT || "6333"),
        }
      }
    : {
        provider: "memory" as const,
        config: {
          collectionName: "character-memories",
        }
      }
  // LLM 설정 제거 - infer: false 사용으로 불필요
};

// 싱글톤 Memory 인스턴스
let memoryInstance: Memory | null = null;

/**
 * Rate Limit 상태 확인
 */
function checkRateLimit(): boolean {
  if (isRateLimited && Date.now() < rateLimitResetTime) {
    return true; // 아직 쿨다운 중
  }
  if (isRateLimited && Date.now() >= rateLimitResetTime) {
    isRateLimited = false; // 쿨다운 해제
  }
  return false;
}

/**
 * Rate Limit 활성화
 */
function setRateLimited(): void {
  isRateLimited = true;
  rateLimitResetTime = Date.now() + RATE_LIMIT_COOLDOWN;
  console.warn('[Memory] Rate Limit - 1분 쿨다운');
}

/**
 * Memory 인스턴스 가져오기 (싱글톤)
 */
export function getMemory(): Memory {
  if (!memoryInstance) {
    memoryInstance = new Memory(mem0Config);
  }
  return memoryInstance;
}

/**
 * 특정 유저의 모든 기억 조회
 */
export async function getAllMemories(
  userId: string,
  characterId?: string
): Promise<any[]> {
  try {
    const memory = getMemory();

    const options: any = { userId };
    if (characterId) {
      options.agentId = characterId;
    }

    const allMemories = await memory.getAll(options);
    return allMemories.results || [];
  } catch (error) {
    console.error('[Memory] 전체 조회 실패:', error);
    return [];
  }
}

/**
 * 기억을 시스템 프롬프트용 컨텍스트로 포맷팅
 *
 * @param memories - 기억 목록
 * @param characterName - 캐릭터 이름
 * @returns 포맷팅된 기억 컨텍스트
 */
export function formatMemoriesForPrompt(
  memories: string[],
  characterName: string
): string {
  if (memories.length === 0) {
    return '';
  }

  const memoriesText = memories
    .map((m, i) => `${i + 1}. ${m}`)
    .join('\n');

  return `
[${characterName}의 유저에 대한 기억]
${memoriesText}

[중요 지시]
- 위 기억들을 자연스럽게 대화에 녹여내세요
- 유저가 물어보지 않아도, 맥락에 맞으면 과거 기억을 먼저 언급해도 좋습니다
- 기억을 억지로 끼워넣지 말고, 자연스러운 흐름일 때만 언급하세요
- 기억에 없는 내용은 지어내지 마세요
`;
}

/**
 * 기억 시스템 상태 확인
 */
export async function getMemoryStatus(): Promise<{
  initialized: boolean;
  totalMemories: number;
  provider: string;
}> {
  try {
    const memory = getMemory();
    // 간단한 테스트 쿼리로 상태 확인
    const testResult = await memory.getAll({ userId: '__test__' });
    return {
      initialized: true,
      totalMemories: testResult.results?.length || 0,
      provider: VECTOR_STORE_PROVIDER,
    };
  } catch (error) {
    return {
      initialized: false,
      totalMemories: 0,
      provider: VECTOR_STORE_PROVIDER,
    };
  }
}

/**
 * 다중 캐릭터 기억 병렬 검색 (공식 문서 권장 패턴)
 *
 * @param query - 검색 쿼리
 * @param userId - 유저 ID
 * @param characterIds - 캐릭터 ID 배열
 * @param limit - 캐릭터당 최대 검색 결과 수
 * @returns 캐릭터별 기억 맵
 */
export async function searchMemoriesForMultipleCharacters(
  query: string,
  userId: string,
  characterIds: string[],
  limit: number = 5
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();

  // Rate Limit 체크
  if (checkRateLimit()) {
    characterIds.forEach(id => results.set(id, []));
    return results;
  }

  try {
    const memory = getMemory();

    // 병렬 검색 (공식 문서 패턴)
    const searchPromises = characterIds.map(async (characterId) => {
      try {
        const searchResult = await memory.search(query, {
          userId: userId,
          agentId: characterId,
          limit: limit,
        });
        const memories = searchResult.results?.map((r: any) => r.memory) || [];
        return { characterId, memories };
      } catch (error) {
        console.error(`[Memory] 캐릭터 ${characterId} 검색 실패:`, error);
        return { characterId, memories: [] as string[] };
      }
    });

    const searchResults = await Promise.all(searchPromises);

    searchResults.forEach(({ characterId, memories }) => {
      results.set(characterId, memories);
    });

    // 개발환경에서만 상세 로그
    if (process.env.NODE_ENV === 'development') {
      const totalMemories = searchResults.reduce((sum, r) => sum + r.memories.length, 0);
      console.log(`[Memory] 검색: ${characterIds.length}캐릭터, ${totalMemories}기억`);
    }

  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Resource exhausted')) {
      setRateLimited();
    }
    console.error('[Memory] 다중 검색 실패:', error?.message || error);
    characterIds.forEach(id => results.set(id, []));
  }

  return results;
}

/**
 * 다중 캐릭터 대화 병렬 저장
 *
 * @param conversations - 캐릭터별 대화 배열
 * @param userId - 유저 ID
 */
export async function saveConversationsForMultipleCharacters(
  conversations: Array<{
    characterId: string;
    messages: Array<{ role: string; content: string }>;
  }>,
  userId: string
): Promise<void> {
  // Rate Limit 체크
  if (checkRateLimit()) {
    return;
  }

  try {
    const memory = getMemory();

    // 병렬 저장
    const savePromises = conversations.map(async ({ characterId, messages }) => {
      try {
        await memory.add(messages, {
          userId: userId,
          agentId: characterId,
          metadata: {
            timestamp: new Date().toISOString(),
            characterId: characterId,
          },
          infer: false,
        });
        return { characterId, success: true };
      } catch (error) {
        console.error(`[Memory] 캐릭터 ${characterId} 저장 실패:`, error);
        return { characterId, success: false };
      }
    });

    const saveResults = await Promise.all(savePromises);

    // 개발환경에서만 상세 로그
    if (process.env.NODE_ENV === 'development') {
      const successCount = saveResults.filter(r => r.success).length;
      console.log(`[Memory] 저장: ${successCount}/${conversations.length}캐릭터`);
    }

  } catch (error: any) {
    if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('Resource exhausted')) {
      setRateLimited();
    }
    console.error('[Memory] 다중 저장 실패:', error?.message || error);
  }
}
