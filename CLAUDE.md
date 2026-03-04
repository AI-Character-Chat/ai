# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SYNK Character Chat — an AI character chat platform built with Next.js. Users create "Works" (stories/worlds) containing characters, lore, and opening scenes. Users then chat with AI characters powered by Google Gemini, with multi-character dialogue, narrative memory, relationship tracking, and image generation.

## Commands

```bash
npm run dev          # Development server (localhost:3000)
npm run build        # Production build (runs prisma generate + db push + next build)
npm run lint         # ESLint
npm run db:push      # Sync Prisma schema to database
npm run db:studio    # Open Prisma Studio GUI
npm run db:seed      # Seed database (npx tsx prisma/seed.ts)
```

## Architecture

- **Framework:** Next.js 14 App Router with TypeScript (strict mode)
- **Database:** PostgreSQL (Neon) via Prisma ORM
- **Storage:** Vercel Blob Storage (이미지 업로드/생성)
- **Auth:** NextAuth v5 beta with Kakao + Google OAuth, custom `AuthSession` table (not default Session)
- **AI:** Google Gemini (`gemini-2.5-flash` primary, `gemini-2.5-pro-preview-06-05` fallback) with exponential backoff retry
- **Styling:** Tailwind CSS with custom sky-blue theme
- **Path alias:** `@/*` → `./src/*`

### Key Directories

- `src/app/api/` — REST API routes (chat, characters, works, lorebook, personas, admin, social)
- `src/lib/` — Core services: `gemini.ts` (AI), `memory.ts` (Mem0 vector search), `narrative-memory.ts` (scene-based memory), `prompt-builder.ts` (prompt formatting), `auth.ts` (NextAuth config), `prisma.ts` (DB singleton), `imageGeneration.ts` (Gemini image gen → Vercel Blob)
- `src/middleware.ts` — Rate Limiting (IP 기반, 엔드포인트별 차등 제한)
- `src/components/` — React components (AuthProvider, Header, ChatHistorySidebar, Persona*)
- `src/contexts/` — LayoutContext (sidebar state)
- `src/types/index.ts` — Shared TypeScript interfaces
- `prisma/schema.prisma` — Full database schema (~600 lines)

### Chat Flow

1. User selects a Work and Opening → `POST /api/chat` creates a ChatSession
2. User sends message → `PUT /api/chat/session/[sessionId]`
3. Server loads context: conversation history (max 30 messages / 50K tokens), active lorebook entries (keyword + condition filtered), Mem0 memories, narrative scene state, character relationships
4. Gemini generates multi-character responses in markdown format:
   - `[나레이션]` narrative text, `[캐릭터|표정]` character dialogue, `[장면]` scene metadata
5. Responses are parsed, saved as individual Message records, and relationship/memory state is updated

### Memory System (Multi-Layer)

- **Mem0 vector DB** (`memory.ts`): Semantic search for character knowledge. Uses Qdrant in production, in-memory in dev.
- **Narrative memory** (`narrative-memory.ts`): Scene-based memories with per-character interpretation. Tracks locations, emotions, relationship changes.
- **Conversation logs**: Raw dialogue preservation in `ConversationLog` table.
- **Relationship tracking**: `UserCharacterRelationship` stores intimacy (0-100), speech style, known facts per character.

### Database Schema Domains

- **Auth**: User, Account, AuthSession, VerificationToken
- **Content**: Work, Character, Opening, LorebookEntry, GalleryImage, Persona
- **Chat**: ChatSession (with intimacy/turnCount/sceneState), Message (character/narrator/user/system roles)
- **Memory**: ConversationLog, Scene, CharacterMemory, RelationshipChange
- **Social**: Follow, WorkLike, WorkComment, CommentLike, Notification
- **Admin**: Banner, Announcement, Report, SiteSetting

### Error Handling

`prismaErrorHandler.ts` maps Prisma error codes to HTTP status: P2002→409, P2025→404, P2003→400, P2014→400. API routes return `NextResponse.json()` with consistent error shapes.

