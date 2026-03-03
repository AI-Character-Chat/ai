# SYNK 채팅 시스템 작동 원리

## 전체 흐름 요약

```
유저 메시지 입력
    │
    ▼
[1] 유저 메시지 저장 + 임베딩 생성 (병렬)
    │
    ▼
[2] 컨텍스트 수집 (6가지 정보원)
    │  ├─ 대화 이력 (최근 30개 + 임베딩 유사 과거 5개)
    │  ├─ 로어북 (키워드 매칭 + 조건 필터)
    │  ├─ 캐릭터 기억 (관계/사실/감정/경험)
    │  ├─ 세션 요약 (장기 기억)
    │  ├─ Pro 디렉터 노트 (기승전결 가이드)
    │  └─ 장면 상태 (장소/시간/등장인물)
    │
    ▼
[3] 프롬프트 조립 (systemInstruction + contents)
    │
    ▼
[4] Gemini Flash 스트리밍 응답 생성
    │  ├─ 토큰 단위로 SSE 전송 (실시간)
    │  ├─ 턴 완성 시 DB 저장
    │  └─ JSON 스키마 강제 (narrator/dialogue 구조)
    │
    ▼
[5] 세션 상태 업데이트 (턴카운트, 장소, 이벤트)
    │
    ▼
[6] 메모리 처리 (surprise-based 필터링)
    │
    ▼
[7] SSE 완료 → 클라이언트에 done 전송
    │
    ▼
[8] 백그라운드 처리 (fire-and-forget)
    ├─ 5턴마다: 세션 요약 갱신
    ├─ 10턴마다: 기억 통합 + 승격 (A-MEM)
    └─ 클라이언트 → Pro 분석 API 호출 (별도)
```

---

## 세션 생성 (POST /api/chat)

유저가 작품을 선택하고 채팅을 시작할 때 호출됩니다.

**입력**: workId, openingId, personaId, userName, keepMemory
**출력**: session 객체, opening 텍스트, characters 목록

### 처리 순서

1. **인증 확인** — NextAuth 세션에서 userId 추출
2. **기억 리셋** (선택) — `keepMemory=false`면 관계/기억 DB 초기화
3. **데이터 조회** (병렬) — 페르소나 + 작품(캐릭터, 오프닝) 동시 로드
4. **세션 생성** — ChatSession 레코드 생성 (장소/시간은 오프닝에서 가져옴)
5. **오프닝 메시지 저장** — fire-and-forget (응답 대기 안 함)

### 초기 상태

| 필드 | 초기값 |
|------|--------|
| turnCount | 0 |
| intimacy | 0 |
| currentLocation | 오프닝의 initialLocation |
| currentTime | 오프닝의 initialTime |
| presentCharacters | 캐릭터 최대 3명 |
| recentEvents | [] |

---

## 메시지 전송 (PUT /api/chat) — 핵심 로직

유저가 메시지를 보낼 때마다 호출됩니다. **SSE(Server-Sent Events) 스트리밍**으로 응답합니다.

---

### [1] 유저 메시지 처리

```
유저 메시지 → (병렬) → DB 저장 (Message 테이블)
                    → 임베딩 생성 (Gemini embedding API)
```

- 메시지를 DB에 저장하고 SSE로 `user_message` 이벤트 전송
- 임베딩 벡터(256차원)를 생성하여 메시지에 저장 (다음 턴에서 유사 검색에 사용)

---

### [2] 컨텍스트 수집 (buildChatContext)

**파일**: `src/lib/chat-service.ts` → `buildChatContext()`

AI에게 전달할 모든 맥락 정보를 수집합니다. 6가지 정보원을 조합합니다.

#### 2-1. 대화 이력 (Selective History)

```
최근 30개 메시지 (즉시 컨텍스트)
    +
과거 100개 유저 메시지 중 → 현재 메시지와 임베딩 유사도 상위 5개 (관련 과거)
    ↓
[관련 과거 대화]     ← 유사도 0.3 이상만, 직후 AI 응답도 포함
---
[최근 대화]          ← 최근 30개, 토큰 40K 한도 내
```

- **임베딩 유사도 검색**: 유저의 현재 메시지와 과거 메시지의 코사인 유사도를 계산하여 관련 있는 과거 대화를 찾음
- **토큰 한도**: 전체 대화 이력은 최대 40,000 토큰 (한글 약 60,000자)

#### 2-2. 로어북 (Lorebook)

