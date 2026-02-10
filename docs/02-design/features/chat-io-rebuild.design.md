# [Design] chat-io-rebuild: 채팅 입출력 로직 재구축

> Plan: `docs/01-plan/features/chat-io-rebuild.plan.md`

---

## 1. 파일 변경 맵

### 수정 파일
| 파일 | 현재 | 변경 내용 |
|------|------|----------|
| `src/lib/gemini.ts` (477줄) | gemini-2.5-pro, 단일 prompt, Markdown 파서 | SDK 교체, 2.5-flash, systemInstruction/contents 분리, JSON mode |
| `src/app/api/chat/route.ts` (394줄) | narrative-memory 미연결, 20턴 블로킹 요약 | narrative-memory 연결, 5턴 비동기 요약 |
| `src/contexts/ChatCacheContext.tsx` (131줄) | FIFO 제거, workId:sessionId 키 | LRU 제거, sessionId 단일 키 |
| `src/app/chat/layout.tsx` (23줄) | ChatView import | ChatContainer import |
| `package.json` | @google/generative-ai ^0.24.1 | @google/genai (최신) |

### 신규 파일
| 파일 | 역할 | 예상 줄 수 |
|------|------|-----------|
| `src/components/chat/ChatContainer.tsx` | 메인 컨테이너 + 데이터 로드 + SSE | ~250 |
| `src/components/chat/ChatMessages.tsx` | 메시지 목록 렌더링 | ~150 |
| `src/components/chat/ChatInput.tsx` | 입력창 + 전송 로직 | ~120 |
| `src/components/chat/ChatHeader.tsx` | 서브헤더 (장소/시간/캐릭터) | ~80 |
| `src/components/chat/OpeningScreen.tsx` | 오프닝 선택 + 대화 시작 | ~120 |
| `src/components/chat/useChatReducer.ts` | useReducer 상태 + 타입 정의 | ~100 |

### 삭제 파일
| 파일 | 이유 |
|------|------|
| `src/components/ChatView.tsx` (1187줄) | 5개 컴포넌트로 분리 완료 후 제거 |

### 유지 파일 (변경 없음)
- `src/lib/prompt-builder.ts` - formatConversationHistory, filterActiveLorebookEntries 그대로 사용
- `src/lib/narrative-memory.ts` - 코드 변경 없이 route.ts에서 import만 추가
- `src/components/ChatHistorySidebar.tsx` - 변경 없음
- `src/types/index.ts` - 기존 타입 그대로 사용
- `prisma/schema.prisma` - DB 스키마 변경 없음

---

## 2. 백엔드 상세 설계

### 2.1 gemini.ts 재설계

#### 현재 구조
```
geminiModel (gemini-2.5-pro, 단일 모델 인스턴스)
  ↓
generateStoryResponse(characters, history, userMsg, ...) → 단일 prompt 문자열 조합 → generateContent(prompt)
  ↓
parseMarkdownResponse(text) → StoryResponse
```

#### 새 구조
```
GoogleGenAI 인스턴스 (@google/genai)
  ↓
buildSystemInstruction(work, characters, lorebook) → 정적 문자열 (캐시됨)
  ↓
buildContents(persona, memories, summary, scene, history, userMsg) → 동적 contents 배열
  ↓
ai.models.generateContent({ model, config: { systemInstruction, ... }, contents })
  ↓
JSON 파싱 (responseSchema 보장) → StoryResponse
```

#### 핵심 함수 시그니처

