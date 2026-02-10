# [Check] chat-io-rebuild: Gap Analysis Report

> Design: `docs/02-design/features/chat-io-rebuild.design.md`
> Date: 2026-02-10

---

## 1. 분석 개요

| 항목 | 값 |
|------|-----|
| 분석 대상 | 디자인 문서 vs 구현 코드 |
| 총 요구사항 | 37개 |
| MATCH | 34개 |
| PARTIAL | 3개 (네이밍 차이, 기능 동일) |
| GAP | 0개 |
| **Match Rate** | **91.9%** (PARTIAL을 기능적 일치로 보면 100%) |

---

## 2. 백엔드 분석 (18/18 = 100%)

### 2.1 gemini.ts (9/9 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 1 | `@google/genai` SDK + `GoogleGenAI` 클래스 | MATCH | L25: import, L36: 인스턴스 생성 |
| 2 | `buildSystemInstruction()` export | MATCH | L147: worldSetting, characters, lorebookStatic, userName 파라미터 |
| 3 | `buildContents()` export | MATCH | L207: userPersona, narrativeContexts, sessionSummary 등 전부 포함 |
| 4 | `generateStoryResponse()` 단일 객체 파라미터 | MATCH | L273: {systemInstruction, contents, characters, sceneState} |
| 5 | `generateSessionSummary()` export | MATCH | L478 |
| 6 | `export default ai` | MATCH | L509 |
| 7 | JSON responseSchema (narrator, responses[], scene) | MATCH | L104-141: 정확한 스키마 구조 |
| 8 | 폴백 체인: JSON → Markdown → 하드코딩 | MATCH | L311→L315→L340-348 |
| 9 | 모델: gemini-2.5-flash | MATCH | L38: `const MODEL = 'gemini-2.5-flash'` |

### 2.2 route.ts PUT (5/5 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 10 | gemini.ts 4개 함수 import | MATCH | L4-9 |
| 11 | narrative-memory.ts 5개 함수 import | MATCH | L16-21 |
| 12 | `summarizingSessionIds` Set + `triggerSummary()` | MATCH | L25, L27-51 |
| 13 | buildNarrativeContext(병렬) → buildSystemInstruction → buildContents → generateStoryResponse | MATCH | L268-302 |
| 14 | 비동기 후처리: processConversation(매턴), summary+decay(5턴), prune(25턴) | MATCH | L381-410 |

### 2.3 ChatCacheContext.tsx (3/3 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 15 | sessionId 단일 키 | MATCH | 모든 메서드가 sessionId만 사용 |
| 16 | LRU 제거 방식 | MATCH | touchEntry() helper: delete → re-insert |
| 17 | API 5개 메서드 시그니처 | MATCH | getCache/setCache/updateMessages/updateSession/clearCache |

### 2.4 package.json (1/1 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 18 | `@google/genai` 의존성 | MATCH | `"@google/genai": "^1.40.0"` |

---

## 3. 프론트엔드 분석 (16/19 MATCH + 3 PARTIAL)

### 3.1 useChatReducer.ts (6/6 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 19 | ChatState 인터페이스 (10개 필드) | MATCH | L68-83 |
| 20 | ChatAction 타입 (12개 액션) | MATCH | L102-114 |
| 21 | initialChatState export | MATCH | L85-96 |
| 22 | chatReducer 함수 export | MATCH | L120-176 |
| 23 | RESET이 personas/selectedPersona 보존 | MATCH | L166-171 |
| 24 | Persona 인터페이스 export | MATCH | L55-62 |

### 3.2 ChatContainer.tsx (7/7 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 25 | useReducer(chatReducer, initialChatState) | MATCH | L23 |
| 26 | 4개 ref (abort, messages, workId, sessionId) | MATCH | L33-36 |
| 27 | Effect 1: URL 변경 → 리셋 + 캐시 + 로드 | MATCH | L142-165 |
| 28 | Effect 2: 메시지 변경 → 자동 스크롤 | MATCH | L38-41 |
| 29 | SSE sendMessage + AbortController + stale guard | MATCH | L259-407 |
| 30 | 조건부 렌더링 (loading/opening/chat) | MATCH | L415-505 |
| 31 | useChatCache() sessionId 단일 키 사용 | MATCH | L156, L182, L244, L371 |

### 3.3 서브 컴포넌트 (1 MATCH + 3 PARTIAL)

| # | 요구사항 | 상태 | 설명 |
|---|---------|------|------|
| 32 | OpeningScreen.tsx props | PARTIAL | `onPersonaChange` → `onPersonaSelect` (네이밍 차이, 기능 동일) |
| 33 | ChatHeader.tsx props | PARTIAL | `menuOpen` → `chatMenuOpen` (네이밍 차이), sidebar props 추가 |
| 34 | ChatMessages.tsx props | PARTIAL | 기본 props 일치 + sidebar/sending props 추가 (기능 확장) |
| 35 | ChatInput.tsx props | MATCH | inputMessage, sending, onSend, onInputChange 모두 일치 |

### 3.4 파일 관리 (2/2 MATCH)

| # | 요구사항 | 상태 | 근거 |
|---|---------|------|------|
| 36 | ChatView.tsx 삭제됨 | MATCH | 파일 존재하지 않음 확인 |
| 37 | layout.tsx에서 ChatContainer import | MATCH | L6: `import ChatContainer` |

---

## 4. PARTIAL 항목 상세

### 4.1 OpeningScreen prop 네이밍 (Req #32)

```
Design:  onPersonaChange
Actual:  onPersonaSelect
```
- **영향**: 없음. 동일한 `(persona: Persona) => void` 시그니처
- **판단**: 네이밍 개선 (select가 더 명확)

### 4.2 ChatHeader prop 네이밍 + 확장 (Req #33)

```
Design:  menuOpen
Actual:  chatMenuOpen + sidebarOpen, sidebarCollapsed, personas, selectedPersona 추가
```
- **영향**: 없음. 기본 기능 동일 + UI 반응형 대응을 위한 확장
- **판단**: 실 구현에서 필요한 props 추가

### 4.3 ChatMessages 확장 (Req #34)

```
Design:  messages, work, generatingImages, messagesEndRef
Actual:  위 4개 + sending, sidebarOpen, sidebarCollapsed
```
- **영향**: 없음. 로딩 애니메이션과 사이드바 반응형을 위한 합리적 확장
- **판단**: 디자인 문서에서 생략된 UI 세부사항

---

## 5. 빌드 검증

| 검증 | 결과 |
|------|------|
| `npx tsc --noEmit` | 에러 없음 |
| `npm run build` | 성공 |

---

## 6. 결론

**Match Rate: 91.9% (34/37)**

3개의 PARTIAL은 모두 prop 네이밍 차이 또는 기능적 확장이며, 설계 의도에서 벗어나는 항목은 없음.
기능적 일치 기준으로는 **100% (37/37)**.

> **판정: PASS** (>= 90% 기준 충족)