```
작품의 로어북 항목들
    ↓ 키워드 매칭 (최근 대화 + 유저 메시지에서)
    ↓ 조건 필터:
    │  ├─ minIntimacy: 친밀도가 일정 이상일 때만
    │  ├─ minTurns: 턴 수가 일정 이상일 때만
    │  └─ requiredCharacter: 특정 캐릭터가 있을 때만
    ↓ 재귀 스캔 (활성화된 항목의 content에서 다른 항목의 키워드를 추가 검색, 최대 3단계)
    ↓
활성화된 항목 최대 5개 (우선순위 정렬)
```

#### 2-3. 캐릭터 기억 (Narrative Memory)

**파일**: `src/lib/narrative-memory.ts` → `buildNarrativeContext()`

현재 장면에 등장하는 각 캐릭터마다 개별 기억을 조회합니다.

```
캐릭터별로:
    ├─ 관계 데이터 (UserCharacterRelationship)
    │   ├─ 친밀도 점수 (intimacyScore 0~100)
    │   ├─ 다축 관계 (trust, affection, respect, rivalry)
    │   ├─ 알려진 사실 (knownFacts)
    │   └─ 감정 이력 (emotionalHistory)
    │
    ├─ 캐릭터 기억 (CharacterMemory) — 임베딩 유사도 검색
    │   ├─ 유저 메시지와 유사한 기억 상위 N개
    │   └─ 공유 경험 (sharedExperiences) 최근 30개
    │
    └─ 장면 컨텍스트 (Scene)
        └─ 현재 활성 장면 정보
```

**출력 형식** (AI에게 전달되는 텍스트):
```
ZERO: 친구 (친밀70 신뢰65 호감72 존경55 경쟁10)
  사실: 고소공포증 있음, 좋아하는 음식은 라멘
  최근 기억: 함께 폐공장을 탐사한 경험이 있음
  공유 경험: 첫 만남에서 서로를 구해줌, ...
```

#### 2-4. 세션 요약 (Session Summary)

- 5턴마다 갱신되는 대화 전체 요약 (3~5문장)
- Gemini Flash로 생성
- 장기 대화에서 초반 맥락 유지 용도

#### 2-5. Pro 디렉터 노트

- 이전 턴에서 Pro 모델이 분석한 서사 가이드
- arcPhase (기/승/전/결), sceneBeat (다음 전개), directing (캐릭터별 행동 방향)
- Flash가 이 노트를 참고하여 서사를 진행

#### 2-6. 장면 상태

```
현재 장소, 현재 시간, 등장 캐릭터 목록, 최근 사건 10개
```

---

### [3] 프롬프트 조립

**파일**: `src/lib/gemini.ts` → `buildSystemInstruction()` + `buildContents()`

Gemini API는 2개 계층으로 프롬프트를 받습니다.

#### systemInstruction (작품별 고정, Gemini 캐시됨)

```
[응답 규칙 2줄]
  "당신은 유저(이름)와 함께 인터랙티브 소설을 공동 집필하는 작가입니다..."
  "각 캐릭터의 말투는 절대 바꾸지 말고, 유저 행동을 반영하며, 상황을 진전시키세요."

[세계관]
  작품의 worldSetting 전문

[캐릭터]
  ### 캐릭터1 이름
  캐릭터1 프롬프트 (성격, 말투, 배경 등)
  ### 캐릭터2 이름
  ...

[로어북]
  활성화된 로어북 항목들
```

#### contents (매 턴 변경)

```
[유저 페르소나]      ← 이름, 나이, 성별, 설명
[캐릭터 기억]        ← narrative-memory 결과 (캐릭터별)
[이전 대화 요약]     ← 세션 요약 (장기 기억)
[디렉터 노트]        ← Pro 분석 결과 (기승전결 가이드)
[현재 상황]          ← 장소, 시간, 등장인물
[대화 이력]          ← 선별적 히스토리 (관련 과거 + 최근)
[유저 입력]          ← 유저가 보낸 메시지
※ 각 캐릭터 말투를 설정 그대로 유지    ← post-history 리마인더
```

---

### [4] AI 응답 생성 (Gemini Flash 스트리밍)

**파일**: `src/lib/gemini.ts` → `generateStoryResponseStream()`

#### 모델 설정

| 설정 | 값 | 이유 |
|------|-----|------|
| 모델 | gemini-2.5-flash | 실시간 채팅용 (빠르고 저렴) |
| temperature | 1.4 | 창작 콘텐츠라 높은 다양성 |
| topP | 0.95 | |
| maxOutputTokens | 12,288 | 충분한 응답 길이 |
| thinkingBudget | 512 | 최소한의 내부 추론 (1024 이상은 말투 붕괴) |
| responseMimeType | application/json | JSON 강제 응답 |
| responseSchema | RESPONSE_SCHEMA | 구조화된 출력 강제 |

