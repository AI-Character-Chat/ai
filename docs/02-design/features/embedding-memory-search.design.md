# Design: 임베딩 기반 메모리 검색 (embedding-memory-search)

> PDCA Phase: **Design**
> Plan Reference: `docs/01-plan/features/embedding-memory-search.plan.md`
> Created: 2026-02-12

---

## 1. 구현 순서

```
Step 1: prisma/schema.prisma — CharacterMemory에 embedding 필드 추가
Step 2: src/lib/gemini.ts — generateEmbedding() 헬퍼 추가
Step 3: src/lib/narrative-memory.ts — 임베딩 저장/검색 로직 변경
Step 4: src/app/api/chat/route.ts — buildNarrativeContext에 userMessage 전달
Step 5: DB 마이그레이션 + 빌드 검증
```

---

## 2. Step 1: Schema 변경

### 파일: `prisma/schema.prisma`

**CharacterMemory 모델** (line 514-556)에 `embedding` 필드 추가:

```prisma
model CharacterMemory {
  // ... 기존 필드 ...

  // 임베딩 벡터 (의미 기반 검색용)
  embedding   String   @default("[]")  // JSON: Float[] (256차원)

  // ... 기존 관계/인덱스 ...
}
```

**결정 근거**: `Float[]`를 Prisma에서 직접 지원하지 않으므로 JSON 문자열로 저장. 세션당 최대 100개이므로 인메모리 파싱+계산이 충분.

**기존 데이터 영향**: `@default("[]")` → 기존 행은 빈 배열 → 폴백 처리됨

---

## 3. Step 2: Embedding 헬퍼 (gemini.ts)

### 파일: `src/lib/gemini.ts`

기존 `ai` 인스턴스(line 40) 재사용. **새 함수 1개 추가**:

```typescript
// ============================================================
// [8] 임베딩 생성 (메모리 검색용)
// ============================================================

const EMBEDDING_MODEL = 'text-embedding-004';
const EMBEDDING_DIMENSIONS = 256;

/**
 * 텍스트를 256차원 임베딩 벡터로 변환
 * 실패 시 빈 배열 반환 (호출자가 폴백 처리)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: [{ parts: [{ text }] }],
      config: { outputDimensionality: EMBEDDING_DIMENSIONS },
    });
    return result.embeddings?.[0]?.values || [];
  } catch (e) {
    console.error('[Embedding] failed:', e);
    return [];
  }
}
```

**설계 포인트**:
- 타임아웃: `@google/genai` SDK 기본 타임아웃 사용 (~30초). embedding은 보통 50-100ms.
- 실패 시 빈 배열 → 호출자가 `embedding.length === 0`으로 폴백 판단
- 추가 의존성 없음 (기존 `ai` 인스턴스 재사용)

### 삽입 위치

`generateProAnalysis()` 함수 뒤 (파일 끝 부근). 기존 함수에 영향 없음.

---

## 4. Step 3: narrative-memory.ts 변경 (핵심)

### 4-A. 코사인 유사도 유틸 함수 추가

```typescript
/**
 * 코사인 유사도 계산
 */
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
```

**삽입 위치**: 파일 상단 유틸리티 영역 (import 아래)

### 4-B. saveCharacterMemory() 수정 (line 387-413)

**변경 전** (현재):
```typescript
export async function saveCharacterMemory(params: {
  // ... 기존 파라미터
}) {
  return await prisma.characterMemory.create({
    data: {
      // ... 기존 필드
      keywords: JSON.stringify(params.keywords || []),
    },
  });
}
```

**변경 후**:
```typescript
import { generateEmbedding } from './gemini';

export async function saveCharacterMemory(params: {
  // ... 기존 파라미터 (변경 없음)
}) {
  // 임베딩 생성 (interpretation 기반 — 캐릭터 관점의 해석이 검색 키)
  const embedding = await generateEmbedding(params.interpretation);

  return await prisma.characterMemory.create({
    data: {
      // ... 기존 필드 (전부 유지)
      keywords: JSON.stringify(params.keywords || []),
      embedding: JSON.stringify(embedding),  // 추가
    },
  });
}
```

