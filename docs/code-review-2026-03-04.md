# 전체 코드 리뷰 결과 (2026-03-04)

> 4명의 Opus 리뷰어가 80+ 파일을 병렬 검토. 총 81건 발견.

## 요약

| 심각도 | 건수 | 수정 상태 |
|--------|------|-----------|
| Critical | 8 | 1차 수정 중 |
| High | 20 | 대기 |
| Medium | 30 | 대기 |
| Low | 23 | 대기 |

---

## 수정 우선순위

| 순서 | 그룹 | 건수 | 이유 |
|------|------|------|------|
| **1차** | IDOR/인가 (C1,C2,H1-H3) | 5건 | 보안 취약점 — 프로덕션에서 즉시 악용 가능 |
| **2차** | JSON.parse 보호 (C4,C8 등) | 6건 | 런타임 크래시 — 데이터 손상 시 전체 장애 |
| **3차** | select 최적화 (C5,H11) | 2건 | 성능 — 매 턴 불필요한 데이터 전송 |
| **4차** | race condition (H12,H14) | 2건 | 데이터 무결성 — 동시 접속 시 값 오염 |
| **5차** | 프론트 구조 (C6) | 1건 | page.tsx 리팩토링 — 규모가 크므로 별도 스프린트 |

---

## Critical (8건)

### C1. [Security] works/[workId]/route.ts GET — IDOR
- **문제**: 비공개 작품 GET에 visibility 검사 없음. workId만 알면 캐릭터 prompt, lorebook 전부 노출
- **공격**: `GET /api/works/{private-work-id}` → 200 OK (전체 데이터)
- **수정**: visibility === 'private'일 때 auth() → 소유자 확인. CDN 캐시 제외
- **상태**: 1차 수정

### C2. [Security] chat/session/[sessionId]/route.ts GET — IDOR
- **문제**: 세션 소유권 검증 불완전. 비로그인 시 조건문 자체를 건너뜀
- **코드**: `if (chatSession.userId && authSession?.user?.id)` — 둘 다 truthy여야 검증
- **공격**: 로그인 안 한 상태로 sessionId만 알면 아무 세션 조회 가능
- **수정**: 인증 필수 + userId 일치 확인
- **상태**: 1차 수정

### C3. [AI Core] chat/route.ts:103 — 오프닝 메시지 fire-and-forget
- **문제**: 오프닝 메시지 DB 저장이 `.catch()` 로만 처리. 실패 시 대화 이력에 오프닝 누락
- **영향**: AI 컨텍스트에 오프닝이 빠져 캐릭터 설정 불완전
- **상태**: 2차 수정 예정

### C4. [AI Core] chat/route.ts:209 — JSON.parse 미검증
- **문제**: `JSON.parse(session.presentCharacters)` try-catch 없음
- **영향**: 잘못된 JSON이면 전체 PUT 핸들러 크래시
- **상태**: 2차 수정 예정

### C5. [Memory] narrative-memory.ts:782 — embedding 대량 로딩
- **문제**: evaluateMemoryNovelty에서 select 없이 200개 행 전체 컬럼 로딩
- **영향**: embedding(~2KB/행) x 200 = ~400KB 매 턴 전송
- **상태**: 3차 수정 예정

### C6. [Frontend] page.tsx — 1500줄 모놀리식 컴포넌트
- **문제**: useState 50개, useEffect 15개가 단일 컴포넌트. 모든 상태 변경 시 전체 리렌더
- **상태**: 5차 (별도 스프린트)

### C7. [Frontend] page.tsx:172 — useEffect 의존성 누락
- **문제**: 빈 배열 의존성에 내부 함수 참조 누락
- **상태**: 5차 (page.tsx 리팩토링 시 함께)

### C8. [Frontend] ChatContainer.tsx:94 — normalizeSession JSON.parse 미검증
- **문제**: try-catch 없는 JSON.parse. 잘못된 데이터에 크래시
- **상태**: 2차 수정 예정

---

## High (20건)

### 인가/보안 (H1~H5)

| # | 파일 | 이슈 |
|---|------|------|
| H1 | notifications/route.ts PATCH | 인증 없이 전역 알림 읽음 처리 가능 |
| H2 | chat/route.ts:172 PUT | 세션 소유권 검증 불완전 (userId null이면 통과) |
| H3 | chat/pro-analyze/route.ts:42 | 동일 패턴 |
| H4 | auth.ts:13-20 | PrismaClient 이중 생성 — 커넥션 풀 낭비 |
| H5 | admin/reports, users | limit 파라미터 상한선 없음 |

### AI Core (H6~H10)

| # | 파일 | 이슈 |
|---|------|------|
| H6 | gemini.ts 7곳 | `as any` 남용 — SDK 업데이트 시 런타임 에러 |
| H7 | chat/route.ts:85-100 | 단일 항목 트랜잭션 — 오프닝 메시지 트랜잭션 포함 필요 |
| H8 | gemini.ts:1066 | repairTruncatedJson 정규식이 현재 스키마와 불일치 |
| H9 | chat/route.ts:202-207 | 임베딩 저장 `.catch(() => {})` 에러 완전 무시 |
| H10 | chat-service.ts:29 | summarizingSessionIds Set이 서버리스에서 유지 안 됨 |

### Memory & Data (H11~H14)

| # | 파일 | 이슈 |
|---|------|------|
| H11 | narrative-memory.ts:934 | searchCharacterMemories 300개 전체 컬럼 로딩 |
| H12 | narrative-memory.ts:555 | getOrCreateRelationship race condition — 중복 생성 가능 |
| H13 | narrative-memory.ts:1293 | processConversationForMemory N+1 — 캐릭터당 6쿼리 순차 |
| H14 | narrative-memory.ts:619 | updateRelationship read-then-write race condition |

