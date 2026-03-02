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

### 팀 구성
리더가 팀을 생성할 때 아래 3가지 역할의 팀원을 생성한다:

| 역할 | 하는 일 | 하지 않는 일 |
|------|---------|-------------|
| **구현 팀원** | 코드 수정, tsc 확인, 구현 완료 보고 | 테스트 실행 |
| **테스트 팀원** | 테스트 실행, 결과 기록, 이슈 발견 보고 | 코드 수정 |
| **설계 팀원** | 코드 분석, 방안 비교, 방향 제시 | 코드 수정 |

- 역할 경계를 절대 넘지 않는다 (테스트/설계 팀원은 Edit/Write 사용 금지)
- 작업 대상 파일이 겹치지 않도록 도메인을 분리한다
- 팀원들은 발견 사항을 즉시 리더와 관련 팀원에게 메시지로 공유한다

### 작업 흐름
1. 설계 팀원이 분석/방안 제시 → 리더가 승인
2. 구현 팀원이 코드 수정 → 완료 보고
3. 테스트 팀원이 검증 → 이슈 발견 시 구현 팀원에게 직접 메시지
4. 이슈 해결될 때까지 2→3 반복

### 설계 재진입 트리거
다음 상황에서는 구현을 멈추고 설계 팀원이 분석부터 한다:
- 테스트 결과가 예상과 다를 때
- 같은 문제를 2번째 수정할 때
- 구현 방향이 불확실할 때
- 새로운 기능 요구사항이 발생할 때

### 공유 현황판: `docs/work-status.md`
- **모든 팀원은 작업 완료 후 이 파일을 업데이트한다**
- 세션이 종료되더라도 다음 팀이 이 파일만 읽으면 즉시 이어서 작업 가능해야 한다
- 업데이트 항목: 현재 단계, 변경 파일, 발견된 이슈, 다음 할 일, 세션 기록

### 단축어
사용자가 아래 단축어를 입력하면 해당 동작을 수행한다:

| 단축어 | 동작 |
|--------|------|
| `ㅅㅌ` | `docs/work-status.md`를 읽고 현재 상황을 파악하여 요약 |
| `ㄱㄱ` | `docs/work-status.md`를 읽고 자기 역할에 맞는 다음 할 일을 바로 진행 |
| `ㅇㄷ` | 현재까지 작업 내용을 `docs/work-status.md`에 업데이트 |

### 금지 사항 (과거 실험에서 확인됨)
- post-history에 2개 이상 지시 금지 (어텐션 경쟁)
- compound rule에 절 추가 금지 (말투 붕괴)
- thinkingBudget 1024 금지 (규칙 무시 유발)
- 프롬프트 3줄 이상 금지 (v10 2줄이 최적)
- SDT를 프롬프트로 해결 시도 금지 (4번 실패)
- 품질 향상은 프롬프트가 아닌 다른 경로로 (스키마 필드, 구조 변경 등)

## Conventions

- Korean comments and documentation throughout the codebase
- API routes use Next.js Route Handlers (`route.ts`) with `NextRequest`/`NextResponse`
- Prisma singleton pattern in `lib/prisma.ts` — always import from there
- Token estimation for Korean text: 1.5 characters ≈ 1 token (in `prompt-builder.ts`)
- Lorebook entries activate conditionally based on keywords, minimum intimacy, minimum turns, and required character presence
- Safety settings are `BLOCK_NONE` for all Gemini harm categories (creative fiction context)
