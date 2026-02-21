# Plan: 임베딩 기반 메모리 검색 (embedding-memory-search)

> PDCA Phase: **Plan**
> Created: 2026-02-12
> Feature Priority: 1 (최상)

---

## 1. 문제 정의

### 현재 상태 (AS-IS)

`searchCharacterMemories()` (narrative-memory.ts:418-452)는 **importance DESC + createdAt DESC** 고정 정렬로 상위 5개 기억만 가져옴.

```typescript
// 현재 코드 (narrative-memory.ts:434-442)
const memories = await prisma.characterMemory.findMany({
  where: {
    sessionId, characterId,
    ...(memoryType && { memoryType }),
    ...(minImportance && { importance: { gte: minImportance } }),
  },
  orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
  take: params.limit || 10,
});
```

### 문제점

1. **의미적 관련성 무시**: 유저가 "저번에 카페에서 한 약속 기억나?"라고 해도, 카페 관련 기억이 importance 순위에서 밀려있으면 검색 불가
2. **고정 정렬 = 항상 같은 기억**: 매번 같은 상위 5개만 참조 → 다양한 과거 경험 활용 불가
3. **keywords 필드 미사용**: `CharacterMemory`에 `keywords` 필드가 있지만 검색에 활용 안 됨
4. **대화 맥락과 무관한 기억 주입**: 전투 장면에서 일상 기억이 주입되는 등 부조화

### 목표 상태 (TO-BE)

유저의 현재 입력과 **의미적으로 가장 관련 있는** 기억을 동적으로 검색하여 Gemini 프롬프트에 주입.

```
[현재] importance 순 → 항상 상위 5개 (정적)
[개선] 유저 입력 임베딩 ↔ 기억 임베딩 코사인 유사도 → 관련도 상위 5개 (동적)
```

---

## 2. 요구사항

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| R1 | CharacterMemory 저장 시 임베딩 벡터 생성 및 저장 | 필수 |
| R2 | 유저 입력을 임베딩하여 관련 기억 코사인 유사도 검색 | 필수 |
| R3 | 기존 `buildNarrativeContext()` 흐름에 자연스럽게 통합 | 필수 |
| R4 | 임베딩 API 실패 시 기존 importance 기반 폴백 | 필수 |
| R5 | 기존 메모리 감쇠/가지치기 로직과 충돌 없음 | 필수 |
| R6 | 응답 지연 최소화 (임베딩 API 호출 < 500ms) | 필수 |
| R7 | 기존 데이터 무중단 마이그레이션 (embedding 없는 기억도 동작) | 필수 |

---

## 3. 기술 조사

### Gemini Embedding API

- 모델: `text-embedding-004` (Google 최신)
- 차원: 768 (기본) — `outputDimensionality` 파라미터로 256까지 축소 가능
- 비용: **무료 티어 포함** (분당 1500 요청)
- SDK: `@google/genai` (이미 설치됨)

```typescript
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const result = await ai.models.embedContent({
  model: 'text-embedding-004',
  contents: [{ parts: [{ text: '검색할 텍스트' }] }],
  config: { outputDimensionality: 256 }, // 768 → 256으로 축소 (성능/비용 최적)
});
const embedding = result.embeddings[0].values; // number[]
```

### 벡터 저장 전략

**옵션 A: PostgreSQL + pgvector** (선택)
- Vercel Postgres / Neon에서 pgvector 확장 지원
- Prisma에서 `Float[]` + raw SQL로 코사인 유사도 계산 가능
- 별도 벡터 DB 인프라 불필요

**옵션 B: 인메모리 코사인 계산** (대안)
- DB에 Float[] 저장 → 앱에서 코사인 계산
- 세션당 100개 제한이므로 성능 문제 없음
- pgvector 설치 없이 구현 가능

→ **옵션 B 채택**: 세션당 최대 100개 기억이므로 인메모리 계산으로 충분. 인프라 변경 없이 구현 가능.

### 코사인 유사도 계산

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

---

## 4. 영향 범위 분석

### 수정 파일 (4개)

| 파일 | 변경 내용 | 위험도 |
|------|---------|--------|
| `prisma/schema.prisma` | CharacterMemory에 `embedding Float[]` 필드 추가 | 낮음 (optional 필드) |
| `src/lib/narrative-memory.ts` | 임베딩 생성/검색 함수 추가, `buildNarrativeContext` 수정 | 중간 |
| `src/lib/gemini.ts` | `generateEmbedding()` 헬퍼 함수 추가 | 낮음 (추가만) |
| `src/app/api/chat/route.ts` | `buildNarrativeContext`에 userMessage 전달 | 낮음 |

### 건드리지 않는 것

- `buildSystemInstruction()` — 변경 없음
- `buildContents()` — narrativePrompt는 이미 포함되고 있으므로 변경 없음
- `generateStoryResponseStream()` — 변경 없음
- 프론트엔드 코드 — 변경 없음
- Pro 분석 로직 — 변경 없음

### 하위 호환성

- `embedding` 필드는 `Float[] @default([])` → 기존 기억은 빈 배열
- 임베딩 없는 기억은 기존 importance 기반으로 폴백
- API 실패 시 자동 폴백 → 서비스 중단 없음

---

## 5. 데이터 흐름 (변경 후)

```
[기억 저장 시]
saveCharacterMemory()
  → interpretation 텍스트 → Gemini Embedding API → 256차원 벡터
  → CharacterMemory.embedding에 저장

[기억 검색 시]
buildNarrativeContext(sessionId, characterId, characterName, userMessage)
  → userMessage → Gemini Embedding API → 256차원 쿼리 벡터
  → 해당 캐릭터의 모든 기억 로드 (embedding 포함)
  → 코사인 유사도 계산 → 상위 5개 선택
  → generateNarrativePrompt()에 전달

[폴백]
임베딩 API 실패 또는 embedding 없는 기억
  → 기존 importance DESC 정렬로 폴백
```

---

## 6. 성능 예측

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 기억 저장 시 | DB INSERT만 | + Embedding API 1회 (~100ms) |
| 기억 검색 시 | DB 쿼리 1회 | DB 쿼리 1회 + Embedding API 1회 (~100ms) + 인메모리 코사인 계산 (~1ms) |
| 총 추가 지연 | 0ms | ~100-200ms (체감 영향 미미) |
| DB 용량 증가 | 0 | 기억당 +256 float = +1KB |
| API 비용 | 0 | Embedding API 무료 티어 내 |

---

## 7. 리스크 및 완화

| 리스크 | 확률 | 완화 전략 |
|--------|------|---------|
| Gemini Embedding API 지연/실패 | 중 | 타임아웃 3초 + importance 폴백 |
| 임베딩 차원 불일치 (모델 버전 변경) | 낮 | 256 고정 + 불일치 시 재생성 |
| 기존 기억에 embedding 없음 | 확실 | 빈 배열은 폴백 처리 |
| Prisma Float[] 호환성 | 낮 | PostgreSQL native 지원 |

---

## 8. 검증 기준

- [ ] `npm run build` 성공
- [ ] 기존 대화 기능 정상 동작 (기존 기억도 폴백으로 정상 검색)
- [ ] 새 기억 저장 시 embedding 벡터 생성 확인
- [ ] 유저 입력 관련 기억이 importance 순과 다른 결과를 반환하는 케이스 확인
- [ ] Embedding API 실패 시 폴백으로 기존 방식 동작 확인
- [ ] 응답 지연 200ms 이내 추가 확인
