/**
 * Mem0 Cloud 기반 장기 기억 시스템
 *
 * 격리 구조:
 * - user_id: 유저 간 격리 (인증된 userId)
 * - agent_id: 캐릭터 간 격리 (characterId UUID)
 * → 다른 작품의 동명이인이라도 UUID가 달라 기억 충돌 없음
 *
 * 역할 분담:
 * - narrative-memory (Prisma): 관계/감정/장면 추적, knownFacts (최근 15개 직접 노출)
 * - mem0 (이 모듈): 장기 사실 기억의 시맨틱 검색 백업 — knownFacts 밖의 오래된 사실을 되살림
 *
 * 카테고리 구조:
 * identity    — 이름, 나이, 직업, 성격 등 기본 정보
 * people      — 가족, 친구, 동료 등 주변 인물
 * preferences — 좋아하는 것/싫어하는 것, 취미, 음식
 * caution     — 알레르기, 공포증, 트라우마 (캐릭터 필수 주의)
 * shared_events — 유저-캐릭터 사이 중요한 사건/경험
 * requests    — 약속, 요청, 부탁, 함께 하기로 한 계획
 * situation   — 유저의 현재 상황, 고민, 근황, 일정
 */

import MemoryClient from 'mem0ai';

// ============================================================
// 프로젝트 설정 — 카테고리 + 추출 지시
// ============================================================

const MEM0_CATEGORIES = [
  { name: 'identity', description: '유저의 이름, 나이, 직업, 외모, 성격, MBTI 등 변하지 않는 기본 신원 정보' },
  { name: 'people', description: '유저 주변 인물 — 가족, 친구, 동료, 연인의 이름과 관계' },
  { name: 'preferences', description: '유저가 좋아하는/싫어하는 것, 취미, 음식, 장르, 스타일 선호' },
  { name: 'caution', description: '알레르기, 공포증, 트라우마, 민감한 주제 등 캐릭터가 반드시 주의해야 할 정보' },
  { name: 'shared_events', description: '유저와 캐릭터 사이에서 일어난 사건, 함께한 경험, 중요한 대화 순간' },
  { name: 'requests', description: '유저가 한 약속, 요청, 부탁, 함께 하기로 한 계획, 다음에 하고 싶은 것' },
  { name: 'situation', description: '유저의 현재 상황, 고민, 근황, 감정 상태, 예정된 일정이나 이벤트' },
];

const MEM0_INSTRUCTIONS =
  'Extract: 유저의 이름·나이·직업·성격 등 신원정보, ' +
  '가족·친구·연인 등 인간관계와 이름, ' +
  '알레르기·공포증·트라우마 등 건강/안전 정보, ' +
  '취미·선호도·싫어하는 것, ' +
  '유저와 캐릭터 사이의 중요한 사건과 경험, ' +
  '유저가 캐릭터에게 한 약속·요청·부탁, ' +
  '유저의 현재 상황·고민·계획·예정 일정\n' +
  'Exclude: 단순 인사("안녕", "잘 자"), ' +
  '일회성 감정 표현("배고파", "졸려", "덥다"), ' +
  '날씨·시간 단순 언급, ' +
  '스토리 진행용 단순 선택 응답("응", "그래", "해볼까"), ' +
  '캐릭터의 대사나 나레이션 내용 자체';

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
// 클라이언트 싱글톤 + 프로젝트 설정
// ============================================================

let client: MemoryClient | null = null;
let projectConfigured = false;

function getClient(): MemoryClient | null {
  if (!process.env.MEM0_API_KEY) return null;
  if (!client) {
    client = new MemoryClient({ apiKey: process.env.MEM0_API_KEY });
  }
  return client;
}

/**
 * 프로젝트 카테고리 + 추출 지시 설정 (최초 1회)
 *
 * mem0 Cloud에 custom_instructions와 custom_categories를 설정하여:
 * - 노이즈(인사말, 날씨 등) 자동 필터링
 * - 저장된 기억을 카테고리별로 자동 분류
 */
async function ensureProjectConfigured(): Promise<void> {
  if (projectConfigured) return;
  const mem0 = getClient();
  if (!mem0) return;

  try {
    await mem0.updateProject({
      custom_instructions: MEM0_INSTRUCTIONS,
      custom_categories: MEM0_CATEGORIES,
    });
    projectConfigured = true;
    console.log('[Mem0] 프로젝트 설정 완료 — 카테고리 7개, 추출 지시 적용');
  } catch (error) {
    console.warn('[Mem0] 프로젝트 설정 실패 (기능은 정상 작동):', error);
    projectConfigured = true; // 실패해도 재시도하지 않음
  }
}

/**
 * mem0 사용 가능 여부
 */
export function isMem0Available(): boolean {
  return !!process.env.MEM0_API_KEY;
}

// ============================================================
// 응답 파싱 헬퍼
// ============================================================

function parseMemoryResults(results: unknown): string[] {
  if (Array.isArray(results)) {
    return results
      .map((r: { memory?: string }) => r.memory)
      .filter((m): m is string => !!m);
  }
  const res = results as { results?: Array<{ memory: string }> };
  return res.results?.map(r => r.memory).filter(Boolean) as string[] || [];
}

// ============================================================
// 핵심 API
// ============================================================

/**
 * 대화 기억 저장 (Cloud에서 자동 fact 추출 + 중복 제거 + 카테고리 분류)
 */
export async function addMemory(
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  userId: string,
  characterId: string,
  metadata?: Record<string, string>,
): Promise<void> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return;

  // 최초 호출 시 프로젝트 설정 (fire-and-forget)
  ensureProjectConfigured().catch(() => {});

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
  limit: number = 10,
  categories?: string[],
): Promise<string[]> {
  const mem0 = getClient();
  if (!mem0 || checkRateLimit()) return [];

  try {
    const options: Record<string, unknown> = {
      user_id: `user_${userId}`,
      agent_id: `char_${characterId}`,
      limit,
      rerank: true,
    };
    if (categories && categories.length > 0) {
      options.categories = categories;
    }
    const results = await mem0.search(query, options);
    return parseMemoryResults(results);
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
 * 전략: 일반 검색(limit 10) + caution 카테고리 우선 검색(limit 3)을 병렬 실행
 * → 알레르기/공포증 같은 중요 정보가 검색 누락되지 않도록 보장
 */
export async function searchMemoriesForCharacters(
  query: string,
  userId: string,
  characters: Array<{ id: string; name: string }>,
  limit: number = 10,
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
      // 일반 검색 + caution 카테고리 검색을 병렬로
      const [generalResult, cautionResult] = await Promise.all([
        Promise.race([
          mem0.search(query, {
            user_id: `user_${userId}`,
            agent_id: `char_${id}`,
            limit,
            rerank: true,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Mem0 timeout')), MEM0_TIMEOUT)
          ),
        ]),
        Promise.race([
          mem0.search(query, {
            user_id: `user_${userId}`,
            agent_id: `char_${id}`,
            limit: 3,
            categories: ['caution', 'identity'],
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Mem0 timeout')), MEM0_TIMEOUT)
          ),
        ]).catch(() => [] as unknown), // caution 검색 실패는 무시
      ]);

      const generalMemories = parseMemoryResults(generalResult);
      const cautionMemories = parseMemoryResults(cautionResult);

      // 중복 제거 후 병합 (caution 결과를 앞에 배치)
      const seen = new Set<string>();
      const merged: string[] = [];
      for (const m of [...cautionMemories, ...generalMemories]) {
        if (!seen.has(m)) {
          seen.add(m);
          merged.push(m);
        }
      }

      return { id, name, memories: merged };
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