**핵심 결정**: `originalEvent`가 아닌 `interpretation`을 임베딩함.
- 이유: 같은 사건도 캐릭터마다 해석이 다름. 캐릭터의 관점에서 유사한 기억을 찾아야 의미 있음.
- 예: 원본 "유저가 카페에서 웃음" → 캐릭터A 해석 "나한테 마음을 열어가고 있다" → 이 해석이 검색 대상

### 4-C. searchCharacterMemories() 수정 (line 418-452)

**변경 전** (현재):
```typescript
export async function searchCharacterMemories(params: {
  sessionId: string;
  characterId: string;
  keywords?: string[];
  memoryType?: string;
  minImportance?: number;
  limit?: number;
}): Promise<Array<{ id: string; originalEvent: string; interpretation: string; importance: number; createdAt: Date }>> {
  const memories = await prisma.characterMemory.findMany({
    where: {
      sessionId: params.sessionId,
      characterId: params.characterId,
      ...(params.memoryType && { memoryType: params.memoryType }),
      ...(params.minImportance && { importance: { gte: params.minImportance } }),
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    take: params.limit || 10,
  });
  return memories.map(m => ({ ... }));
}
```

**변경 후**:
```typescript
export async function searchCharacterMemories(params: {
  sessionId: string;
  characterId: string;
  queryEmbedding?: number[];     // 추가: 유저 입력 임베딩
  keywords?: string[];
  memoryType?: string;
  minImportance?: number;
  limit?: number;
}): Promise<Array<{ id: string; originalEvent: string; interpretation: string; importance: number; createdAt: Date; similarity?: number }>> {

  // 전체 기억 로드 (embedding 포함)
  const memories = await prisma.characterMemory.findMany({
    where: {
      sessionId: params.sessionId,
      characterId: params.characterId,
      ...(params.memoryType && { memoryType: params.memoryType }),
      ...(params.minImportance && { importance: { gte: params.minImportance } }),
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    // 임베딩 검색 시: 전체 로드 후 인메모리 정렬 (최대 100개)
    // 폴백 시: 기존처럼 limit 적용
    take: params.queryEmbedding?.length ? 100 : (params.limit || 10),
  });

  // 임베딩 기반 정렬 (queryEmbedding이 있을 때)
  if (params.queryEmbedding?.length) {
    const scored = memories.map(m => {
      const emb: number[] = JSON.parse(m.embedding || '[]');
      const similarity = emb.length > 0
        ? cosineSimilarity(params.queryEmbedding!, emb)
        : 0;
      // 복합 점수: 유사도 70% + 중요도 20% + 강도 10%
      const score = similarity * 0.7 + m.importance * 0.2 + m.strength * 0.1;
      return { ...m, similarity, score };
    });

    // 유사도 기반 정렬 → 상위 N개
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, params.limit || 5);

    return top.map(m => ({
      id: m.id,
      originalEvent: m.originalEvent,
      interpretation: m.interpretation,
      importance: m.importance,
      createdAt: m.createdAt,
      similarity: m.similarity,
    }));
  }

  // 폴백: 기존 importance 기반 (queryEmbedding 없거나 빈 배열)
  return memories.map(m => ({
    id: m.id,
    originalEvent: m.originalEvent,
    interpretation: m.interpretation,
    importance: m.importance,
    createdAt: m.createdAt,
  }));
}
```

**복합 점수 공식**: `score = similarity * 0.7 + importance * 0.2 + strength * 0.1`

| 가중치 | 근거 |
|--------|------|
| 유사도 70% | 현재 대화 맥락과의 관련성이 가장 중요 |
| 중요도 20% | 중요한 기억(감정적 순간 등)이 약간 우선 |
| 강도 10% | 최근/자주 언급된 기억이 약간 우선 |

### 4-D. buildNarrativeContext() 수정 (line 572-610)

**변경 전**:
```typescript
export async function buildNarrativeContext(
  sessionId: string,
  characterId: string,
  characterName: string
): Promise<{ ... }> {
  // ...
  const recentMemories = await searchCharacterMemories({
    sessionId,
    characterId,
    limit: 5,
    minImportance: 0.3,
  });
  // ...
}
```

