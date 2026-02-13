/**
 * Mem0 Cloud 기반 장기 기억 시스템
 *
 * 격리 구조:
 * - user_id: 유저 간 격리 (인증된 userId)
 * - agent_id: 캐릭터 간 격리 (characterId UUID)
 * → 다른 작품의 동명이인이라도 UUID가 달라 기억 충돌 없음
 *
 * 데이터 흐름:
 * [유저 메시지 + AI 응답] → mem0.add() → Cloud에서 자동 fact 추출/중복 제거/저장
 * [유저 메시지] → mem0.search() → 관련 기억 검색 → 프롬프트에 주입
 */

import MemoryClient from 'mem0ai';

// ============================================================
// Rate Limit 관리
// ============================================================

let isRateLimited = false;
let rateLimitResetTime = 0;
const RATE_LIMIT_COOLDOWN = 60000; // 1분 쿨다운

function checkRateLimit(): boolean {
  if (isRateLimited && Date.now() < rateLimitResetTime) return true;
  if (isRateLimited) isRateLimited = false;
  return false;
}

function setRateLimited(): void {
  isRateLimited = true;
  rateLimitResetTime = Date.now() + RATE_LIMIT_COOLDOWN;
  console.warn('[Mem0] Rate limit 감지 — 1분 쿨다운');
}

// ============================================================
// 클라이언트 싱글톤
// ============================================================

let client: MemoryClient | null = null;

function getClient(): MemoryClient | null {
  if (!process.env.MEM0_API_KEY) return null;
  if (!client) {
    client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
  }
  return client;
}

/**
 * mem0 사용 가능 여부
 */
export function isMem0Available(): boolean {
  return !!process.env.MEM0_API_KEY;
}

// ============================================================
// 핵심 API
// ============================================================

/**
 * 대화 기억 저장 (Cloud에서 자동 fact 추출 + 중복 제거)
 *
 * @param messages - 대화 내용 [{role, content}]
 * @param userId - 인증된 유저 ID
 * @param characterId - 캐릭터 UUID (격리 키)
 * @param metadata - 추가 메타데이터 (work_id 등)
 */
export async function addMemory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userId: string,
  characterId: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return;

  try {
    await mem0.add(messages, {
      user_id: `user_${userId}`,
      agent_id: `char_${characterId}`,
      metadata: { ...metadata, timestamp: new Date().toISOString() },
    });
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes('429')) setRateLimited();
    console.error('[Mem0] add failed:', err?.message || error);
  }
}

/**
 * 의미 기반 기억 검색 (단일 캐릭터)
 */
export async function searchMemories(
  query: string,
  userId: string,
  characterId: string,
  limit: number = 5,
): Promise<string[]> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return [];

  try {
    const results = await mem0.search(query, {
      user_id: `user_${userId}`,
      agent_id: `char_${characterId}`,
      limit,
    });
    // Cloud API 응답 형식: { results: [{ memory: string, ... }] } 또는 배열
    if (Array.isArray(results)) {
      return results.map((r: { memory?: string }) => r.memory).filter((m): m is string => !!m);
    }
    const res = results as { results?: Array<{ memory: string }> };
    return res.results?.map(r => r.memory).filter(Boolean) as string[] || [];
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes('429')) setRateLimited();
    console.error('[Mem0] search failed:', err?.message || error);
    return [];
  }
}

/**
 * 다중 캐릭터 기억 병렬 검색
 *
 * @returns Map<characterId, memories[]>
 */
