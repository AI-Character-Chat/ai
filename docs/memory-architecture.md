# SYNK Character Chat - Memory Architecture

> 최종 업데이트: 2026-02-10
> 논문 비교용 종합 문서 (v2)

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    3-Layer Memory System                        │
├────────────────┬──────────────────────┬────────────────────────┤
│  Layer 1       │  Layer 2             │  Layer 3               │
│  Conversation  │  Narrative Memory    │  Mem0 Cloud            │
│  History       │  (Prisma/PostgreSQL) │  (Semantic Search)     │
├────────────────┼──────────────────────┼────────────────────────┤
│ 최근 30메시지   │ 관계 상태 + knownFacts│ 장기 사실 기억          │
│ + 임베딩 검색   │ + CharacterMemory    │ 시맨틱 검색 백업        │
│ (단기 맥락)     │ (중기/장기 관계)      │ (장기 사실)             │
└────────────────┴──────────────────────┴────────────────────────┘
```

### 역할 분담

| Layer | 저장소 | 역할 | 스코핑 |
|-------|--------|------|--------|
| **Conversation History** | Message 테이블 (PostgreSQL) | 최근 대화 맥락 | sessionId |
| **Narrative Memory** | Prisma (PostgreSQL) | 관계/감정/기억 추적, knownFacts | userId + workId (크로스세션) |
| **Mem0 Cloud** | mem0ai API | 장기 사실 시맨틱 검색 | user_id + agent_id (캐릭터별 격리) |

---

## 2. 데이터 모델 (Prisma Schema)

### 2-1. UserCharacterRelationship (관계 상태)

```
스코핑: @@unique([userId, workId, characterId])
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `intimacyLevel` | string | stranger → acquaintance → friend → close_friend → intimate |
| `intimacyScore` | float (0-100) | 5축 가중 평균으로 자동 계산 |
| `trust` | float (0-100) | 신뢰도 (약속/비밀 이행) |
| `affection` | float (0-100) | 호감도 (정서적 친밀감) |
| `respect` | float (0-100) | 존경도 (능력/인품 인정) |
| `rivalry` | float (0-100) | 경쟁심 (대립/라이벌 의식) |
| `familiarity` | float (0-100) | 친숙도 (함께한 경험량) |
| `knownFacts` | JSON array | 캐릭터가 유저에 대해 아는 사실 |
| `emotionalHistory` | JSON array | 감정 변화 기록 [{emotion, intensity, at}] |
| `sharedExperiences` | JSON array | 공유 경험 (최근 20개) |
| `speechStyle` | string | formal / casual / intimate |

**intimacyScore 계산 공식:**

```
score = affection*0.35 + trust*0.25 + familiarity*0.25 + respect*0.15 - rivalry*0.1
```

**레벨 매핑:**

```
>=80 → intimate | >=60 → close_friend | >=40 → friend | >=20 → acquaintance | <20 → stranger
```

### 2-2. CharacterMemory (캐릭터 기억)