```typescript
// === gemini.ts (새 구조) ===

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 타입 (기존 StoryResponse 유지)
interface StoryResponse {
  responses: Array<{
    characterId: string;
    characterName: string;
    content: string;
    emotion: { primary: string; intensity: number };
  }>;
  narratorNote: string;
  updatedScene: {
    location: string;
    time: string;
    presentCharacters: string[];
  };
}

// [1] systemInstruction 빌더 (작품별 고정 → 캐시됨)
export function buildSystemInstruction(params: {
  worldSetting: string;
  characters: Array<{ name: string; prompt: string }>;
  lorebookStatic: string;
  userName: string;
}): string;

// [2] contents 빌더 (매 턴 변경)
export function buildContents(params: {
  userPersona?: { name: string; age: number | null; gender: string; description: string | null };
  narrativeContexts: string[];  // buildNarrativeContext() 결과들
  sessionSummary?: string;
  sceneState: { location: string; time: string; presentCharacters: string[] };
  conversationHistory: string;
  userMessage: string;
  userName: string;
  previousPresentCharacters?: string[];
}): Array<{ role: string; parts: Array<{ text: string }> }>;

// [3] 메인 응답 생성 (시그니처 변경)
export async function generateStoryResponse(params: {
  systemInstruction: string;
  contents: Array<{ role: string; parts: Array<{ text: string }> }>;
  characters: Array<{ id: string; name: string }>;
  sceneState: { location: string; time: string; presentCharacters: string[] };
}): Promise<StoryResponse>;

// [4] 세션 요약 생성 (기존 유지, 모델만 변경)
export async function generateSessionSummary(
  messages: Array<{ role: string; content: string; characterName?: string }>,
  existingSummary?: string
): Promise<string>;
```

#### systemInstruction 구성

```typescript
export function buildSystemInstruction(params): string {
  const parts: string[] = [];

  // [1] 응답 규칙 + JSON 형식 (전역 고정)
  parts.push(`당신은 인터랙티브 스토리 AI입니다.

## 응답 규칙
- 나레이션: 2-4문장, 오감(시각/청각/촉각) 활용한 분위기 묘사
- 캐릭터 대사: 2-3문장 이상 + 구체적 행동/표정 묘사
- 캐릭터 성격과 말투를 절대 일관되게 유지
- 상황에 맞는 자연스러운 감정 반응
- 표정 종류: neutral, smile, cold, angry, sad, happy, surprised, embarrassed`);

  // [2] 세계관 (작품별 고정)
  if (params.worldSetting) {
    const trimmed = params.worldSetting.length > 2000
      ? params.worldSetting.substring(0, 2000) + '...'
      : params.worldSetting;
    parts.push(`## 세계관\n${trimmed}`);
  }

  // [3] 캐릭터 페르소나 (작품별 고정)
  parts.push('## 캐릭터');
  for (const char of params.characters) {
    let prompt = replaceVariables(char.prompt, params.userName, char.name);
    const maxLen = params.characters.length <= 2 ? 1500 : params.characters.length <= 3 ? 1000 : 700;
    if (prompt.length > maxLen) prompt = prompt.substring(0, maxLen) + '...';
    parts.push(`### ${char.name}\n${prompt}`);
  }

  // [4] 로어북 정적 항목 (작품별 고정)
  if (params.lorebookStatic) {
    parts.push(`## 참고 설정\n${params.lorebookStatic}`);
  }

  return parts.join('\n\n');
}
```

#### JSON responseSchema

```typescript
const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    narrator: {
      type: 'string' as const,
      description: '나레이션. 2-4문장의 분위기/환경 묘사',
    },
    responses: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          character: { type: 'string' as const, description: '캐릭터 이름' },
          content: { type: 'string' as const, description: '대사와 행동 묘사' },
          emotion: {
            type: 'string' as const,
            enum: ['neutral', 'smile', 'cold', 'angry', 'sad', 'happy', 'surprised', 'embarrassed'],
          },
        },
        required: ['character', 'content', 'emotion'],
      },
    },
    scene: {
      type: 'object' as const,
      properties: {
        location: { type: 'string' as const },
        time: { type: 'string' as const },
        presentCharacters: { type: 'array' as const, items: { type: 'string' as const } },
      },
      required: ['location', 'time', 'presentCharacters'],
    },
  },
  required: ['narrator', 'responses', 'scene'],
};
```

#### 폴백 전략

```
JSON 파싱 시도
  ↓ 성공 → StoryResponse 반환
  ↓ 실패
