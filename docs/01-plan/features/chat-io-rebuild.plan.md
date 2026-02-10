# [Plan] chat-io-rebuild: 채팅 입출력 로직 재구축

## 1. 개요

### 배경
현재 채팅 시스템의 핵심 문제:
- **느린 응답**: gemini-2.5-pro 모델 사용으로 5-15초 지연
- **코드 복잡도**: ChatView.tsx 1150줄, useState 17개, useEffect 6개
- **세션 분리 실패**: 같은 작품 세션 간 전환 시 race condition
- **텍스트 미표시**: Gemini Markdown 파싱 실패 시 빈 content
- **캐릭터 기억 미작동**: narrative-memory.ts가 구축되어 있으나 채팅 흐름에 미연결
- **SDK 폐기**: @google/generative-ai가 2025.11월부로 deprecated

### 목표
1. 응답 속도 1-3초 이내 (gemini-2.5-flash + implicit caching)
2. ChatView.tsx를 작은 컴포넌트로 분리 (각 200줄 이하)
3. useReducer 기반 상태 관리로 race condition 제거
4. 세션 완전 분리 (같은 작품 내 다른 세션 독립 동작)
5. 캐릭터별 기억 시스템 활성화 (narrative-memory.ts 연결)
6. 토큰 비용 50%+ 절감 (systemInstruction 캐싱)

### 범위
- **수정**: gemini.ts, route.ts (PUT), ChatView.tsx → 5개 컴포넌트 분리, ChatCacheContext.tsx
- **신규 연결**: narrative-memory.ts → route.ts PUT 흐름에 연결
- **SDK 교체**: @google/generative-ai → @google/genai
- **유지**: API 구조 (POST/PUT/GET), DB 스키마, prompt-builder.ts, ChatHistorySidebar, layout.tsx

---

## 2. 현재 문제 상세 분석

### 2.1 성능 병목 (응답 시간 프로파일)
```
0ms    auth() + DB 쿼리              ~50ms
50ms   유저 메시지 저장               ~20ms
70ms   컨텍스트 빌드                  ~5ms
75ms   ★ Gemini API 호출             ~5,000-15,000ms (gemini-2.5-pro)
5075ms 나레이션+캐릭터 응답 저장       ~50ms
5125ms 세션 업데이트                   ~20ms
5145ms done
```
**핵심**: 전체 지연의 95%가 Gemini API 호출.

### 2.2 토큰 낭비 구조
현재: 매 턴마다 세계관+캐릭터 설정(~4,000-6,000토큰)을 **단일 prompt 문자열**로 반복 전송.
- Gemini implicit caching 불가 (systemInstruction 미사용)
- 같은 작품 내 모든 턴이 동일한 정적 콘텐츠를 100% 비용으로 처리

### 2.3 프론트엔드 구조 문제

| 문제 | 위치 | 영향 |
|------|------|------|
| useState 17개 | ChatView.tsx:74-90 | 상태 불일치, 디버깅 어려움 |
| useEffect 6개 | ChatView.tsx:98-202 | 의존성 충돌, race condition |
| 세션 정규화 4회 중복 | ChatView.tsx:327,404,433,559 | 불일치 위험 |
| SSE stale closure | ChatView.tsx:505 | 세션 전환 시 스트림 미취소 |
| 세션 전환 시 session=null | ChatView.tsx:163 | "대화 시작하기" 모달 오표시 |

### 2.4 백엔드 문제

| 문제 | 위치 | 영향 |
|------|------|------|
| gemini-2.5-pro 사용 | gemini.ts:36 | 5-15초 지연 |
| 세션 요약 블로킹 | route.ts:284 | 20턴마다 추가 5-15초 |
| narrative-memory.ts 미연결 | route.ts | 캐릭터별 기억/관계 미작동 |
| Markdown 파싱 취약 | gemini.ts:227 | 빈 content 발생 |
| SDK 폐기 | package.json | @google/generative-ai deprecated |