### Frontend (H15~H20)

| # | 파일 | 이슈 |
|---|------|------|
| H15 | page.tsx + MainHeader.tsx | 알림 폴링 이중 호출 |
| H16 | ChatContainer.tsx:536 | Pro analysis fire-and-forget `.catch(() => {})` |
| H17 | ChatContainer.tsx:399 | 스트림 중 세션 전환 stale closure |
| H18 | ChatContainer.tsx | eslint-disable 3곳 남용 |
| H19 | ChatMessages.tsx:480 | RefObject 강제 캐스팅 |
| H20 | SearchModal.tsx | `any[]` 타입 사용 |

---

## Medium (30건)

### Security (8건)
- 캐릭터 GET/목록, 오프닝 목록, 로어북 목록에 인가 검사 없음 (비공개 작품 보호 필요)
- 비활성 공지사항 직접 URL로 조회 가능
- Rate Limit에서 `/api/chat/pro-analyze` 누락
- IP 스푸핑 가능성 (Vercel 환경에서는 낮음)
- 공지사항 생성 시 notification userId: null 이슈

### AI Core (7건)
- 캐릭터 이름 매칭이 부분 문자열 포함으로 오매칭 가능 (gemini.ts 5곳)
- RESPONSE_SCHEMA minItems가 문자열 '6' (숫자여야 할 수 있음)
- olderMessages 쿼리가 embedding 필드 포함 (100개)
- prompt-builder.ts:175 JSON.parse 에러 미처리
- temperature 불일치 (비스트리밍 1.4 vs 스트리밍 1.2)
- generateStoryResponse thinkingBudget -1 (무제한)
- 스트림 close 이후 백그라운드 작업 (Vercel serverless에서 완료 보장 없음)

### Memory & Data (7건)
- JSON.parse 에러 미처리 (narrative-memory.ts 여러 곳)
- decayMemoryStrength, pruneWeakMemories 데드 함수 (호출만 존재)
- translateIntimacyLevel 미사용 함수
- markMemoryMentioned, cleanExpiredImageCache 미사용 함수
- Message 테이블 중복 인덱스 (sessionId + sessionId,createdAt)
- TypeScript 타입과 Prisma 스키마 불일치
- JSON 문자열 필드에 PostgreSQL Json 타입 미사용

### Frontend (8건 + a11y 3건)
- getCharacterColor 함수 중복 (ChatMessages + ChatHeader)
- MainHeader useEffect 의존성 빈 배열 + 비인증 시 불필요한 호출
- ChatHistorySidebar useEffect 의존성 경고
- ChatInput setTimeout 미정리
- page.tsx useEffect 의존성 추가 누락
- Persona 인터페이스 3곳에서 중복 정의
- 환율 1460 하드코딩
- 키보드 내비게이션 부족, focus trap 미구현, aria-label 누락

---

## Low (23건)

### AI Core (5건)
- API 키 없으면 빈 문자열로 초기화
- 재시도 시 "온도 높여서" 주석이 코드와 불일치
- generateStoryResponse(비스트리밍) 미사용 가능성
- Prisma import 구조 어색함 (GET이 chat/route.ts에 있음)
- parseImageCodes 함수 미사용 가능성

### Security (6건)
- checkAdmin() 6개 파일에 중복 정의
- works/route.ts period 파라미터 미사용
- user/sessions/route.ts limit 상한선 없음
- 중복 신고 방지 없음
- fire-and-forget 오프닝 메시지 (Critical C3와 중복)
- 파일 업로드 확장자-MIME 불일치 미검증

### Memory & Data (3건)
- prismaErrorHandler 대부분 API에서 미사용
- consolidateMemories O(n^2) 비교
- dev 환경 query 로깅 verbose

### Frontend (9건)
- admin 확인에 `(session?.user as any)?.role`
- chat/layout.tsx children 미사용
- OpeningScreen openings 비어있는 케이스
- MarkdownRenderer 'use client' 필요성
- LayoutContext toggleSidebar useCallback 미적용
- logger.ts warn 프로덕션 표시
- textarea 자동 높이 조절 없음 (Low~Medium)

---

## 긍정적 발견

1. **Admin 인가 일관적**: 모든 admin API에 checkAdmin() → DB role 검증
2. **콘텐츠 CRUD 소유자 검증 우수**: PUT/DELETE에 모두 authorId 검증
3. **파일 업로드 보안 양호**: 타입 whitelist + 5MB 크기 제한
4. **useChatReducer 패턴**: 17개 useState를 단일 reducer로 통합
5. **ChatCacheProvider**: LRU 캐시 + TTL + ref 기반
6. **SSE 스트리밍 처리**: STREAM_START/DELTA/COMPLETE 패턴 견고
7. **에러 바운더리**: chat/error.tsx, app/error.tsx 구현
8. **Self-follow 방지**: 자기 자신 팔로우 차단
9. **Prisma ORM**: SQL injection 기본 방어

---

## 수정 이력

| 일자 | 수정 | 건수 |
|------|------|------|
| 03-04 | 1차: IDOR/인가 수정 (C1,C2,H1-H3 + chat GET) | 6건 완료 |
| 03-04 | 2차: JSON.parse 보호 (C4,C8 + narrative-memory 11곳 + pro-analyze + prompt-builder) | 15곳 완료 |
| 03-04 | 3차: select 최적화 (C5,H11 + consolidateMemories) | 3함수 완료 |
| 03-04 | 4차: race condition 방지 (H12 P2002 catch + H14 $transaction) | 2함수 완료 |
| 03-04 | 5차: page.tsx 리팩토링 (C6 모놀리식 + C7 useEffect 의존성) | 2596줄→211줄, 6개 파일 추출. useState 57→7, useEffect 11→2 |