export async function searchMemoriesForCharacters(
  query: string,
  userId: string,
  characters: Array<{ id: string; name: string }>,
  limit: number = 5,
): Promise<Map<string, string[]>> {
  const results = new Map<string, string[]>();
  const mem0 = getClient();

  if (!mem0 || checkRateLimit()) {
    characters.forEach(c => results.set(c.id, []));
    return results;
  }

  const MEM0_TIMEOUT = 2000; // 2초 타임아웃
  const searches = characters.map(async ({ id, name }) => {
    try {
      const searchResult = await Promise.race([
        mem0.search(query, {
          user_id: `user_${userId}`,
          agent_id: `char_${id}`,
          limit,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Mem0 timeout')), MEM0_TIMEOUT)
        ),
      ]);
      let memories: string[] = [];
      if (Array.isArray(searchResult)) {
        memories = searchResult.map((r: { memory?: string }) => r.memory).filter((m): m is string => !!m);
      } else {
        const res = searchResult as { results?: Array<{ memory: string }> };
        memories = res.results?.map(r => r.memory).filter(Boolean) as string[] || [];
      }
      return { id, name, memories };
    } catch (error) {
      console.error(`[Mem0] search failed for ${name}:`, error);
      return { id, name, memories: [] as string[] };
    }
  });

  const searchResults = await Promise.all(searches);
  searchResults.forEach(({ id, memories }) => results.set(id, memories));

  const totalMemories = searchResults.reduce((sum, r) => sum + r.memories.length, 0);
  if (totalMemories > 0) {
    console.log(`[Mem0] 검색 완료: ${characters.length}캐릭터, ${totalMemories}기억`);
  }

  return results;
}

// ============================================================
// 프롬프트 포맷팅
// ============================================================

/**
 * mem0 기억을 프롬프트용 텍스트로 변환
 *
 * @param memoriesMap - Map<characterId, memories[]>
 * @param characterNames - Map<characterId, characterName>
 * @returns 프롬프트에 주입할 텍스트 (비어있으면 빈 문자열)
 */
export function formatMem0ForPrompt(
  memoriesMap: Map<string, string[]>,
  characterNames: Map<string, string>,
): string {
  const sections: string[] = [];

  memoriesMap.forEach((memories, charId) => {
    if (memories.length === 0) return;
    const name = characterNames.get(charId) || '캐릭터';
    const memText = memories.map((m, i) => `${i + 1}. ${m}`).join('\n');
    sections.push(`[${name}의 유저에 대한 장기 기억]\n${memText}`);
  });

  if (sections.length === 0) return '';

  return sections.join('\n\n') +
    '\n\n[중요 지시] 위 기억은 캐릭터가 유저에 대해 알고 있는 사실입니다. ' +
    '자연스러운 맥락에서 활용하되, 억지로 끼워넣지 마세요. ' +
    '기억에 없는 내용은 절대 지어내지 마세요.';
}

// ============================================================
// 관리 기능
// ============================================================

/**
 * 특정 캐릭터의 모든 기억 조회
 */
export async function getAllMemories(
  userId: string,
  characterId: string,
): Promise<Array<{ id: string; memory: string; created_at?: string }>> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return [];

  try {
    const result = await mem0.getAll({
      user_id: `user_${userId}`,
      agent_id: `char_${characterId}`,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const memories = Array.isArray(result) ? result : (result as any).results || [];
    return memories.map((m: any) => ({
      id: m.id || '',
      memory: m.memory || '',
      created_at: m.created_at,
    }));
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes('429')) setRateLimited();
    console.error('[Mem0] getAll failed:', err?.message || error);
    return [];
  }
}

/**
 * 오래된 기억 정리 (캐릭터당 최대 기억 수 초과 시)
 */
export async function pruneMemories(
  userId: string,
  characterId: string,
  maxMemories: number = 100,
): Promise<number> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return 0;

  try {
    const all = await getAllMemories(userId, characterId);
    if (all.length <= maxMemories) return 0;

    // 오래된 것부터 삭제
    const sorted = [...all].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    const toDelete = sorted.slice(0, all.length - maxMemories);
    let deleted = 0;

    for (const mem of toDelete) {
      try {
        await mem0.delete(mem.id);
        deleted++;
      } catch { /* 개별 삭제 실패 무시 */ }
    }

    if (deleted > 0) {
      console.log(`[Mem0] Pruned ${deleted}/${all.length} memories for character ${characterId}`);
    }
    return deleted;
  } catch (error: unknown) {
    const err = error as { status?: number; message?: string };
    if (err?.status === 429 || err?.message?.includes('429')) setRateLimited();
    console.error('[Mem0] pruning failed:', err?.message || error);
    return 0;
  }
}