기존 parseMarkdownResponse() 폴백 시도
  ↓ 성공 → StoryResponse 반환
  ↓ 실패
하드코딩 폴백 응답 반환
```

### 2.2 route.ts PUT 재설계

#### 현재 흐름 vs 새 흐름

```
[현재]
auth → body 파싱 → 세션 조회(+30메시지) → 유저 메시지 저장
→ 컨텍스트 수집 → generateStoryResponse(단일 prompt)
→ 나레이션 저장 → 캐릭터 응답 저장 → 세션 업데이트
→ (20턴마다 블로킹 요약) → done

[새 흐름]
auth → body 파싱 → 세션 조회(+30메시지) → 유저 메시지 저장
→ 컨텍스트 수집
→ ★ buildNarrativeContext(각 캐릭터) → 캐릭터별 기억 수집
→ ★ buildSystemInstruction(work, characters) → 정적 프롬프트
→ ★ buildContents(persona, memories, summary, scene, history, userMsg)
→ generateStoryResponse(systemInstruction, contents, ...)
→ 나레이션 저장 → 캐릭터 응답 저장 → 세션 업데이트
→ done (스트림 종료)
→ ★ processConversationForMemory (fire-and-forget)
→ ★ 5턴마다: triggerSummary (fire-and-forget)
→ ★ 5턴마다: decayMemoryStrength (fire-and-forget)
→ ★ 25턴마다: pruneWeakMemories (fire-and-forget)
```

#### narrative-memory 연결 코드

```typescript
// route.ts PUT 내부 - Gemini 호출 전

import {
  buildNarrativeContext,
  processConversationForMemory,
  decayMemoryStrength,
  pruneWeakMemories,
  startScene,
  getActiveScene,
} from '@/lib/narrative-memory';

// [1] 캐릭터별 기억 수집 (병렬)
const narrativeContexts = await Promise.all(
  activeCharacters.map(c =>
    buildNarrativeContext(sessionId, c.id, c.name)
      .catch(() => ({ narrativePrompt: '' }))  // 실패 시 빈 문자열
  )
);
const memoryPrompts = narrativeContexts
  .map(ctx => ctx.narrativePrompt)
  .filter(p => p.length > 0);

// [2] systemInstruction 빌드 (작품별 고정)
const systemInstruction = buildSystemInstruction({
  worldSetting: session.work.worldSetting || '',
  characters: activeCharacters.map(c => ({ name: c.name, prompt: c.prompt })),
  lorebookStatic: lorebookContext,
  userName: session.userName,
});

// [3] contents 빌드 (매 턴 변경)
const contents = buildContents({
  userPersona,
  narrativeContexts: memoryPrompts,
  sessionSummary: session.sessionSummary || undefined,
  sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters },
  conversationHistory,
  userMessage: content,
  userName: session.userName,
  previousPresentCharacters,
});

// [4] AI 응답 생성
const storyResponse = await generateStoryResponse({
  systemInstruction,
  contents,
  characters: activeCharacters.map(c => ({ id: c.id, name: c.name })),
  sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters },
});
```

#### 응답 후 비동기 처리

```typescript
// 스트림 종료 후 fire-and-forget

send('done', {});
controller.close();

// [A] 캐릭터 기억 업데이트 (비동기)
processConversationForMemory({
  sessionId,
  sceneId: activeScene?.sceneId,
  userMessage: content,
  characterResponses: storyResponse.responses.map(r => ({
    characterId: r.characterId,
    characterName: r.characterName,
    content: r.content,
    emotion: r.emotion ? { primary: r.emotion.primary, intensity: r.emotion.intensity } : undefined,
  })),
  emotionalMoment: storyResponse.responses.some(r =>
    r.emotion && ['sad', 'angry', 'surprised', 'happy'].includes(r.emotion.primary) && r.emotion.intensity > 0.7
  ),
}).catch(e => console.error('[NarrativeMemory] processConversation failed:', e));

