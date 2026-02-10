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
- **Database:** PostgreSQL (production/Vercel), SQLite (local dev) via Prisma ORM
- **Auth:** NextAuth v5 beta with Kakao + Google OAuth, custom `AuthSession` table (not default Session)
- **AI:** Google Gemini (`gemini-2.5-flash` primary, `gemini-2.5-pro-preview-06-05` fallback) with exponential backoff retry
- **Styling:** Tailwind CSS with custom sky-blue theme
- **Path alias:** `@/*` → `./src/*`

### Key Directories

- `src/app/api/` — REST API routes (chat, characters, works, lorebook, personas, admin, social)
- `src/lib/` — Core services: `gemini.ts` (AI), `memory.ts` (Mem0 vector search), `narrative-memory.ts` (scene-based memory), `prompt-builder.ts` (prompt formatting), `auth.ts` (NextAuth config), `prisma.ts` (DB singleton)
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

## Conventions

- Korean comments and documentation throughout the codebase
- API routes use Next.js Route Handlers (`route.ts`) with `NextRequest`/`NextResponse`
- Prisma singleton pattern in `lib/prisma.ts` — always import from there
- Token estimation for Korean text: 1.5 characters ≈ 1 token (in `prompt-builder.ts`)
- Lorebook entries activate conditionally based on keywords, minimum intimacy, minimum turns, and required character presence
- Safety settings are `BLOCK_NONE` for all Gemini harm categories (creative fiction context)