**변경 후**:
```typescript
export async function buildNarrativeContext(
  sessionId: string,
  characterId: string,
  characterName: string,
  userMessage?: string           // 추가: 유저의 현재 입력 (optional)
): Promise<{ ... }> {
  // 1. 관계 상태 가져오기 (변경 없음)
  const relationship = await getOrCreateRelationship(sessionId, characterId, characterName);

  // 2. 유저 입력 임베딩 생성 (있을 때만)
  let queryEmbedding: number[] | undefined;
  if (userMessage) {
    queryEmbedding = await generateEmbedding(userMessage);
    if (queryEmbedding.length === 0) queryEmbedding = undefined; // 실패 시 폴백
  }

  // 3. 기억 검색 (임베딩 기반 또는 폴백)
  const recentMemories = await searchCharacterMemories({
    sessionId,
    characterId,
    queryEmbedding,              // undefined면 기존 방식으로 폴백
    limit: 5,
    minImportance: 0.3,
  });

  // 4. 현재 장면 정보 (변경 없음)
  const sceneContext = await getActiveScene(sessionId);

  // 5. 서사 프롬프트 생성 (변경 없음)
  const narrativePrompt = generateNarrativePrompt(
    characterName,
    relationship,
    recentMemories,
    sceneContext
  );

  return { relationship, recentMemories, sceneContext, narrativePrompt };
}
```

**핵심**: 4번째 파라미터 `userMessage`는 **optional** → 기존 호출자가 인자 없이 호출해도 정상 동작 (폴백)

---

## 5. Step 4: route.ts 수정 (1줄)

### 파일: `src/app/api/chat/route.ts` (line 260)

**변경 전**:
```typescript
presentChars.map(c =>
  buildNarrativeContext(sessionId, c.id, c.name)
    .catch(() => ({ ... }))
)
```

**변경 후**:
```typescript
presentChars.map(c =>
  buildNarrativeContext(sessionId, c.id, c.name, content)  // content = 유저 메시지
    .catch(() => ({ ... }))
)
```

`content`는 이미 line 170에서 `const { content } = body;`로 추출되어 있음.

---

## 6. Step 5: DB 마이그레이션 + 검증

```bash
# 1. Schema 반영
npx prisma db push

# 2. 빌드 검증
npm run build

# 3. 배포
npx vercel --prod
```

---

## 7. 실행 흐름 다이어그램

```
유저 메시지 입력: "저번에 카페에서 한 약속 기억해?"
          │
          ▼
    route.ts PUT handler
          │
          ├─ content = "저번에 카페에서 한 약속 기억해?"
          │
          ▼
    buildNarrativeContext(sessionId, charId, charName, content)
          │
          ├─ [1] getOrCreateRelationship()     ← 변경 없음
          │
          ├─ [2] generateEmbedding(content)     ← NEW
          │       → [0.12, -0.34, 0.56, ...]   (256차원)
          │       → 실패 시 [] → queryEmbedding = undefined
          │
          ├─ [3] searchCharacterMemories({ queryEmbedding })  ← MODIFIED
          │       │
          │       ├─ DB에서 해당 캐릭터 기억 전체 로드 (최대 100개)
          │       │
          │       ├─ 각 기억의 embedding과 코사인 유사도 계산:
          │       │   "카페에서 유저가 나중에 다시 만나자고 약속"  → sim: 0.89
          │       │   "유저가 비 오는 날 우산을 건네줌"           → sim: 0.23
          │       │   "유저가 화를 내며 자리를 떠남"              → sim: 0.11
          │       │
          │       ├─ score = sim*0.7 + importance*0.2 + strength*0.1
          │       │
          │       └─ 상위 5개 반환
          │
          ├─ [4] getActiveScene()               ← 변경 없음
          │
          └─ [5] generateNarrativePrompt()      ← 변경 없음
                  │
                  └─ "[캐릭터의 최근 기억]
                      - 카페에서 유저가 나중에 다시 만나자고 약속"
                      ← 맥락에 맞는 기억이 선택됨!
```

---

## 8. 폴백 매트릭스