#### 응답 JSON 구조 (RESPONSE_SCHEMA)

```json
{
  "turns": [
    {
      "type": "narrator",           // "narrator" 또는 "dialogue"
      "character": "",              // dialogue일 때 캐릭터 이름
      "content": "어둠 속에서...",   // 실제 내용 (이것만 유저에게 표시)
      "sensory": "차가운 바람...",   // [thinking aid] AI 사고 유도, 출력 안 함
      "ambience": "먼 곳에서...",    // [thinking aid] AI 사고 유도, 출력 안 함
      "characterAction": "주먹을...", // [thinking aid] AI 사고 유도, 출력 안 함
      "emotion": "neutral",         // 표정 (출력에 사용)
      "emotionIntensity": 0.5       // 감정 강도
    },
    ...
  ],
  "scene": {
    "location": "폐공장 지하",
    "time": "심야",
    "presentCharacters": ["ZERO", "노바"],
    "plotEvent": "정체불명의 경고음이 울려퍼졌다"
  },
  "extractedFacts": ["알레르기: 초콜릿", "취미: 독서"]
}
```

#### Thinking Aid 패턴

sensory, ambience, characterAction 필드는 **AI의 사고를 유도하지만 유저에게는 표시하지 않는** 스키마 필드입니다.
- AI가 이 필드를 채우면서 감각묘사, 환경, 물리적 동작을 먼저 구상
- 그 결과가 실제 content에 자연스럽게 녹아듦
- 직접 출력하지 않으므로 형식이 자유로움

#### 스트리밍 SSE 이벤트 순서

```
turn_start  → { turnType, characterName, characterId }     // 턴 시작 알림
turn_delta  → { content: "토큰" }                          // 실시간 토큰 (여러 번)
turn_delta  → { content: "단위" }
turn_delta  → { content: "스트리밍" }
narrator    → { id, content }                               // 나레이션 턴 완성 (DB 저장됨)
turn_start  → ...                                           // 다음 턴
turn_delta  → ...
character_response → { id, content, character }             // 대사 턴 완성 (DB 저장됨)
... (6~10개 턴 반복)
session_update     → { session, sceneUpdate }               // 장면 상태 갱신
response_metadata  → { model, tokens, timing... }           // 성능 메타데이터
memory_update      → { results }                            // 기억 처리 결과
done              → { aiResponseSummary }                   // 스트림 종료
```

---

### [5] 세션 상태 업데이트

AI 응답 완료 후 세션 데이터를 갱신합니다.

| 필드 | 업데이트 내용 |
|------|-------------|
| turnCount | +1 |
| intimacy | +0.1 (최대 10) |
| currentLocation | scene.location |
| currentTime | scene.time |
| presentCharacters | scene + dialogue에 등장한 캐릭터 합집합 |
| recentEvents | plotEvent 추가 (최근 10개 유지) |

---

### [6] 메모리 처리 (processImmediateMemory)

**파일**: `src/lib/chat-service.ts` → `processImmediateMemory()`

SSE가 끝나기 전에 동기적으로 실행됩니다.

#### Surprise-Based Filtering (Titans 개념)

새로운 기억이 기존 기억과 얼마나 다른지(novelty)를 평가하여 저장 여부를 결정합니다.

```
유사도 >= 0.90  →  reinforce (기존 기억 강화, 새로 저장 안 함)
0.75 ~ 0.90     →  중요도 >= 0.4면 감쇠 저장, 아니면 skip
유사도 < 0.75   →  surprise boost (새로운 기억으로 저장)
```

#### 관계 수치 업데이트

Pro 분석에서 추출한 `relationshipDeltas`를 적용합니다.

```
캐릭터별:
  trust += delta.trust        (신뢰)
  affection += delta.affection (호감)
  respect += delta.respect     (존경)
  rivalry += delta.rivalry     (경쟁)
  familiarity += delta.familiarity (친숙)
```

#### extractedFacts 저장

AI가 추출한 유저 정보 (이름, 나이, 취미 등)를 관계 DB의 knownFacts에 추가합니다.

---

### [7~8] 완료 + 백그라운드 처리

#### SSE 완료 후

클라이언트에 `done` 이벤트를 보내고 스트림을 닫습니다.

#### 백그라운드 (fire-and-forget)