// [B] 5턴마다 요약 + 기억 감쇠 (비동기)
const newTurnCount = session.turnCount + 1;
if (newTurnCount % 5 === 0) {
  triggerSummary(sessionId, recentMessages, session.sessionSummary || undefined)
    .catch(() => {});
  decayMemoryStrength(sessionId)
    .catch(() => {});
}

// [C] 25턴마다 기억 정리 (비동기)
if (newTurnCount % 25 === 0) {
  pruneWeakMemories(sessionId)
    .catch(() => {});
}
```

#### 요약 Race Condition 방지

```typescript
// route.ts 상단 (모듈 레벨)
const summarizingSessionIds = new Set<string>();

async function triggerSummary(
  sessionId: string,
  messages: Array<{ messageType: string; content: string; character?: { name: string } | null }>,
  existingSummary?: string
) {
  if (summarizingSessionIds.has(sessionId)) return;
  summarizingSessionIds.add(sessionId);

  try {
    const summaryMessages = messages.map(m => ({
      role: m.messageType,
      content: m.content,
      characterName: m.character?.name,
    }));
    const summary = await generateSessionSummary(summaryMessages, existingSummary);
    if (summary) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { sessionSummary: summary },
      });
    }
  } finally {
    summarizingSessionIds.delete(sessionId);
  }
}
```

---

## 3. 프론트엔드 상세 설계

### 3.1 useChatReducer.ts

```typescript
// src/components/chat/useChatReducer.ts

import type { Work, Character, Opening, Message } from '@/types';

// === 세션 타입 (ChatView에서 추출) ===
export interface ChatSession {
  id: string;
  userName: string;
  intimacy: number;
  turnCount: number;
  currentLocation: string;
  currentTime: string;
  presentCharacters: string[];
  recentEvents: string[];
}

export interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

// === 상태 ===
export interface ChatState {
  // 데이터
  work: Work | null;
  session: ChatSession | null;
  messages: Message[];
  // UI
  phase: 'loading' | 'opening' | 'chat' | 'session-loading';
  sending: boolean;
  inputMessage: string;
  // 페르소나
  personas: Persona[];
  selectedPersona: Persona | null;
  // 기타
  generatingImages: Set<string>;
  chatMenuOpen: boolean;
}

// === 액션 ===
export type ChatAction =
  | { type: 'SET_PHASE'; phase: ChatState['phase'] }
  | { type: 'LOAD_WORK'; work: Work }
  | { type: 'LOAD_SESSION'; session: ChatSession; messages: Message[] }
  | { type: 'ADD_MESSAGE'; message: Message }
  | { type: 'UPDATE_SESSION'; session: Partial<ChatSession> }
  | { type: 'SET_SENDING'; sending: boolean }
  | { type: 'SET_INPUT'; text: string }
  | { type: 'SET_PERSONAS'; personas: Persona[]; selected: Persona | null }
  | { type: 'SET_MENU'; open: boolean }
  | { type: 'ADD_GENERATING_IMAGE'; messageId: string }
  | { type: 'REMOVE_GENERATING_IMAGE'; messageId: string }
  | { type: 'RESET' };

// === 초기 상태 ===
export const initialChatState: ChatState = {
  work: null,
  session: null,
  messages: [],
  phase: 'loading',
  sending: false,
  inputMessage: '',
  personas: [],
  selectedPersona: null,
  generatingImages: new Set(),
  chatMenuOpen: false,
};