## Agent Teams 운영 규칙

### 핵심 원칙: 항상 팀 단위 작업
- **모든 작업은 팀을 구성하여 병렬로 진행한다** (CEO 지시)
- 단순 버그 1줄 수정 같은 극히 사소한 건만 예외
- 팀원에게 역할(설계/구현/테스트)을 명확히 부여하고, 각자 역할 안에서만 행동
- 마루(CTO)는 설계+조율만, 코드 수정 안 함

### 팀 구성 — quality-improvement

| 이름 | 역할 | 모델 |
|------|------|------|
| 🏔️ **마루** | CTO / 리더+설계 | Opus |
| 🔥 **루미** | AI 엔지니어 (백엔드+AI+보안) | Opus |
| 🐿️ **다람** | 메모리 엔지니어 (DB+타입) | Opus |
| 🦋 **나래** | 프론트 개발자 (UI+접근성) | Opus |
| ✅ **바로** | QA 엔지니어 (검증 전용) | Sonnet |

### 파일 소유권 — 완전 매핑

각 팀원은 **아래 목록에 있는 자기 파일만** 수정한다. 목록에 없는 파일은 마루에게 물어본다.

#### 🏔️ 마루 (CTO) — 코드 수정 안 함, 읽기+설계+조율만
```
docs/*                        ← 문서 업데이트
CLAUDE.md                     ← 팀 규칙 관리
```

#### 🔥 루미 — AI 엔진 + 모든 API 라우트 + 인증 + 미들웨어
```
src/lib/gemini.ts             ← AI 엔진 (Gemini 호출, 스키마, 파싱)
src/lib/gemini.test.ts        ← AI 테스트
src/lib/prompt-builder.ts     ← 프롬프트 조립
src/lib/chat-service.ts       ← 채팅 서비스 (요약 등)
src/lib/auth.ts               ← NextAuth 설정
src/lib/imageGeneration.ts    ← 이미지 생성
src/lib/preview-parser.ts     ← 스토리 프리뷰 파서
src/lib/logger.ts             ← 로깅
src/middleware.ts              ← Rate Limit

src/app/api/auth/**           ← 인증 API
src/app/api/chat/**           ← 채팅 API (route.ts, session, pro-analyze, persona)
src/app/api/characters/**     ← 캐릭터 CRUD
src/app/api/works/**          ← 작품 CRUD + 좋아요
src/app/api/openings/**       ← 오프닝 CRUD
src/app/api/lorebook/**       ← 로어북 CRUD
src/app/api/personas/**       ← 페르소나 CRUD
src/app/api/upload/**         ← 파일 업로드
src/app/api/generate-image/** ← 이미지 생성
src/app/api/follow/**         ← 팔로우
src/app/api/comments/**       ← 댓글 + 좋아요 + 신고
src/app/api/notifications/**  ← 알림
src/app/api/user/**           ← 유저 프로필/세션/작품
src/app/api/author/**         ← 작가 프로필
src/app/api/announcements/**  ← 공지사항 API
src/app/api/admin/**          ← 관리자 API (전체)
```

#### 🐿️ 다람 — 메모리 시스템 + DB 스키마 + Prisma + 타입
```
src/lib/narrative-memory.ts   ← 장면/관계/감정 기억 시스템
src/lib/prisma.ts             ← Prisma 싱글톤 + 로깅
src/lib/prismaErrorHandler.ts ← Prisma 에러→HTTP 매핑
prisma/schema.prisma          ← DB 스키마 (모든 모델 정의)
prisma/seed.ts                ← DB 시드 데이터
src/types/index.ts            ← 공유 타입 ⚠️ 나래와 공유
src/types/next-auth.d.ts      ← NextAuth 타입 확장
```

