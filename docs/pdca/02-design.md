# PDCA Design - SYNK 캐릭터 챗 시스템

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    클라이언트 (브라우저)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 홈/탐색   │ │ 스튜디오  │ │  채팅    │ │  관리자   │   │
│  │ page.tsx  │ │ studio/  │ │ chat/    │ │ admin/   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS
┌─────────────────────▼───────────────────────────────────┐
│                   Next.js API Routes                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐      │
│  │  Auth   │ │  Works  │ │  Chat   │ │  Admin  │      │
│  │ NextAuth│ │ CRUD    │ │ AI+Mem  │ │ Stats   │      │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘      │
│       │           │           │           │             │
│  ┌────▼───────────▼───────────▼───────────▼────┐       │
│  │              Prisma ORM                      │       │
│  └──────────────────┬──────────────────────────┘       │
└─────────────────────┼───────────────────────────────────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │  Neon    │ │ Gemini   │ │  Mem0    │
   │PostgreSQL│ │ 2.5-Flash│ │ (Qdrant) │
   └──────────┘ └──────────┘ └──────────┘
```

## 데이터 모델 도메인

```
[인증]                    [콘텐츠]                    [채팅]
User ─── Account         Work ─── Character         ChatSession ─── Message
  │      AuthSession       │      Opening               │
  │      Persona           │      LorebookEntry          │
  │                        │      GalleryImage           │
  │                        │                             │
[소셜]                    [메모리]                   [관리]
Follow                   Scene                      Banner
WorkLike                 ConversationLog            Announcement
WorkComment              CharacterMemory            Report
CommentLike              RelationshipChange         SiteSetting
Notification             UserCharacterRelationship
```

## 핵심 데이터 플로우

### 채팅 요청 처리 파이프라인
```
유저 메시지 입력
  │
  ├── [1] 인증 확인 (auth)
  ├── [2] 입력 검증 (5000자, 빈 메시지)
  ├── [3] 세션 소유자 확인
  │
  ├── [4] 컨텍스트 수집 (병렬)
  │     ├── 대화 히스토리 (최근 30개 / 50K 토큰)
  │     ├── 로어북 필터링 (키워드 + 친밀도 + 턴 수 + 등장 캐릭터)
  │     ├── Mem0 기억 검색 (캐시 기반, 10턴마다 갱신)
  │     └── 서사 기억 컨텍스트 (활성 Scene + 관계 상태)
  │
  ├── [5] 프롬프트 조립
  │     ├── 세계관 (1200자 제한)
  │     ├── 캐릭터 프롬프트 + 기억 컨텍스트
  │     ├── 로어북 (800자 제한)
  │     ├── 유저 페르소나
  │     └── 대화 히스토리
  │
  ├── [6] Gemini API 호출 (Exponential Backoff, 최대 8회 재시도)
  │
  ├── [7] 응답 파싱
  │     ├── [나레이션] → narratorNote
  │     ├── [캐릭터|표정] → characterResponses[]
  │     └── [장면] → updatedScene
  │
  └── [8] 저장 (병렬)
        ├── Message (narrator + dialogue)
        ├── ConversationLog (원본 보관)
        ├── Scene 업데이트 (토픽, 위치)
        ├── UserCharacterRelationship (친밀도 +0.5)
        └── Mem0 저장 (10턴마다)
```

### 메모리 계층 구조
```
Layer 1: 단기 기억 (ChatSession)
  └── recentEvents (최근 10개 이벤트)
  └── presentCharacters (현재 등장 캐릭터)

Layer 2: 중기 기억 (대화 히스토리)
  └── Message (최근 30개 / 50K 토큰)

Layer 3: 장기 기억
  ├── Mem0 벡터 DB (의미 기반 검색)
  │   └── 캐릭터별 유저 기억 (10턴마다 저장, 5분마다 캐시 갱신)
  └── 서사 기억 (PostgreSQL)
      ├── ConversationLog (원본 전문)
      ├── Scene (장면 단위 서사)
      ├── CharacterMemory (캐릭터 관점 해석)
      └── UserCharacterRelationship (관계 상태)
```

## API 엔드포인트 설계

### 인증 패턴
- **읽기**: 인증 불필요 (공개 데이터)
- **쓰기**: `auth()` + 소유자 확인 (authorId === session.user.id)
- **관리자**: `auth()` + role === 'admin'

### 응답 형식
```typescript
// 성공
{ ...data }

// 에러
{ error: string, details?: string (dev only) }
```

## 기술 스택 상세

| 영역 | 기술 | 버전 | 용도 |
|------|------|------|------|
| 프레임워크 | Next.js | 14.2.35 | SSR + API Routes |
| 언어 | TypeScript | 5.9.3 | 타입 안전성 |
| DB ORM | Prisma | 5.22.0 | 데이터 액세스 |
| DB | PostgreSQL | Neon | 영구 저장소 |
| 인증 | NextAuth.js | 5.0.0-beta.30 | OAuth |
| AI | Gemini 2.5-Flash | @google/generative-ai 0.24.1 | 대화 생성 |
| 벡터 DB | Mem0 | mem0ai 2.2.2 | 장기 기억 |
| 스타일 | Tailwind CSS | 3.4.0 | UI |
| 배포 | Vercel | - | 호스팅 |