// === Reducer ===
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_PHASE':
      return { ...state, phase: action.phase };

    case 'LOAD_WORK':
      return { ...state, work: action.work, phase: 'opening' };

    case 'LOAD_SESSION':
      return {
        ...state,
        session: action.session,
        messages: action.messages,
        phase: 'chat',
        sending: false,
      };

    case 'ADD_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };

    case 'UPDATE_SESSION':
      return state.session
        ? { ...state, session: { ...state.session, ...action.session } }
        : state;

    case 'SET_SENDING':
      return { ...state, sending: action.sending };

    case 'SET_INPUT':
      return { ...state, inputMessage: action.text };

    case 'SET_PERSONAS':
      return { ...state, personas: action.personas, selectedPersona: action.selected };

    case 'SET_MENU':
      return { ...state, chatMenuOpen: action.open };

    case 'ADD_GENERATING_IMAGE':
      return { ...state, generatingImages: new Set(state.generatingImages).add(action.messageId) };

    case 'REMOVE_GENERATING_IMAGE': {
      const next = new Set(state.generatingImages);
      next.delete(action.messageId);
      return { ...state, generatingImages: next };
    }

    case 'RESET':
      return {
        ...initialChatState,
        personas: state.personas,
        selectedPersona: state.selectedPersona,
      };

    default:
      return state;
  }
}
```

### 3.2 컴포넌트 구조 + Props

```
ChatContainer (useReducer, useEffect x2, AbortController)
├── props: 없음 (URL params에서 workId/sessionId 읽음)
├── 상태: state + dispatch (useChatReducer)
├── ref: abortControllerRef, messagesEndRef
│
├── OpeningScreen (phase === 'opening')
│   ├── props: work, personas, selectedPersona, onStart, onPersonaChange
│   └── 내부: 오프닝 선택, 캐릭터 표시, 시작 버튼
│
├── ChatHeader (phase === 'chat')
│   ├── props: session, work, chatMenuOpen, onMenuToggle
│   └── 내부: 장소/시간 표시, 등장 캐릭터 아바타
│
├── ChatMessages (phase === 'chat')
│   ├── props: messages, work, generatingImages, messagesEndRef, onGenerateImage
│   └── 내부: 메시지 목록 렌더링, 나레이션/대사/유저 구분
│
└── ChatInput (phase === 'chat')
    ├── props: inputMessage, sending, onSend, onInputChange
    └── 내부: 텍스트 입력, 전송 버튼, 키보드 단축키
```

### 3.3 ChatContainer.tsx 핵심 로직

```typescript
// src/components/chat/ChatContainer.tsx

'use client';