```
스코핑: @@index([userId, workId, characterId, memoryType])
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `originalEvent` | string | 원본 사건 (유저 행동) |
| `interpretation` | string | 캐릭터 관점 해석 |
| `memoryType` | string | episodic / semantic / emotional |
| `importance` | float (0-1) | 중요도 (surprise로 조정됨) |
| `strength` | float (0-1) | 기억 강도 (시간/감쇠로 감소) |
| `embedding` | JSON (256-dim) | 코사인 유사도 검색용 벡터 |
| `mentionedCount` | int | 회상 횟수 (3회 이상 → 승격) |

### 2-3. 기타 메모리 관련 모델

| 모델 | 역할 |
|------|------|
| `Scene` | 장면 단위 서사 추적 (장소, 시간, 참여자, 감정톤, 토픽) |
| `ConversationLog` | 원본 대화 전문 보관 (데이터 소유권 확보) |
| `RelationshipChange` | 관계 변화 이력 기록 (Scene 단위) |

---

## 3. knownFacts 분류 시스템 (Identity vs Moment)

### 분류 기준

```typescript
IDENTITY_KEYWORDS = [
  // 기본 신원
  '이름', '나이', '살이', '살)', '세이', '세)', '직업', '전공', '학과', '학교', '대학',
  '혈액형', 'MBTI', '키가', '키는', '몸무게', '생일', '고향', '출신', '성별',
  // 가족/인물
  '아버지', '어머니', '아빠', '엄마', '언니', '오빠', '누나', '형이', '형은',
  '동생', '여동생', '남동생', '할머니', '할아버지', '가족',
  // 신체/특성
  '왼손잡이', '오른손잡이', '알레르기', '공포증', '트라우마',
  // 반려동물
  '반려', '애완', '펫', '강아지', '고양이',
]
```

### 프롬프트 주입 전략

| 분류 | 주입 방식 | 형식 | 목적 |
|------|----------|------|------|
| **Identity** | 전량 주입 (상한 없음) | `- **fact**` (볼드) | 불변 정보 - Flash가 절대 틀리면 안 됨 |
| **Moment** | 최근 10개 slice | `- fact` (일반) | 변동 정보 - 최신만 유지 |

### Correction Hook (충돌 해결)

```
extractFactKey("직업: 개발자")   → "직업"
extractFactKey("나이는 25살")    → "나이"
extractFactKey("왼손잡이이다")   → "_손잡이" (binary opposite)
```

**동작**: 같은 key의 fact가 이미 존재하면 최신 값으로 **교체** (Set 중복제거 대신)

---

## 4. Surprise-Based Memory Filtering (Titans 개념)

`evaluateMemoryNovelty()` - 새 기억이 기존 대비 얼마나 "놀라운지" 평가

```
신규 기억 embedding ──→ 기존 기억 50개와 cosine similarity 비교
                           │
                    ┌──────┼──────┐
                    ▼      ▼      ▼
              >=0.85     0.6~0.85    <0.6
              reinforce   skip/save   save + boost
```

| 유사도 | 판정 | 행동 |
|--------|------|------|
| >= 0.85 | 기존과 동일 | 기존 기억 strength +0.2, mentionedCount +1 |
| 0.6~0.85 | 뻔한 정보 | importance >= 0.7이면 30% 감쇠 저장, 아니면 skip |
| < 0.6 | 놀라운 정보 | importance + surpriseScore*0.3 (최대 +0.3) |

---

## 5. Emotion-Weighted Memory Decay (Ebbinghaus)

`decayMemoryStrength()` - 5턴마다 실행

```
factor = baseFactor + (1 - baseFactor) * (emotionIntensity * 0.4 + importance * 0.3)
  → 최대 0.995로 clamp
  → strength > 0.1인 기억만 대상
```

| memoryType | baseFactor | 의미 |
|------------|-----------|------|
| episodic | 0.95 | 가장 빠른 감쇠 |
| emotional | 0.97 | 중간 감쇠 |
| semantic | 0.98 | 가장 느린 감쇠 |

---

## 6. A-MEM (Memory Evolution Pipeline)

### 6-1. Consolidation (통합) - 10턴마다

```
episodic 기억 50개 로드
  → cosine similarity >= 0.80인 그룹 탐색
  → 그룹 내 interpretation 병합 → 1개 semantic 기억 생성
  → 원본 episodic 삭제
```

### 6-2. Promotion (승격) - 10턴마다

```
episodic 중 mentionedCount >= 3 → memoryType='semantic', importance=0.8
```

### 6-3. Pruning (정리) - 25턴마다

```
1. strength < 0.15 AND mentionedCount = 0 → 삭제
2. userId+workId 스코프당 100개 초과 → importance/strength 낮은 것부터 삭제
```

---

## 7. 매 턴 데이터 흐름

```
유저 메시지 입력
     │
     ▼