---

## 3. 연구 기반 아키텍처 설계

### 3.0 참고 연구 및 사례

| 출처 | 핵심 기법 | 우리 적용 |
|------|----------|----------|
| Braas et al. (2025) | 소형 모델에 페르소나 fine-tuning + 분리 메모리 | systemInstruction에 정적 페르소나 고정 (가상 fine-tuning) |
| Fic2Bot (2024) | Scene-level RAG + 발화 스타일 분석 | 로어북 키워드 매칭 (이미 유사 구현) |
| Mem0 (Chhikara 2025) | 추출-업데이트 파이프라인 (ADD/UPDATE/DELETE) | narrative-memory.ts의 processConversationForMemory |
| Inworld AI | Flash Memory (20분) + Long-term Memory (주기 합성) | 최근 30메시지 + 5턴 요약 |
| COMEDY/ReSummarize (2023-24) | 대화 요약-재요약 압축 | sessionSummary 5턴 주기 갱신 |
| Character.AI | Hierarchical KV cache, 캐릭터 정의 1회 공유 | systemInstruction implicit caching |
| MemGPT/Letta | Core/Recall/Archival 3계층 가상 메모리 | 관계상태(Core) + 최근대화(Recall) + CharacterMemory(Archival) |
| RPLA (Xu 2024b) | 장기 페르소나 메모리 추출/갱신 | UserCharacterRelationship 활성화 |
| SillyTavern | World Info(키워드) + 토큰 예산 시스템 | 로어북 + 프롬프트 토큰 관리 |

### 3.1 Gemini SDK 교체 + 프롬프트 구조 분리

#### SDK 마이그레이션
```
@google/generative-ai (deprecated 2025.11) → @google/genai
```

#### 프롬프트 2계층 분리 (캐싱 핵심)
```
┌─────────────────────────────────────────────────┐
│ systemInstruction (작품별 고정 → implicit cache) │
│ ──────────────────────────────────────────────── │
│ [1] 응답 규칙 + JSON 형식 가이드 (전역 고정)     │
│ [2] 세계관 설정 (작품별 고정)                    │
│ [3] 캐릭터 페르소나 전체 (작품별 고정)            │
│ [4] 로어북 정적 항목 (작품별 고정)                │
│                                                  │
│ 예상: 3,000~6,000+ 토큰 → 90% 할인 캐싱         │
│ 캐시 키: 동일 작품의 모든 세션이 공유             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ contents (매 턴 변경 → 매번 새로 처리)           │
│ ──────────────────────────────────────────────── │
│ [5] 유저 페르소나 (세션별 고정)                   │
│ [6] 캐릭터별 기억 컨텍스트 (narrative-memory)     │
│ [7] 세션 요약 - 장기 기억 (5턴마다 갱신)          │
│ [8] 현재 장면 상태 (매 턴 변경)                   │
│ [9] 최근 대화 이력 (매 턴 변경)                   │
│ [10] 유저 메시지 (매 턴 새로움)                   │
│                                                  │
│ 예상: 1,500~3,500 토큰                           │
└─────────────────────────────────────────────────┘
```

**원리**: Gemini 2.5 모델의 implicit caching은 요청의 prefix가 동일하면 자동으로 캐시.
systemInstruction은 항상 prefix이므로, 같은 작품의 모든 세션/턴에서 캐시 HIT.

**주의**: 실제 개발자 보고에 따르면 1,024토큰 최소 요건은 불안정하며, 4,000~6,000+ 토큰에서 안정적으로 캐싱됨.

#### Gemini 호출 코드 (새 SDK)
```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction,                  // ← 캐시되는 정적 부분
    temperature: 0.85,
    topP: 0.9,
    topK: 40,
    maxOutputTokens: 2500,
    responseMimeType: 'application/json', // JSON mode
    responseSchema: { ... },
  },
  contents,                             // ← 매 턴 변경되는 동적 부분
});
```

