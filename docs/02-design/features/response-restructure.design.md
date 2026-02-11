# Design: response-restructure

> Plan 문서: `docs/01-plan/features/response-restructure.plan.md`

## 구현 순서

```
Step 1: gemini.ts — JSON Schema + 프롬프트 변경
Step 2: route.ts — activeCharacters 필터 제거 + turns[] SSE 전송
Step 3: 스튜디오 UI — 초기 등장 캐릭터 체크박스 제거
Step 4: Opening API — initialCharacters 처리 제거
Step 5: 빌드 + 배포 + 테스트
```

---

## Step 1: `src/lib/gemini.ts` 변경

### 1-A. RESPONSE_SCHEMA 변경 (line 104-141)

**현재:**
```typescript
{
  narrator: string,           // 나레이션 1개
  responses: [{               // 캐릭터 응답 배열
    character: string,
    content: string,
    emotion: string,
  }],
  scene: { location, time, presentCharacters }
}
```

**변경:**
```typescript
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    turns: {
      type: Type.ARRAY,
      description: '나레이션과 대사를 교차 배치. 최소 5개 이상.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: '"narrator" 또는 "dialogue"',
          },
          character: {
            type: Type.STRING,
            description: 'dialogue일 때 캐릭터 이름. narrator일 때 빈 문자열.',
          },
          content: {
            type: Type.STRING,
            description: 'narrator: 1-2문장 행동/반응 묘사. dialogue: 대사 1-3문장.',
          },
          emotion: {
            type: Type.STRING,
            description: 'dialogue일 때 표정. narrator일 때 "neutral".',
          },
        },
        required: ['type', 'character', 'content', 'emotion'],
      },
    },
    scene: {
      type: Type.OBJECT,
      properties: {
        location: { type: Type.STRING },
        time: { type: Type.STRING },
        presentCharacters: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: '이 턴 종료 시점에 장면에 있는 모든 캐릭터 이름',
        },
      },
      required: ['location', 'time', 'presentCharacters'],
    },
  },
  required: ['turns', 'scene'],
};
```

### 1-B. StoryResponse 타입 변경 (line 64-80)

**현재:**
```typescript
export interface StoryResponse {
  responses: Array<{ characterId, characterName, content, emotion }>;
  narratorNote: string;
  updatedScene: { location, time, presentCharacters };
}
```

**변경:**
```typescript
export interface StoryTurn {
  type: 'narrator' | 'dialogue';
  characterId: string;
  characterName: string;
  content: string;
  emotion: { primary: string; intensity: number };
}

export interface StoryResponse {
  turns: StoryTurn[];
  updatedScene: { location: string; time: string; presentCharacters: string[] };
}
```

### 1-C. buildSystemInstruction 프롬프트 강화 (line 147-201)

**현재 프롬프트 (line 156-164):**
```
당신은 인터랙티브 스토리 AI입니다.
- 나레이션: 2-4문장, 오감 활용한 분위기 묘사
- 캐릭터 대사: 2-3문장 이상 + 구체적 행동/표정 묘사
...
```

**변경 프롬프트:**
```
당신은 인터랙티브 스토리 AI입니다.
turns 배열에 narrator와 dialogue를 교차 배치하여 드라마처럼 응답하세요.

## 응답 규칙
- turns 배열에 최소 5개 이상의 턴을 생성
- narrator와 dialogue를 번갈아 배치 (narrator → dialogue → narrator → dialogue ...)
- narrator: 캐릭터의 행동, 표정, 물리적 반응 묘사 (1-2문장). 환경 반복 금지.
- dialogue: 캐릭터의 대사 (1-3문장). 대사 안에 *행동묘사* 넣지 말 것.
- 같은 캐릭터가 여러 번 발화 가능 (각각 다른 맥락에서)
- 캐릭터 간 상호작용 필수: 서로에게 반응하고, 의견 충돌하고, 대화하는 장면
- 현재 장면에 없는 캐릭터도 상황에 맞으면 등장시킬 수 있음 (narrator로 등장 묘사 후 dialogue)
- 새 캐릭터 등장 시 외모와 등장 방식을 narrator에서 묘사
- 매 턴 새로운 정보, 이벤트, 또는 긴장감 요소를 1개 이상 도입
- 유저의 발언에 대해 여러 캐릭터가 각자의 관점에서 반응
- 표정: neutral/smile/cold/angry/sad/happy/surprised/embarrassed
```

### 1-D. buildSystemInstruction — 캐릭터 섹션 변경 (line 174-190)

**현재:** `maxLength`로 캐릭터 프롬프트를 잘라서 전달

**변경:** 캐릭터 수에 따른 토큰 예산은 유지하되, "현재 등장 캐릭터"와 "전체 캐릭터"를 구분하지 않음. 모든 캐릭터를 systemInstruction에 포함.
- 기존 로직 그대로 유지 (캐릭터 수에 따라 maxLength 조정)
- 호출 시 `activeCharacters` 대신 `characters` (전체) 전달

