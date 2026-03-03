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

### 팀 구성 — quality-improvement

| 이름 | 역할 | 모델 | 담당 도메인 |
|------|------|------|-------------|
| **마루** (CTO) | 리더+설계 | Opus | 전체 조율, 태스크 배분, 설계 승인. 코드 직접 수정 안 함 |
| **루미** | AI/Chat 개발 | Opus | `src/lib/gemini.ts`, `src/lib/prompt-builder.ts`, `src/app/api/**`, `src/middleware.ts` |
| **다람** | Memory 개발 | Opus | `src/lib/narrative-memory.ts`, `src/lib/prisma*.ts`, `prisma/schema.prisma`, `src/types/index.ts` |
| **나래** | Frontend 개발 | Opus | `src/components/**`, `src/app/**/page.tsx`, `src/contexts/**` |
| **바로** | QA/검증 | Sonnet | 전체 파일 읽기 전용. `tsc`, `build`, API 테스트. 코드 수정 안 함 |

### 파일 소유권 (절대 규칙)
- 각 팀원은 자기 도메인 파일만 수정한다
- 다른 팀원 도메인 파일을 수정해야 할 때 → 리더에게 메시지로 요청
- `src/types/index.ts`는 다람+나래 공유 — 수정 시 상대방에게 메시지 필수
- 바로(QA)는 Edit/Write 도구 사용 금지

### 작업 흐름
```
CTO 설계+배분 → 루미/다람/나래 동시 구현 → 바로 검증
                  ↑                              ↓
                  └───── 이슈 발견 시 ←──────────┘
```

### 설계 재진입 트리거
다음 상황에서는 구현을 멈추고 CTO가 분석부터 한다:
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
3. 각 팀원 prompt에 반드시 포함: 이름, 도메인, 수정 금지 파일 목록, 완료 시 보고 지시

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