#### 🦋 나래 — 모든 페이지 + 모든 컴포넌트 + 컨텍스트 + 훅
```
# 페이지 (page.tsx / layout / error / loading)
src/app/page.tsx              ← 홈페이지
src/app/layout.tsx            ← 루트 레이아웃
src/app/error.tsx             ← 글로벌 에러 바운더리
src/app/login/page.tsx        ← 로그인
src/app/mypage/page.tsx       ← 마이페이지
src/app/chat/[workId]/page.tsx    ← 채팅
src/app/chat/[workId]/error.tsx
src/app/chat/[workId]/loading.tsx
src/app/chat/layout.tsx
src/app/studio/page.tsx           ← 스튜디오 목록
src/app/studio/[workId]/page.tsx  ← 스튜디오 편집
src/app/studio/[workId]/error.tsx
src/app/admin/page.tsx            ← 관리자 대시보드
src/app/admin/components/*.tsx    ← 관리자 탭 컴포넌트
src/app/announcements/[id]/page.tsx ← 공지사항
src/app/author/[authorId]/page.tsx  ← 작가 프로필

# 컴포넌트
src/components/MainHeader.tsx
src/components/ChatHistorySidebar.tsx
src/components/AuthProvider.tsx
src/components/MarkdownRenderer.tsx
src/components/Persona*.tsx       ← PersonaModal, PersonaManager, PersonaFormModal, PersonaDropdown
src/components/HomePage/*.tsx     ← WorkDetailModal, CommentsSection, WorksBrowseView 등
src/components/HomePage/types.ts  ← HomePage 타입
src/components/HomePage/useProfile.ts
src/components/chat/*.tsx         ← ChatContainer, ChatMessages, ChatHeader, ChatInput, OpeningScreen
src/components/chat/useChatReducer.ts
src/components/chat/utils.ts
src/components/studio/*.tsx       ← StudioPreview

# 컨텍스트 + 훅
src/contexts/LayoutContext.tsx
src/contexts/ChatCacheContext.tsx
src/hooks/usePersonas.ts
```

#### ✅ 바로 (QA) — 읽기 전용, 코드 수정 절대 금지
```
모든 파일 읽기 가능
tsc --noEmit, npm run build, API 테스트 실행
Edit/Write 도구 사용 금지
```

### 공유 파일 규칙 (충돌 방지)

| 파일 | 소유자 | 공유 조건 |
|------|--------|-----------|
| `src/types/index.ts` | 다람 | 나래도 수정 가능. **수정 전 반드시 상대방에게 메시지** |
| `src/types/next-auth.d.ts` | 다람 | 나래가 필요 시 다람에게 요청 |
| `src/components/chat/ChatContainer.tsx` | 나래 | API 호출 로직 변경 시 루미에게 확인 |
| `src/app/api/chat/route.ts` | 루미 | 메모리 관련 수정 시 다람에게 확인 |

### 경계 위반 시 대응
1. **자기 도메인이 아닌 파일 수정 필요** → 마루(CTO)에게 메시지로 요청
2. **마루가 판단** → 해당 도메인 소유자에게 작업 전달 또는 일시 승인
3. **절대 본인이 직접 수정하지 않는다** (이전 세션에서 다람이 루미 도메인 침범하여 StoryResponse 인터페이스 삭제 사고 발생)

### 작업 흐름
```
마루 설계+배분 → 루미/다람/나래 동시 구현 → 바로 검증
                   ↑                              ↓
                   └───── 이슈 발견 시 ←──────────┘
```

### 설계 재진입 트리거
다음 상황에서는 구현을 멈추고 마루가 분석부터 한다:
- 바로(QA) 테스트 결과가 예상과 다를 때
- 같은 문제를 2번째 수정할 때
- 다른 팀원 도메인에 영향을 주는 변경이 필요할 때

### 메모 위치
| 내용 | 기록 위치 |
|------|-----------|
| 태스크 현황, 완료 기록 | `docs/work-status.md` |
| 발견한 이슈, 주의사항 | `docs/code-review-2026-03-04.md` 수정 이력 섹션 |
| 세션 간 인수인계 | `docs/session-handoff.md` |
| 팀 규칙, 도메인 경계 | `CLAUDE.md` (이 파일) |