### 3.2 캐릭터별 기억 시스템 활성화

#### 현재 상태: narrative-memory.ts (785줄, 프로덕션 레디, 미연결)

이미 구축된 시스템:
- `CharacterMemory`: 캐릭터별 해석된 기억 (episodic/semantic/emotional)
- `UserCharacterRelationship`: 캐릭터별 친밀도/관계 라벨/말투/별명
- `Scene`: 장면 단위 기억 (감정톤, 주제, 요약)
- `RelationshipChange`: 관계 변화 이력
- `ConversationLog`: 원본 대화 보존
- 기억 감쇠 (`decayMemoryStrength`): 유형별 다른 속도
- 기억 정리 (`pruneWeakMemories`): 약한 기억 자동 삭제

#### 연결 지점 (route.ts PUT)

```
[기존 흐름]
유저 메시지 저장 → Gemini 호출 → 응답 저장 → 세션 업데이트 → done

[새 흐름]
유저 메시지 저장
  → buildNarrativeContext(각 캐릭터) → contents에 캐릭터별 기억 주입
  → Gemini 호출 (systemInstruction 캐시 + contents 동적)
  → 응답 저장
  → processConversationForMemory (fire-and-forget, 비동기)
     ├── 각 캐릭터 관계 업데이트 (intimacyDelta)
     ├── 캐릭터별 기억 저장 (해석 + 감정)
     └── 장면 토픽 업데이트
  → 세션 업데이트
  → done
  → 5턴마다: decayMemoryStrength (비동기)
  → 25턴마다: pruneWeakMemories (비동기)
```

#### 캐릭터별 기억이 프롬프트에 주입되는 예시

```
## 서연의 기억
- 관계: 친구 (친밀도 62/100)
- 말투: 반말, 편한 태도
- 서연이 유저에 대해 아는 것: 음악을 좋아함, 과거에 상처가 있음
- 최근 기억: "그때 나를 도와줬을 때... 처음으로 믿을 수 있다고 느꼈다"
- 함께한 순간: 축제에 같이 감, 비를 같이 맞음

## 민혁의 기억
- 관계: 아는 사이 (친밀도 28/100)
- 말투: 존댓말, 조심스러운 태도
- 민혁이 유저에 대해 아는 것: 이름만 앎
- 최근 기억: "처음 본 사람인데 왜 서연이와 친한 거지..."
```

**핵심**: 같은 이벤트도 캐릭터마다 다르게 해석. 서연은 "도와줬다"고 기억하고, 민혁은 "경계 대상"으로 기억.

### 3.3 프론트엔드 아키텍처

#### ChatView.tsx 분리 → 5개 컴포넌트
```
src/components/chat/
├── ChatContainer.tsx      (메인 컨테이너 + useReducer 상태관리)
├── ChatMessages.tsx       (메시지 목록 렌더링)
├── ChatInput.tsx          (입력창 + 전송 로직)
├── ChatHeader.tsx         (서브헤더 - 장소/시간/캐릭터)
└── OpeningScreen.tsx      (오프닝 선택 + 대화 시작)
```

#### useReducer 상태 통합
```typescript
// 17개 useState → 1개 useReducer
interface ChatState {
  work: Work | null;
  session: Session | null;
  messages: Message[];
  phase: 'loading' | 'opening' | 'chat' | 'session-loading';
  sending: boolean;
  inputMessage: string;
  personas: Persona[];
  selectedPersona: Persona | null;
}

type ChatAction =
  | { type: 'LOAD_WORK'; work: Work }
  | { type: 'LOAD_SESSION'; session: Session; messages: Message[] }
  | { type: 'SWITCH_SESSION_START' }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'REPLACE_TEMP_MESSAGE'; tempId: string; message: Message }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_INPUT'; text: string }
  | { type: 'UPDATE_SESSION'; session: Session }
  | { type: 'RESET' };
```