[buildChatContext] ─── 병렬 실행 ──┐
  │                                 │
  ├─ buildNarrativeContext()        ├─ searchMemoriesForCharacters() (mem0)
  │   ├─ getOrCreateRelationship()  │   ├─ general search (limit 10, rerank)
  │   ├─ searchCharacterMemories()  │   └─ caution search (limit 3)
  │   └─ generateNarrativePrompt()  │       → 2초 타임아웃
  │       ├─ Identity facts (볼드)   │
  │       ├─ Moment facts (10개)    │
  │       └─ 기억/감정/장면         │
  │                                 │
  └─────────── 합쳐서 Gemini Flash 프롬프트 주입 ──────┘
                     │
                     ▼
             Gemini Flash 응답 (SSE 스트리밍)
                     │
                     ▼
          [processImmediateMemory] ← SSE 종료 전 동기 실행
            ├─ processConversationForMemory()
            │   ├─ updateRelationship() (다축 + knownFacts + Correction Hook)
            │   └─ saveCharacterMemory() (Surprise 필터링)
            └─ → memory_update SSE 이벤트로 결과 전송
                     │
                     ▼
          [processRemainingBackgroundTasks] ← fire-and-forget
            ├─ addMemory() (mem0 저장, 캐릭터별)
            ├─ triggerSummary() (5턴마다)
            ├─ decayMemoryStrength() (5턴마다)
            ├─ consolidateMemories() (10턴마다)
            ├─ promoteMemories() (10턴마다)
            ├─ pruneWeakMemories() (25턴마다)
            └─ pruneMem0Memories() (25턴마다, 캐릭터당 100개 상한)
```

---

## 8. Mem0 Cloud 연동

### 설정

- **API**: mem0ai SDK (`MemoryClient`)
- **격리**: `user_id: "user_{userId}"`, `agent_id: "char_{characterId}"`
- **프로젝트 카테고리**: identity, people, preferences, caution, shared_events, requests, situation (7개)
- **custom_instructions**: 노이즈 필터링 (인사, 날씨, 단순 감정 제외)

### 검색 전략

```
일반 검색 (limit 10, rerank=true)  ─┐
                                      ├─ 병렬 → 중복 제거 병합 (caution 우선)
caution+identity 검색 (limit 3)    ─┘
→ 전체 2초 타임아웃 (실패 시 빈 결과)
```

### Rate Limit 관리

- 429 감지 시 1분 쿨다운 (`RATE_LIMIT_COOLDOWN = 60000ms`)

---

## 9. 크로스세션 메모리 스코핑

```typescript
interface MemoryScope {
  userId: string;   // 유저 식별 (세션 넘어 유지)
  workId: string;   // 작품 식별 (세션 넘어 유지)
  sessionId: string; // Scene 연결용 (세션별 고유)
}
```

### 레거시 호환 (마이그레이션)

```
1차 검색: userId + workId + characterId (크로스세션)
    ↓ 없으면
2차 검색: sessionId + characterId (레거시)
    ↓ 찾으면
자동 백필: userId, workId 추가
    ↓ 없으면
신규 생성: 크로스세션 필드 포함
```

---

## 10. Pro Background Analysis (Hybrid Architecture)

```
Flash 응답 완료 후 → 클라이언트가 /api/chat/pro-analyze 호출
                       │
                       ▼
                  Gemini 2.5 Pro (thinking 모드)
                       │
                  분석 결과:
                  ├─ 디렉터 노트 (다음 턴 Flash에 주입)
                  └─ relationshipDeltas (다축 관계 변화값)
                       │
                       ▼
                  ChatSession.proAnalysis에 저장
                       │
                  다음 턴 processImmediateMemory에서
                  relationshipDeltas 파싱하여 적용