### 1-E. generateStoryResponse 파싱 변경 (line 273-416)

**현재:** `parsed.narrator` + `parsed.responses[]` 파싱
**변경:** `parsed.turns[]` 파싱

```typescript
// turns 파싱
const turns: StoryTurn[] = (parsed.turns || [])
  .map((turn: any) => {
    if (turn.type === 'narrator') {
      return {
        type: 'narrator' as const,
        characterId: '',
        characterName: '',
        content: turn.content?.trim() || '',
        emotion: { primary: 'neutral', intensity: 0.5 },
      };
    }
    // dialogue
    const char = characters.find(
      c => c.name === turn.character || c.name.includes(turn.character) || turn.character?.includes(c.name)
    );
    return {
      type: 'dialogue' as const,
      characterId: char?.id || '',
      characterName: turn.character || '',
      content: turn.content?.trim() || '',
      emotion: {
        primary: EXPRESSION_TYPES.includes(turn.emotion) ? turn.emotion : 'neutral',
        intensity: 0.7,
      },
    };
  })
  .filter((t: StoryTurn) => t.content && (t.type === 'narrator' || t.characterId));
```

**폴백 (turns가 비어있을 때):**
```typescript
if (turns.length === 0 && characters.length > 0) {
  turns.push({
    type: 'narrator',
    characterId: '', characterName: '',
    content: '잠시 정적이 흐른다.',
    emotion: { primary: 'neutral', intensity: 0.5 },
  });
  turns.push({
    type: 'dialogue',
    characterId: characters[0].id, characterName: characters[0].name,
    content: '*조용히 당신을 바라본다*',
    emotion: { primary: 'neutral', intensity: 0.5 },
  });
}
```

### 1-F. maxOutputTokens 상향 (line 295)

**현재:** `maxOutputTokens: 2500`
**변경:** `maxOutputTokens: 4000`

turns가 5개 이상이므로 출력 토큰이 더 필요.

### 1-G. Markdown 폴백 파서 (line 422-479)

**현재:** `parseMarkdownFallback` — narrator + responses 파싱
**변경:** turns[] 형식에 맞게 수정. narrator와 character 응답을 turns 배열로 변환.

---

## Step 2: `src/app/api/chat/route.ts` 변경

### 2-A. activeCharacters 필터 제거 (line 253-256)

**현재:**
```typescript
const activeCharacters = characters.filter(c =>
  presentCharacters.includes(c.name) ||
  presentCharacters.some(pc => c.name.includes(pc) || pc.includes(c.name.split(' ')[0]))
);
```

**변경:** 삭제. `characters` (전체)를 직접 사용.

이후 `activeCharacters` → `characters`로 변수명 교체:
- line 270: narrativeContext 빌드 시 `activeCharacters.map` → `characters.map`
- line 287: systemInstruction 빌드 시 `activeCharacters.map` → `characters.map`
- line 310: generateStoryResponse 호출 시 `activeCharacters.map` → `characters.map`

### 2-B. buildContents에 presentCharacters 정보 유지 (기존 그대로)

presentCharacters는 삭제하지 않음. AI에게 "현재 이 캐릭터들이 장면에 있어"라고 알려주는 용도로 유지.
다만 AI가 다른 캐릭터도 등장시킬 수 있음.

### 2-C. SSE 전송 로직 변경 (line 319-337)

**현재:**
```typescript
// 나레이션 1개 저장 + 전송
if (storyResponse.narratorNote) {
  const narratorMsg = await prisma.message.create({ ... narrator ... });
  send('narrator', { id: narratorMsg.id, content: storyResponse.narratorNote });
}
// 캐릭터 응답 병렬 저장 + 순차 전송
const savedResponses = await Promise.all(
  storyResponse.responses.map(r => prisma.message.create({ ... dialogue ... }))
);
for (const message of savedResponses) {
  send('character_response', message);
}
```

**변경:**
```typescript
// turns를 순서대로 저장 + 전송
for (const turn of storyResponse.turns) {
  if (turn.type === 'narrator') {
    const narratorMsg = await prisma.message.create({
      data: { sessionId, characterId: null, content: turn.content, messageType: 'narrator' },
    });
    send('narrator', { id: narratorMsg.id, content: turn.content });
  } else {
    // dialogue
    const savedMsg = await prisma.message.create({
      data: { sessionId, characterId: turn.characterId, content: turn.content, messageType: 'dialogue' },
      include: { character: true },
    });
    send('character_response', savedMsg);
  }
}
```

> SSE 이벤트 타입(`narrator`, `character_response`)은 변경 없음 → 프론트엔드 호환 유지

### 2-D. 세션 생성 시 initialCharacters 제거 (line 112-129)

**현재:**
```typescript
let initialCharacters: string[] = [];
try { ... opening.initialCharacters 파싱 ... } catch {}
if (initialCharacters.length === 0) {
  initialCharacters = allCharacterNames;
}
```