import { useReducer, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { chatReducer, initialChatState } from './useChatReducer';
import { useChatCache } from '@/contexts/ChatCacheContext';
import { useLayout } from '@/contexts/LayoutContext';
import OpeningScreen from './OpeningScreen';
import ChatHeader from './ChatHeader';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';

export default function ChatContainer() {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const { data: authSession } = useSession();
  const params = useParams();
  const searchParams = useSearchParams();
  const chatCache = useChatCache();
  const { refreshSidebar } = useLayout();

  const workId = params.workId as string;
  const existingSessionId = searchParams.get('session');

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeWorkIdRef = useRef<string>('');
  const activeSessionIdRef = useRef<string>('');

  // === Effect 1: URL 변경 감지 ===
  useEffect(() => {
    abortControllerRef.current?.abort();
    activeWorkIdRef.current = workId;
    activeSessionIdRef.current = existingSessionId || '';
    dispatch({ type: 'RESET' });

    if (existingSessionId) {
      dispatch({ type: 'SET_PHASE', phase: 'session-loading' });
      // 캐시 확인 → 없으면 API 호출
      const cached = chatCache.getCache(existingSessionId);
      if (cached) {
        dispatch({ type: 'LOAD_SESSION', session: cached.session!, messages: cached.messages });
      } else {
        loadExistingSession(existingSessionId);
      }
    } else {
      loadWork(workId);
    }
    loadPersonas();
  }, [workId, existingSessionId]);

  // === Effect 2: 자동 스크롤 ===
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages]);

  // === 메시지 전송 (SSE) ===
  const sendMessage = useCallback(async () => {
    if (!state.session || !state.inputMessage.trim() || state.sending) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentSessionId = state.session.id;
    dispatch({ type: 'SET_SENDING', sending: true });
    dispatch({ type: 'SET_INPUT', text: '' });

    try {
      const response = await fetch('/api/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentSessionId, content: state.inputMessage }),
        signal: controller.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        // stale guard: 세션 변경 시 즉시 중단
        if (activeSessionIdRef.current !== currentSessionId) {
          reader.cancel();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        // SSE 이벤트 파싱 + dispatch
        processSSEBuffer(buffer, dispatch, currentSessionId);
        buffer = getUnprocessedBuffer(buffer);
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      console.error('SSE error:', e);
    } finally {
      dispatch({ type: 'SET_SENDING', sending: false });
      // 캐시 업데이트
      if (state.session) {
        chatCache.updateMessages(currentSessionId, state.messages);
      }
    }
  }, [state.session, state.inputMessage, state.sending]);

  // === 렌더링 ===
  if (state.phase === 'loading' || state.phase === 'session-loading') {
    return <LoadingSpinner />;
  }

  if (state.phase === 'opening') {
    return (
      <OpeningScreen
        work={state.work!}
        personas={state.personas}
        selectedPersona={state.selectedPersona}
        onStart={startChat}
        onPersonaChange={handlePersonaChange}
      />
    );
  }

  return (
    <div className="chat-container">
      <ChatHeader
        session={state.session!}
        work={state.work!}
        menuOpen={state.chatMenuOpen}
        onMenuToggle={() => dispatch({ type: 'SET_MENU', open: !state.chatMenuOpen })}
      />
      <ChatMessages
        messages={state.messages}
        work={state.work!}
        generatingImages={state.generatingImages}
        messagesEndRef={messagesEndRef}
        onGenerateImage={generateSceneImage}
      />
      <ChatInput
        value={state.inputMessage}
        sending={state.sending}
        onSend={sendMessage}
        onChange={(text) => dispatch({ type: 'SET_INPUT', text })}
      />
    </div>
  );
}
```

### 3.4 ChatCacheContext.tsx 변경

```typescript
// 변경점: 캐시 키를 sessionId만 사용, LRU 제거 방식

// Before
getCache(workId: string, sessionId?: string): CacheEntry | null
setCache(workId: string, sessionId: string, data: CacheData): void
// 키: `${workId}:${sessionId}`

// After
getCache(sessionId: string): CacheEntry | null
setCache(sessionId: string, data: CacheData): void
// 키: sessionId (고유값)
// 제거: LRU (마지막 접근 시간 기준) - 기존 FIFO에서 변경
```

---

## 4. 데이터 흐름 다이어그램

### 4.1 메시지 전송 전체 흐름

```
[프론트엔드]                              [백엔드 route.ts PUT]

ChatInput.onSend()
  ↓
dispatch(SET_SENDING, true)
dispatch(SET_INPUT, '')
  ↓
fetch('/api/chat', PUT, SSE)  ────────→  auth + body 파싱
                                          ↓
                                         세션 조회 (+ 최근 30메시지)
                                          ↓
                                         유저 메시지 저장 ──→ SSE: user_message
                                          ↓
                                     ┌── buildNarrativeContext(캐릭터별) ← narrative-memory.ts
                                     │   캐릭터별 관계/기억/장면 수집
                                     │
                                     ├── buildSystemInstruction(작품 데이터) ← gemini.ts
                                     │   세계관 + 캐릭터 페르소나 + 로어북
                                     │
                                     └── buildContents(동적 데이터) ← gemini.ts
                                         페르소나 + 기억 + 요약 + 대화 + 유저 메시지
                                          ↓
                                         Gemini 2.5 Flash (JSON mode)
                                         systemInstruction: 캐시됨 (90% 할인)
                                         contents: 매번 새로 처리
                                          ↓
                                         JSON 파싱 → StoryResponse
                                          ↓
                                         나레이션 저장 ──→ SSE: narrator
                                         캐릭터 응답 저장 ──→ SSE: character_response
                                         세션 업데이트 ──→ SSE: session_update
                                          ↓
                                         SSE: done ──→ 스트림 종료
                                          ↓ (fire-and-forget 비동기)
                                         processConversationForMemory()
                                         triggerSummary() (5턴마다)
                                         decayMemoryStrength() (5턴마다)
                                         pruneWeakMemories() (25턴마다)
  ↓
SSE 이벤트 수신
  ↓
dispatch(ADD_MESSAGE, ...)
dispatch(UPDATE_SESSION, ...)
dispatch(SET_SENDING, false)
  ↓
캐시 업데이트
```

### 4.2 세션 전환 흐름

```
사이드바에서 다른 세션 클릭
  ↓
URL 변경: /chat/[workId]?session=newSessionId
  ↓
useEffect[workId, sessionId] 트리거
  ↓
abortControllerRef.current?.abort()    ← 진행 중 SSE 즉시 취소
activeSessionIdRef.current = newId
dispatch({ type: 'RESET' })
  ↓
캐시 확인
  ├── HIT → dispatch(LOAD_SESSION, cached)  ← 즉시 표시
  └── MISS → dispatch(SET_PHASE, 'session-loading')
             → loadExistingSession(newId)
               → stale guard 체크 (activeSessionIdRef)
               → dispatch(LOAD_SESSION, fetched)
```

---

## 5. 구현 순서 (의존성 기반)

```
[Step 1] SDK 교체 + gemini.ts 재설계
         ├── @google/genai 설치
         ├── buildSystemInstruction()
         ├── buildContents()
         ├── generateStoryResponse() 시그니처 변경
         ├── JSON responseSchema
         └── 기존 parseMarkdownResponse() 폴백으로 유지

[Step 2] route.ts PUT 재설계
         ├── narrative-memory.ts import
         ├── buildNarrativeContext() 호출
         ├── 새 gemini 함수 시그니처 사용
         ├── processConversationForMemory() 연결
         ├── triggerSummary() (5턴 비동기)
         └── decayMemoryStrength() / pruneWeakMemories()

    ↓ 여기서 빌드 검증 (백엔드 완료)

[Step 3] useChatReducer.ts 생성
         └── ChatState, ChatAction, chatReducer

[Step 4] ChatContainer.tsx 생성
         ├── useReducer + 2 useEffect
         ├── AbortController SSE
         ├── loadWork(), loadExistingSession(), startChat()
         └── sendMessage()

[Step 5] 서브 컴포넌트 생성 (병렬 가능)
         ├── ChatMessages.tsx
         ├── ChatInput.tsx
         ├── ChatHeader.tsx
         └── OpeningScreen.tsx

[Step 6] ChatCacheContext.tsx 수정
         └── sessionId 키, LRU 제거

[Step 7] layout.tsx 업데이트 + ChatView.tsx 제거

    ↓ 최종 빌드 검증
```

---

## 6. 검증 항목

| 검증 | 방법 | 성공 기준 |
|------|------|----------|
| 빌드 | `npm run build` | 에러 없이 성공 |
| 응답 속도 | 실제 메시지 전송 | 3초 이내 응답 |
| JSON 파싱 | 캐릭터 응답 텍스트 확인 | 빈 content 없음 |
| 캐릭터 기억 | DB에서 CharacterMemory 확인 | 대화 후 기억 레코드 생성 |
| 관계 추적 | DB에서 UserCharacterRelationship 확인 | intimacyScore 변화 |
| 세션 분리 | 같은 작품 3세션 전환 | 각 세션 독립 메시지 |
| SSE 취소 | 전송 중 세션 전환 | 이전 세션 응답 미표시 |
| 세션 요약 | 5턴 대화 후 DB 확인 | sessionSummary 갱신 |
| 기억 감쇠 | 5턴 후 DB strength 확인 | episodic < semantic |
| 캐시 | 세션 전환 후 재방문 | 즉시 로드 |