#### useEffect 정리: 6개 → 2개
```typescript
// Effect 1: URL 변경 감지 (workId + sessionId)
useEffect(() => {
  abortControllerRef.current?.abort(); // 진행 중 스트림 취소
  dispatch({ type: 'RESET' });
  loadData(workId, sessionId);
}, [workId, sessionId]);

// Effect 2: 자동 스크롤
useEffect(() => {
  scrollToBottom();
}, [state.messages]);
```

#### SSE 스트림 처리 (AbortController)
```typescript
const abortControllerRef = useRef<AbortController | null>(null);

const sendMessage = async (content: string) => {
  abortControllerRef.current?.abort();
  const controller = new AbortController();
  abortControllerRef.current = controller;

  const response = await fetch('/api/chat', {
    method: 'PUT',
    body: JSON.stringify({ sessionId: state.session.id, content }),
    signal: controller.signal,
  });

  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      processSSEChunk(value, dispatch);
    }
  } catch (e) {
    if (e.name === 'AbortError') return;
    throw e;
  }
};
```

### 3.4 백엔드 개선

#### 모델 변경
```
gemini-2.5-pro → gemini-2.5-flash
```
- 응답 속도: 5-15초 → 1-3초
- implicit caching: 90% 할인
- 품질: 롤플레이에 충분한 수준

#### JSON 응답 모드
```typescript
responseMimeType: 'application/json',
responseSchema: {
  type: 'object',
  properties: {
    narrator: { type: 'string' },
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          character: { type: 'string' },
          content: { type: 'string' },
          emotion: { type: 'string' }
        }
      }
    },
    scene: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        time: { type: 'string' },
        presentCharacters: { type: 'array', items: { type: 'string' } }
      }
    }
  }
}
```
**효과**: Markdown 파싱 실패 → 빈 content 문제 완전 해결.

#### 세션 요약 비동기화 + 주기 단축
```typescript
// Before: 20턴마다, 블로킹
if ((turnCount + 1) % 20 === 0) {
  const summary = await generateSessionSummary(...); // 블로킹!
}

// After: 5턴마다, fire-and-forget
send('done', {});
controller.close();

if ((turnCount + 1) % 5 === 0) {
  generateSessionSummary(...).then(summary => {
    if (summary) prisma.chatSession.update({ ... });
  }).catch(() => {});
}
```

#### 요약 Race Condition 방지
```typescript
const summarizingSessionIds = new Set<string>();

async function triggerSummary(sessionId: string, ...) {
  if (summarizingSessionIds.has(sessionId)) return;
  summarizingSessionIds.add(sessionId);
  try {
    const summary = await generateSessionSummary(...);
    await prisma.chatSession.update({ ... });
  } finally {
    summarizingSessionIds.delete(sessionId);
  }
}
```

### 3.5 캐시 개선

```typescript
// LRU 캐시로 변경 + 세션 전환 시 이전 데이터 유지
interface ChatCacheContextType {
  getCache: (sessionId: string) => CacheEntry | null;
  setCache: (sessionId: string, data: CacheData) => void;
  updateMessages: (sessionId: string, messages: Message[]) => void;
}

// 캐시 키: sessionId만 사용 (sessionId가 고유)
// LRU: 마지막 접근 시간 기준 제거
```

---

## 4. 구현 순서