```

---

## 11. 핵심 수치 요약

| 항목 | 값 | 위치 |
|------|------|------|
| 임베딩 차원 | 256 | gemini.ts (text-embedding-004) |
| 최근 메시지 수 | 30 | route.ts |
| 관련 메시지 검색 | 5개 | chat-service.ts |
| 기억 검색 수 | 10 | narrative-memory.ts |
| knownFacts Moment 슬라이스 | 최근 10 | narrative-memory.ts |
| 공유 경험 상한 | 20 | narrative-memory.ts |
| 기억 강도 하한 (정리 대상) | 0.15 | narrative-memory.ts |
| 스코프당 최대 기억 | 100 | narrative-memory.ts |
| Mem0 캐릭터당 상한 | 100 | chat-service.ts |
| Mem0 타임아웃 | 2000ms | memory.ts |
| Surprise reinforce 임계값 | >= 0.85 | narrative-memory.ts |
| Surprise skip 임계값 | 0.6 ~ 0.85 | narrative-memory.ts |
| Consolidation 유사도 | >= 0.80 | narrative-memory.ts |
| Promotion mentionedCount | >= 3 | narrative-memory.ts |
| 기억 검색 복합 점수 | sim*0.7 + imp*0.2 + str*0.1 | narrative-memory.ts |

---

## 12. 파일 맵

| 파일 | 역할 |
|------|------|
| `src/lib/narrative-memory.ts` | 관계/기억/장면 관리, Surprise 필터, Decay, A-MEM |
| `src/lib/memory.ts` | Mem0 Cloud 연동 (검색/저장/정리) |
| `src/lib/chat-service.ts` | 오케스트레이터 - buildChatContext + processImmediate/Background |
| `src/lib/gemini.ts` | AI 호출 + 임베딩 + extractedFacts 프롬프트 |
| `src/app/api/chat/route.ts` | SSE 스트리밍, 메시지 저장, 메모리 처리 트리거 |
| `src/app/api/chat/pro-analyze/route.ts` | Pro 백그라운드 분석 (디렉터 노트 + 다축 델타) |
| `prisma/schema.prisma` | DB 스키마 (6개 메모리 관련 모델) |

---

## 13. 학술적 개념 매핑 (Academic Concept Mapping)

현재 시스템에서 사용 중인 기법과 그 학술적 기원:

| 시스템 기법 | 학술 개념 | 구현 상태 | 비고 |
|------------|----------|----------|------|
| 3-Layer Memory | Atkinson-Shiffrin 다중 저장소 모델 | 구현 완료 | 감각→단기→장기 매핑 |
| Emotion-Weighted Decay | Ebbinghaus 망각 곡선 + 감정 보정 | 구현 완료 | 감정 강도가 감쇠율 조절 |
| Surprise-based Filtering | Titans (Google, 2024) | 구현 완료 | surprise score로 저장 여부 결정 |
| Consolidation + Promotion | A-MEM (Memory Evolution) | 구현 완료 | episodic → semantic 승격 |
| Identity/Moment Split | Tulving의 Semantic/Episodic 구분 | 구현 완료 (키워드 기반) | 분류 정확도 38% — 개선 필요 |
| Correction Hook | Fact Conflict Resolution | 구현 완료 (regex key 추출) | 시맨틱 충돌 감지 미구현 |
| Multi-Axis Relationship | 다축 관계 모델 (심리학) | 구현 완료 | trust/affection/respect/rivalry/familiarity |
| Cross-Session Persistence | Persistent Memory | 구현 완료 | userId+workId 스코핑 |
| Dual-Model Architecture | Hybrid Flash+Pro | 구현 완료 | Flash(실시간) + Pro(백그라운드 분석) |
| Semantic Search (mem0) | RAG 패턴 | 구현 완료 | 256-dim embedding + reranking |
| Character-Specific Interpretation | Perspective-Taking Memory | 부분 구현 | 현재 단순 연결 문자열, AI 해석 미적용 |

### 미구현 / 미적용 개념

| 개념 | 설명 | 적용 가능성 |
|------|------|-----------|
| Reflection/Self-Review | 주기적으로 기억을 재평가하여 상위 추상화 생성 | 높음 — Pro 백그라운드에서 가능 |
| Memory Retrieval Augmentation | 검색 결과를 재가공하여 프롬프트에 최적화 | 중간 |
| Temporal Awareness | 시간 경과에 따른 기억 맥락 변화 | 낮음 — 현재 createdAt만 사용 |
| Episodic Buffer | 작업 기억 영역에서 단기 통합 | 미구현 |
| Schema-based Memory | 사전 정의된 스키마로 기억 구조화 | 미구현 — knownFacts가 비구조적 |
| Emotional Tagging on Facts | 개별 fact에 감정 태그 부착 | 미구현 — CharacterMemory만 감정 보유 |
| Importance Scoring on Facts | knownFacts 개별 항목에 중요도 | 미구현 — 전부 동일 가중치 |

---

## 14. 실험 결과 및 성능 분석

### 14-1. 테스트 이력

| 테스트 | 턴 수 | 조건 | 50+턴 회상률 | 주요 변경점 |
|--------|------|------|------------|-----------|
| 1차 | 62 | 기본 시스템 | 60% | baseline |
| 2차 | 62 | extractedFacts 버그 수정 | 85% | fact 추출 정상화 |
| 3차 | 101 | Identity/Moment 분류 + Correction Hook | **48%** | 오히려 하락 |

### 14-2. 3차 테스트 상세 (101턴, 25개 항목 추적)

**테스트 설계:**
```
T1-T13:  Identity 13개 심기 (이름, 나이, 직업 등)
T14-T25: Lifestyle 12개 심기 (취미, 반려동물 등)
T26-T75: Noise 대화 50턴 (스토리 진행)
T76-T81: 1차 검증 (직접 질문)
T82-T98: 추가 Noise 17턴
T99-T101: 2차 검증 (직접 질문)
```

**검증 결과:**

| 검증 시점 | 직접 질문 항목 | 정답 | 오답 | 미검증 | 정답률 (질문 기준) | 정답률 (전체 기준) |
|----------|-------------|------|------|--------|----------------|----------------|
| 1차 (T76) | 15개 | 7 | 8 | 10 | 47% | 36% (9/25*) |
| 2차 (T99) | 12개 | 12 | 0 | 13 | 100% | 48% (12/25) |

*1차에서 noise 중 관찰 포함 시 9개

**항목별 결과:**

```
                              1차(T76)  2차(T99)  Noise중  Identity분류