**변경:**
```typescript
const initialCharacters = allCharacterNames; // 항상 전체 캐릭터
```

중간의 initialCharacters 파싱/필터 로직 전부 삭제.

### 2-E. recentEvents + session_update 로직 (line 340-383)

**현재:** `storyResponse.responses[0]`에서 첫 캐릭터 응답 추출
**변경:** `storyResponse.turns`에서 첫 dialogue 턴 추출

```typescript
const firstDialogue = storyResponse.turns.find(t => t.type === 'dialogue');
const firstNarrator = storyResponse.turns.find(t => t.type === 'narrator');
if (firstNarrator) newEvents.push(`[상황] ${firstNarrator.content.substring(0, 60)}...`);
if (firstDialogue) newEvents.push(`${firstDialogue.characterName}: ${firstDialogue.content.substring(0, 40)}...`);
```

### 2-F. narrative-memory processConversation 적응 (line 391-404)

**현재:** `storyResponse.responses` 기반
**변경:** `storyResponse.turns`에서 dialogue만 필터

```typescript
processConversationForMemory({
  sessionId,
  sceneId: activeScene?.sceneId,
  userMessage: content,
  characterResponses: storyResponse.turns
    .filter(t => t.type === 'dialogue')
    .map(t => ({
      characterId: t.characterId,
      characterName: t.characterName,
      content: t.content,
      emotion: t.emotion ? { primary: t.emotion.primary, intensity: t.emotion.intensity } : undefined,
    })),
  emotionalMoment: storyResponse.turns.some(t =>
    t.type === 'dialogue' &&
    ['sad', 'angry', 'surprised', 'happy'].includes(t.emotion.primary) &&
    t.emotion.intensity > 0.7
  ),
})
```

---

## Step 3: 스튜디오 UI 변경 — `src/app/studio/[workId]/page.tsx`

### 3-A. 상태 제거 (line 85)

**삭제:**
```typescript
const [openingCharacters, setOpeningCharacters] = useState<string[]>([]);
```

### 3-B. 모달 열기 시 initialCharacters 파싱 제거 (line 295-312)

```typescript
// 삭제할 부분:
let chars: string[] = [];
try { ... } catch {}
setOpeningCharacters(chars);
```

### 3-C. 저장 시 initialCharacters 전송 제거 (line 352)

**현재:** `initialCharacters: openingCharacters,`
**변경:** 이 필드를 전송하지 않음 (삭제)

### 3-D. UI 체크박스 블록 제거 (line 1150-1196)

"초기 등장 캐릭터" 라벨 + 체크박스 전체 블록 삭제

### 3-E. Opening 목록의 캐릭터 수 표시 제거 (line 878-892)

`👥 ...` 표시 블록 삭제

---

## Step 4: Opening API 변경

### 4-A. `src/app/api/openings/route.ts`

- POST: `initialCharacters` 파라미터 수신/저장 코드 제거
- GET: `initialCharacters` JSON 파싱 코드 제거
- PUT: `initialCharacters` 업데이트 코드 제거

DB 저장 시 `initialCharacters` 필드는 기본값 `"[]"`로 유지 (Prisma 스키마 변경 없이).

### 4-B. `src/app/api/openings/[openingId]/route.ts`

- PUT: `initialCharacters` 처리 코드 제거
- GET 응답: `initialCharacters` 파싱 코드 제거

### 4-C. Prisma Schema — 변경 없음

`Opening.initialCharacters` 필드는 DB에 그대로 둠.
→ 마이그레이션 불필요, 하위 호환 유지.
→ 코드에서만 무시 (읽지도 쓰지도 않음).

---

## Step 5: 빌드 + 배포 + 테스트

1. `npx tsc --noEmit` — 타입 에러 없음 확인
2. `npm run build` — 빌드 성공 확인
3. `git commit` + `git push` + `npx vercel --prod`
4. Vercel에서 테스트:
   - "안녕" → 5+ 블록 교차 응답, 2명 이상 캐릭터 상호작용
   - "죽어도 괜찮아" → 캐릭터 반응 중심 나레이션, 새 정보/이벤트 포함

---

## 변경하지 않는 파일 (명시)

| 파일 | 이유 |
|------|------|
| `useChatReducer.ts` | ChatMessage 타입 변경 없음 |
| `ChatContainer.tsx` | SSE 이벤트 타입 그대로 (narrator/character_response) |
| `ChatMessages.tsx` | narrator/dialogue 렌더링 그대로 (개별 메시지 버블) |
| `ChatCacheContext.tsx` | 캐시 구조 변경 없음 |
| `narrative-memory.ts` | 함수 시그니처 변경 없음 |
| `prompt-builder.ts` | formatConversationHistory 변경 없음 (메시지 타입은 그대로) |
| `prisma/schema.prisma` | DB 마이그레이션 없음 |