| 단계 | 작업 | 파일 | 분류 |
|------|------|------|------|
| 1 | SDK 교체 (@google/genai) + 모델 변경 (2.5-flash) | gemini.ts, package.json | 핵심 |
| 2 | systemInstruction + contents 프롬프트 분리 | gemini.ts | 핵심 |
| 3 | JSON 응답 모드 적용 | gemini.ts | 핵심 |
| 4 | narrative-memory.ts 연결 (route.ts PUT) | route.ts | 핵심 |
| 5 | 세션 요약 5턴 비동기화 + Race Condition 방지 | route.ts | 핵심 |
| 6 | ChatState reducer 생성 | chat/useChatReducer.ts (신규) | 핵심 |
| 7 | ChatContainer 생성 (메인 로직 + AbortController) | chat/ChatContainer.tsx (신규) | 핵심 |
| 8 | ChatMessages 분리 | chat/ChatMessages.tsx (신규) | 보조 |
| 9 | ChatInput 분리 | chat/ChatInput.tsx (신규) | 보조 |
| 10 | ChatHeader 분리 | chat/ChatHeader.tsx (신규) | 보조 |
| 11 | OpeningScreen 분리 | chat/OpeningScreen.tsx (신규) | 보조 |
| 12 | 캐시 개선 (LRU, sessionId 키) | ChatCacheContext.tsx | 보조 |
| 13 | 기존 ChatView.tsx 제거 + layout 업데이트 | layout.tsx | 마무리 |

---

## 5. 캐시 HIT/MISS 시나리오

| 상황 | systemInstruction | 캐시 | 비용 영향 |
|------|-------------------|------|----------|
| 같은 작품, 다른 세션 | 동일 | **HIT** | 90% 할인 |
| 같은 작품, 연속 대화 | 동일 | **HIT** | 90% 할인 |
| 다른 작품으로 전환 | 변경 | MISS (첫 1회) | 정상 |
| 작품 설정 수정 후 | 변경 | MISS | 다음부터 새 캐시 |
| 캐릭터 추가/수정 | 변경 | MISS | 드문 이벤트 |

---

## 6. 토큰 예산 추정

| 구분 | 토큰 | 비용 (캐시 적용 후) |
|------|------|-------------------|
| systemInstruction (캐시) | ~4,000-6,000 | 90% 할인 → 실질 ~400-600 |
| contents (동적) | ~1,500-3,500 | 100% |
| 출력 | ~500-1,000 | 100% |
| **턴당 실질** | | **~2,400-5,100** (기존 ~6,000-9,000 대비 ~50% 절감) |

---

## 7. 성공 기준

| 항목 | 현재 | 목표 |
|------|------|------|
| 응답 속도 | 5-15초 | 1-3초 |
| ChatView 코드 | 1150줄 1파일 | 5개 파일 각 200줄 이하 |
| useState 개수 | 17개 | 0 (useReducer 1개) |
| useEffect 개수 | 6개 | 2개 |
| 세션 전환 | 모달 오표시 + race condition | 즉시 전환 + 로딩 스피너 |
| 텍스트 표시 | 간헐적 미표시 | JSON mode로 100% 보장 |
| 캐릭터 기억 | 미작동 (코드만 존재) | 캐릭터별 독립 기억/관계 작동 |
| 토큰 비용 | 턴당 ~6,000-9,000 | 턴당 ~2,400-5,100 (50%+ 절감) |
| SDK | deprecated (@google/generative-ai) | @google/genai |
| 빌드 | 성공 | 성공 |

---

## 8. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| gemini-2.5-flash 품질이 2.5-pro보다 낮음 | temperature/topP 조정, 프롬프트 최적화. 롤플레이 테스트 후 판단 |
| implicit caching 미작동 (토큰 부족) | systemInstruction 4,000+ 토큰 확보. 부족 시 세계관/캐릭터 설명 확장 |
| @google/genai SDK 안정성 | 단계적 마이그레이션. 기존 함수 시그니처 유지, 내부만 교체 |
| JSON mode에서 형식 미준수 | 폴백 파서 유지 (기존 Markdown 파서를 백업으로) |
| 5턴 요약 Race Condition | Set 기반 세션별 락으로 중복 실행 방지 |
| narrative-memory DB 쿼리 지연 | buildNarrativeContext를 Promise.all로 병렬 실행. 실패 시 기억 없이 진행 |
| 캐시 만료 시 첫 응답 느림 | 프롬프트 구조를 정확히 유지하여 캐시 재생성 최소화. 첫 응답 로딩 UI |
| 컴포넌트 분리 시 props drilling | Context 또는 reducer dispatch 전달 |