### 공유 현황판: `docs/work-status.md`
- **모든 팀원은 작업 완료 후 이 파일을 업데이트한다**
- 세션이 종료되더라도 다음 팀이 이 파일만 읽으면 즉시 이어서 작업 가능해야 한다
- 업데이트 항목: 현재 단계, 변경 파일, 발견된 이슈, 다음 할 일, 세션 기록

### 팀 빠른 실행 가이드
새 세션에서 팀을 다시 만들 때:
1. `docs/work-status.md` 읽기 → 미완료 태스크 확인
2. TeamCreate → TaskCreate (미완료 건) → Task로 팀원 spawn
3. 각 팀원 prompt에 반드시 포함: **이름, 도메인 파일 목록, 수정 금지 범위, 완료 시 보고 지시**
4. 공유 파일(`types/index.ts`) 수정하는 태스크는 동시에 2명에게 배분하지 않는다

### 단축어
사용자가 아래 단축어를 입력하면 해당 동작을 수행한다:

| 단축어 | 동작 |
|--------|------|
| `ㅅㅌ` | `docs/work-status.md`를 읽고 현재 상황을 파악하여 요약 |
| `ㄱㄱ` | `docs/work-status.md`를 읽고 자기 역할에 맞는 다음 할 일을 바로 진행 |
| `ㅇㄷ` | 현재까지 작업 내용을 `docs/work-status.md`에 업데이트 |
| `ㅂㅇ` | `docs/work-status.md`와 `docs/prompt-experiment-log.md`를 읽고 변경사항을 노션에 반영 (개발자 태스크 DB + 프롬프트 실험 기록 페이지) |

### 금지 사항 (과거 실험에서 확인됨)
- post-history에 2개 이상 지시 금지 (어텐션 경쟁)
- compound rule에 절 추가 금지 (말투 붕괴)
- thinkingBudget 1024 금지 (규칙 무시 유발)
- 프롬프트 3줄 이상 금지 (v10 2줄이 최적)
- SDT를 프롬프트로 해결 시도 금지 (4번 실패)
- 품질 향상은 프롬프트가 아닌 다른 경로로 (스키마 필드, 구조 변경 등)

## 세션 인수인계 규칙

- **새 세션 시작 시**: 반드시 `docs/session-handoff.md`를 먼저 읽고 이전 맥락 파악
- **세션 종료 전**: `docs/session-handoff.md`의 "이번 세션 작업 내역"에 수행 내역 기록
- **노션 작업 시**: `session-handoff.md`의 "노션 리소스 맵"에서 ID 참조
- **CEO 선호사항**: `session-handoff.md`의 "CEO 작업 환경 선호사항" 반드시 준수

### Compact Instructions
컨텍스트 압축 시 반드시 보존할 정보:
- 노션 DB ID (비즈니스: collection://22577360-41c2-4b4e-a6e1-58d90b29a356, 개발자: collection://7f20d352-3dcf-447b-85e8-5092ce489b9b)
- 노션 페이지 ID (실험기록: 3184ec0d-56d6-8194-9eac-ef6565a56364, 로드맵: 3184ec0d-56d6-81c1-aaaf-f1b10fb0f2d0)
- CEO 선호사항: callout 기반 노션 포맷, 상세 태스크 카드 (callout+가이드+URL), 기술용어 피하기
- 스케줄 태스크: daily-notion-sync (매일 00:00), session-handoff-update (수동)

## Conventions

- Korean comments and documentation throughout the codebase
- API routes use Next.js Route Handlers (`route.ts`) with `NextRequest`/`NextResponse`
- Prisma singleton pattern in `lib/prisma.ts` — always import from there
- Token estimation for Korean text: 1.5 characters ≈ 1 token (in `prompt-builder.ts`)
- Lorebook entries activate conditionally based on keywords, minimum intimacy, minimum turns, and required character presence
- Safety settings are `BLOCK_NONE` for all Gemini harm categories (creative fiction context)