| 상황 | 동작 |
|------|------|
| userMessage 없음 (기존 호출) | queryEmbedding = undefined → importance 정렬 (기존 방식) |
| Embedding API 실패 | queryEmbedding = [] → undefined 처리 → importance 정렬 |
| 기억에 embedding 없음 (기존 데이터) | cosineSimilarity 결과 0 → importance/strength로만 정렬 |
| 기억 0개 | 빈 배열 반환 (기존과 동일) |
| 모든 기억의 유사도 동일 | importance → strength 순으로 차등 (가중치 30%) |

---

## 9. 성능 설계

| 단계 | 추가 지연 | 비고 |
|------|----------|------|
| generateEmbedding(userMessage) | ~100ms | 1회, 비동기 |
| DB 전체 로드 (100개) | ~5ms | 기존 쿼리와 유사 (인덱스 사용) |
| 코사인 유사도 계산 (100개 x 256차원) | ~1ms | 순수 산술 연산 |
| JSON.parse(embedding) x 100 | ~2ms | 문자열 파싱 |
| **합계** | **~110ms** | 기존 대비 추가분 |

기존 narrative-memory 단계가 ~50ms → ~160ms로 증가. 전체 응답 시간(5-10초) 대비 미미.

---

## 10. 수정하지 않는 파일 목록

| 파일 | 이유 |
|------|------|
| `src/lib/gemini.ts` — `buildSystemInstruction()` | 시스템 프롬프트에 영향 없음 |
| `src/lib/gemini.ts` — `buildContents()` | narrativePrompt는 이미 포함됨 |
| `src/lib/gemini.ts` — `generateStoryResponseStream()` | 스트리밍 로직 무관 |
| `src/lib/gemini.ts` — `generateProAnalysis()` | Pro 분석 무관 |
| `src/components/chat/*` | 프론트엔드 변경 없음 |
| `src/app/api/chat/pro-analyze/route.ts` | Pro 분석 API 무관 |
| narrative-memory.ts — `decayMemoryStrength()` | 감쇠 로직 무관 (embedding은 감쇠 안 함) |
| narrative-memory.ts — `pruneWeakMemories()` | 삭제 시 embedding도 함께 삭제됨 (정상) |
| narrative-memory.ts — `processConversationForMemory()` | 내부에서 `saveCharacterMemory()` 호출 → 자동 적용 |

---

## 11. 테스트 시나리오

### TC-1: 기본 동작 (새 기억 저장 + 임베딩 검색)
1. 새 대화 시작 → 몇 턴 진행 → 기억 저장 시 embedding 생성 확인
2. "저번에 ~했잖아" 류 입력 → 관련 기억이 importance 순과 다른 결과 반환

### TC-2: 폴백 (Embedding API 실패)
1. 기존 대화 (embedding 없는 기억) → importance 기반 정상 동작
2. API 실패 시뮬레이션 → 폴백으로 importance 기반 반환

### TC-3: 하위 호환성
1. 기존 세션 대화 계속 → 에러 없이 정상 동작
2. `buildNarrativeContext` 4번째 인자 없이 호출 → 기존 방식 동작

### TC-4: 성능
1. 100개 기억 + 임베딩 검색 → 전체 지연 200ms 이내

---

## 12. 구현 체크리스트

- [ ] **Step 1**: `prisma/schema.prisma` — CharacterMemory에 `embedding String @default("[]")` 추가
- [ ] **Step 2**: `src/lib/gemini.ts` — `generateEmbedding()` 함수 추가
- [ ] **Step 3-A**: `src/lib/narrative-memory.ts` — `cosineSimilarity()` 유틸 추가
- [ ] **Step 3-B**: `src/lib/narrative-memory.ts` — `saveCharacterMemory()` 수정 (embedding 생성 추가)
- [ ] **Step 3-C**: `src/lib/narrative-memory.ts` — `searchCharacterMemories()` 수정 (임베딩 검색 추가)
- [ ] **Step 3-D**: `src/lib/narrative-memory.ts` — `buildNarrativeContext()` 수정 (userMessage 파라미터 추가)
- [ ] **Step 4**: `src/app/api/chat/route.ts` — `buildNarrativeContext` 호출에 content 전달
- [ ] **Step 5**: `npx prisma db push` → `npm run build` → `npx vercel --prod`