| 주기 | 작업 | 설명 |
|------|------|------|
| 5턴마다 | 세션 요약 갱신 | Gemini Flash로 대화 전체 3~5문장 요약 |
| 5턴마다 | 기억 감쇠 | (현재 빈 함수 — 영구 기억 정책) |
| 10턴마다 | 기억 통합 (A-MEM) | 유사한 기억들을 하나로 합침 (원본 보존) |
| 10턴마다 | 기억 승격 | 중요도 높은 기억을 장기 기억으로 승격 |
| 25턴마다 | 약한 기억 정리 | (현재 빈 함수 — 영구 기억 정책) |

---

## Pro 백그라운드 분석 (POST /api/chat/pro-analyze)

**클라이언트가 Flash 응답 완료 후 별도로 호출합니다.**

```
클라이언트 → Flash 응답 수신 완료
         → POST /api/chat/pro-analyze 호출 (백그라운드)
         → Pro(gemini-2.5-pro) 서사 분석
         → DB에 proAnalysis 저장
         → 다음 턴에서 Flash가 디렉터 노트로 참조
```

### Pro가 분석하는 내용

| 항목 | 설명 |
|------|------|
| arcPhase | 현재 서사 단계 (기/승/전/결) |
| sceneBeat | 다음 턴에서 전개할 내용 1줄 |
| directing | 캐릭터별 행동 방향 1줄씩 |
| relationshipDeltas | 관계 수치 변화량 (trust, affection 등) |

### Pro 입력 (경량화됨)

```
systemInstruction: "당신은 서사 분석가입니다. 등장인물: A, B. 유저: C."  (1줄)
memoryContext: 관계 수치 + knownFacts만 (임베딩 검색 없음)
```

---

## 비용 구조

| 항목 | 모델 | 턴당 비용 |
|------|------|----------|
| 채팅 (실시간) | gemini-2.5-flash | ~$0.007 |
| 분석 (백그라운드) | gemini-2.5-pro | ~$0.027 |
| **합계** | | **~$0.034** |

- Flash 입력: $0.15/1M tokens, 출력: $0.60/1M tokens
- Pro 입력: $1.25/1M tokens, 출력+thinking: $10/1M tokens
- Pro 비용의 주요 드라이버는 output+thinking 단가 (입력의 8배)

---

## 데이터 흐름도 (DB 테이블)

```
User ─── ChatSession ─── Message (user/narrator/dialogue/system)
  │          │
  │          ├── currentLocation, currentTime
  │          ├── presentCharacters, recentEvents
  │          ├── sessionSummary (5턴마다 갱신)
  │          ├── proAnalysis (Pro 분석 결과)
  │          └── turnCount, intimacy
  │
  ├── UserCharacterRelationship (캐릭터별)
  │     ├── intimacyScore (0~100)
  │     ├── trust, affection, respect, rivalry (다축)
  │     ├── knownFacts (유저 정보)
  │     ├── emotionalHistory (감정 이력)
  │     └── intimacyLevel (stranger→acquaintance→friend→...)
  │
  ├── CharacterMemory (캐릭터별 기억)
  │     ├── interpretation (기억 내용)
  │     ├── embedding (256차원 벡터)
  │     ├── importance (중요도)
  │     ├── strength (강도)
  │     └── sharedExperiences (공유 경험)
  │
  └── Scene (장면)
        ├── location, timeOfDay
        ├── mood, presentCharacters
        └── keyEvents
```

---

## 핵심 설계 원칙

| 원칙 | 설명 |
|------|------|
| **2계층 프롬프트** | systemInstruction(고정, 캐시) + contents(동적). 캐시로 입력 비용 절약 |
| **2줄 체제** | systemInstruction은 role 1줄 + compound rule 1줄. 3줄 이상은 품질 하락 |
| **post-history 리마인더** | 대화 이력 뒤에 "말투 유지" 1줄 배치. recency bias 활용 |
| **Thinking Aid** | 스키마에 사고 유도 필드를 넣되 출력에는 사용 안 함 |
| **Hybrid Flash+Pro** | Flash(실시간) + Pro(백그라운드 분석). 품질과 비용의 균형 |
| **영구 기억** | DB에서 기억 절대 삭제 안 함. 저장은 전부, 검색은 스마트하게 |
| **Surprise 필터** | 이미 아는 것(유사도 높음)은 reinforce, 새로운 것만 저장 |
| **병렬 처리** | 가능한 모든 DB 조회/API 호출을 Promise.all로 병렬화 |
| **SSE 스트리밍** | 토큰 단위로 실시간 전송. 턴 완성 시 즉시 DB 저장 |
| **fire-and-forget** | 유저 응답에 불필요한 작업(요약, 기억 통합)은 스트림 종료 후 비동기 |