이름 (김민수)                    ✅        ✅       반복사용   Identity ✅
나이 (20살)                     ✅        ✅       -         Identity ✅
직업/전공 (대학생/컴공)           ✅        ✅       T59확인   Identity ✅
MBTI (INFP)                    ✅        ✅       T67확인   Identity ✅
좋아하는 음식 (떡볶이)            ✅        ✅       T83확인   Moment ❌
반려동물 (나비/러시안블루)         ✅        ✅       T83확인   Identity ✅
K-pop/BTS                     ✅        미검증    -         Moment ❌
거미 (공포)                     ⚠️부분    ✅       T62확인   Identity ✅
베프 (정호)                     ⚠️부분    ✅       T83확인   Moment ❌
좋아하는 계절 (가을)             미검증     ✅       T86확인   Moment ❌
좋아하는 색 (파란색)             미검증     ✅       T89확인   Moment ❌
알레르기 (땅콩)                 미검증     ✅       T87확인   Identity ✅
알바 (카페)                    미검증     ✅       T92확인   Moment ❌
─── 이하 1차 ❌, 2차 미검증 ───────────────────────────────────────
거주지 (서울 강남구)             ❌        미검증    T59부분   Moment ❌ ← 키워드 없음
생일 (3월 15일)                ❌        미검증    -         Identity? ← 형식 의존
혈액형 (A형)                   ❌        미검증    -         Identity? ← 형식 의존
키 (178cm)                    ❌        미검증    -         Moment ❌ ← '키가/키는' 불일치
별명 (수수)                    ❌        미검증    루나사용   Moment ❌ ← 키워드 없음
가족 (외동아들)                 ❌        미검증    -         Identity? ← 형식 의존
고향 (부산)                    ❌        미검증    -         Identity ✅ ← 그런데도 ❌
꿈 (게임 개발자)                ❌        미검증    -         Moment ❌ ← 키워드 없음
취미 (독서/판타지)              미검증     미검증    -         Moment ❌
운동 (수영)                    미검증     미검증    T96간접   Moment ❌
영화 (인터스텔라)               미검증     미검증    -         Moment ❌
연애상태 (솔로)                 미검증     미검증    -         Moment ❌
```

### 14-3. 핵심 발견

**발견 1: Identity 분류 커버리지 부족**
- 25개 항목 중 Identity로 올바르게 분류되는 것: 7개 (28%)
- 나머지 18개는 Moment로 분류 → `.slice(-10)`에서 탈락 위험
- 원인: `isIdentityFact()`가 **fact 전체 문자열에서 키워드 포함 여부**만 체크
- "주제: 내용" 형식의 "주제" 부분을 활용하지 않음

**발견 2: knownFacts 폭증**
- T17 시점에서 이미 34개 (아리엘 기준)
- extractedFacts가 행동("유저의 행동: 꽃을 선물했다")까지 추출
- T76 시점 추정 50-70개 → Moment 55+개 중 10개만 주입

**발견 3: 재언급(Re-mention) 효과**
- 2차 검증에서 100% 맞춘 12개 중 7개가 Noise 대화 중 자연스럽게 재언급됨
- 재언급된 항목은 A-MEM reinforcement로 strength 강화
- 한 번만 심고 재언급 안 된 항목(생일, 혈액형 등)은 전부 실패

**발견 4: 형식 의존성**
- "생일: 3월 15일"이면 Identity 분류 가능
- "3월 15일에 태어남"이면 Identity 키워드 '생일' 불포함 → Moment
- extractedFacts 형식이 AI에 의존적 → 불안정

---

## 15. 현재 시스템의 한계 (Known Limitations)

### 15-1. 아키텍처 한계

| 한계 | 설명 | 영향도 |
|------|------|--------|
| **키워드 기반 분류** | Identity/Moment 분류가 키워드 포함 여부에만 의존 | 치명적 — 개인정보 탈락의 근본 원인 |
| **비구조적 knownFacts** | string[] 배열, 중요도/카테고리 없음 | 높음 — 우선순위 판단 불가 |
| **행동/개인정보 미분리** | extractedFacts가 행동과 개인정보를 동일하게 저장 | 높음 — knownFacts 폭증 |
| **단순 슬라이스** | Moment facts를 `.slice(-10)`으로 자름 | 중간 — 관련성 무시 |
| **AI 의존 형식** | extractedFacts 형식이 LLM 출력에 의존 | 중간 — 비결정적 |

### 15-2. 기억 검색 한계

| 한계 | 설명 | 영향도 |
|------|------|--------|
| **인메모리 코사인 검색** | 전체 기억을 로드 후 JS에서 정렬 | 낮음 — 현재 규모에서는 OK |
| **256차원 임베딩** | 작은 모델, 미세 차이 구분 어려울 수 있음 | 낮음 |
| **CharacterMemory vs knownFacts 이중화** | 같은 정보가 두 곳에 저장될 수 있음 | 낮음 — 역할 분리 |

### 15-3. 스케일링 한계

| 한계 | 설명 | 영향도 |
|------|------|--------|
| **Mem0 Rate Limit** | 무료 tier 429 제한 | 중간 — 쿨다운으로 대응 중 |
| **DB 쿼리 증가** | 캐릭터 수 x 기억 조회 = O(n) 쿼리 | 중간 — 캐릭터 5+ 시 주의 |
| **프롬프트 토큰 증가** | knownFacts + memories + experiences → 토큰 비용 증가 | 중간 |

---

## 16. 개선 로드맵 (Proposed Improvements)

### Priority 1: 주제(Subject) 기반 Identity 분류

**문제**: "거주지: 서울 강남구"에서 '거주지'가 IDENTITY_KEYWORDS에 없어 Moment로 분류
**해결**: "주제: 내용" 형식의 주제 부분을 추출하여 IDENTITY_SUBJECTS Set으로 매칭
**예상 효과**: Identity 분류 정확도 28% → ~95%

### Priority 2: 행동/개인정보 분리 저장

**문제**: "유저의 행동: 꽃을 선물했다"가 knownFacts에 누적 → 폭증
**해결**: 행동 패턴("의 행동:", "의 반응:")은 sharedExperiences로 분리
**예상 효과**: knownFacts 크기 60+ → ~20 (개인정보만)

### Priority 3: Structured knownFacts

**문제**: knownFacts가 `string[]`로 비구조적, 중요도/카테고리 없음
**해결**: `{ subject: string, value: string, category: 'identity'|'preference'|'situation', addedAt: string }[]`
**예상 효과**: 카테고리별 관리, 중복 감지 정확도 향상, 시간 기반 eviction 가능

### Priority 4: Semantic Conflict Detection (Pro 활용)

**문제**: Correction Hook이 regex 기반이라 "나이: 25살" ↔ "스무다섯 살"을 다른 것으로 인식
**해결**: 기존 Pro 백그라운드 호출에 conflict detection 추가 (추가 API 비용 0)
**예상 효과**: 나이 변조(25→29) 같은 drift 완전 방지

### Priority 5: Reflection (상위 추상화)

**문제**: 기억이 개별 fact 나열이라 캐릭터가 유저를 "이해"하지 못함
**해결**: N턴마다 Pro가 기존 knownFacts를 요약/추상화 → "유저 프로필 요약" 생성
**예상 효과**: 더 자연스러운 기억 활용, 토큰 절약
