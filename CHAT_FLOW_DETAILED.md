# 🎭 AI 캐릭터 챗 - 상세 흐름 시각화

## 📋 목차
1. [전체 흐름 개요](#전체-흐름-개요)
2. [단계별 상세 설명](#단계별-상세-설명)
3. [데이터 흐름도](#데이터-흐름도)
4. [코드 위치 참조](#코드-위치-참조)

---

## 전체 흐름 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                    👤 사용자 (브라우저)                           │
│  채팅 페이지: src/app/chat/[workId]/page.tsx                    │
└───────────────────────┬─────────────────────────────────────────┘
                        │
                        │ 1️⃣ 사용자가 메시지 입력
                        │    "안녕하세요!"
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  📝 프론트엔드 처리 (sendMessage 함수)    │
        │  파일: src/app/chat/[workId]/page.tsx    │
        │  ─────────────────────────────────────── │
        │  ✓ 입력란 비우기                         │
        │  ✓ 즉시 화면에 임시 메시지 표시          │
        │  ✓ sending 상태 true로 변경              │
        │  ✓ 입력란 자동 포커스                    │
        └───────────────┬───────────────────────────┘
                        │
                        │ 2️⃣ HTTP PUT 요청
                        │    /api/chat
                        │    { sessionId, content: "안녕하세요!" }
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  🔌 API 라우트 (PUT 핸들러)                │
        │  파일: src/app/api/chat/route.ts          │
        │  ─────────────────────────────────────── │
        │  ✓ 요청 데이터 검증                       │
        │  ✓ 세션 정보 DB에서 조회                  │
        │    - 작품 정보 (캐릭터, 로어북)           │
        │    - 메시지 히스토리 (최근 30개)          │
        │    - 장면 상태 (장소, 시간, 캐릭터)      │
        └───────────────┬───────────────────────────┘
                        │
                        │ 3️⃣ 유저 메시지 DB 저장
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  📚 컨텍스트 수집                         │
        │  ─────────────────────────────────────── │
        │  ✓ 대화 히스토리 포맷팅                   │
        │    (최근 30개 메시지)                     │
        │  ✓ 로어북 필터링                          │
        │    - 키워드 매칭                          │
        │    - 친밀도 조건                          │
        │    - 턴 수 조건                           │
        │    - 동석 캐릭터 조건                     │
        │  ✓ 장면 상태 수집                        │
        │    (장소, 시간, 등장 캐릭터, 최근 사건)   │
        └───────────────┬───────────────────────────┘
                        │
                        │ 4️⃣ AI 프롬프트 생성
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  🤖 Gemini API 호출                       │
        │  파일: src/lib/gemini.ts                  │
        │  ─────────────────────────────────────── │
        │  ✓ Rate Limit 대기 (3초 간격)             │
        │  ✓ 시스템 프롬프트 생성                   │
        │  ✓ Gemini API 호출                       │
        │  ✓ 응답 파싱 (JSON)                       │
        │  ✓ 재시도 로직 (최대 3번)                 │
        └───────────────┬───────────────────────────┘
                        │
                        │ 5️⃣ 응답 처리
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  💾 DB 저장                               │
        │  ─────────────────────────────────────── │
        │  ✓ 나레이션 메시지 저장                   │
        │  ✓ 캐릭터 응답들 저장                     │
        │  ✓ 세션 상태 업데이트                     │
        │    - 턴 수 증가                            │
        │    - 친밀도 증가                           │
        │    - 장면 상태 업데이트                    │
        └───────────────┬───────────────────────────┘
                        │
                        │ 6️⃣ 응답 반환
                        │
                        ▼
        ┌───────────────────────────────────────────┐
        │  🎨 프론트엔드 업데이트                    │
        │  ─────────────────────────────────────── │
        │  ✓ 임시 메시지 제거                       │
        │  ✓ 실제 메시지들 추가                     │
        │    - 유저 메시지                           │
        │    - 나레이션                              │
        │    - 캐릭터 응답들                         │
        │  ✓ 스크롤 자동 이동                       │
        │  ✓ 입력란 자동 포커스                     │
        └───────────────────────────────────────────┘
```

---

## 단계별 상세 설명

### 1️⃣ 사용자 입력 및 즉시 표시

**위치**: `src/app/chat/[workId]/page.tsx` (158-179줄)

**처리 순서**:
```typescript
1. 입력 검증
   - session 존재 확인
   - 메시지 내용 확인 (trim)
   - 이미 전송 중이면 중단

2. 즉시 UI 업데이트
   - 입력란 비우기
   - sending 상태 true로 변경
   - 임시 메시지 생성 및 표시
   - 입력란 자동 포커스
```

**코드 흐름**:
```typescript
const sendMessage = async () => {
  // 1. 검증
  if (!session || !inputMessage.trim() || sending) return;
  
  const userMessage = inputMessage.trim();
  setInputMessage('');  // 입력란 비우기
  setSending(true);     // 전송 중 상태
  
  // 2. 즉시 화면에 임시 메시지 표시
  const tempUserMessage: Message = {
    id: `temp-${Date.now()}`,
    content: userMessage,
    messageType: 'user',
    ...
  };
  setMessages((prev) => [...prev, tempUserMessage]);
  
  // 3. 서버로 전송
  const response = await fetch('/api/chat', { ... });
}
```

**시각화**:
```
사용자 입력: "안녕하세요!"
         ↓
[입력란 비우기] → [임시 메시지 표시] → [서버 전송]
```

---

### 2️⃣ API 라우트 - 요청 처리

**위치**: `src/app/api/chat/route.ts` (157-211줄)

**처리 순서**:
```typescript
1. 요청 데이터 검증
   - sessionId 확인
   - content 확인

2. 세션 정보 조회 (DB)
   - ChatSession 조회
   - Work 정보 (characters, lorebook)
   - Messages 조회 (최근 30개)

3. 유저 메시지 DB 저장
   - Message 생성
   - messageType: 'user'
```

**코드 흐름**:
```typescript
export async function PUT(request: NextRequest) {
  // 1. 요청 데이터 추출
  const { sessionId, content } = await request.json();
  
  // 2. 세션 조회 (관계 데이터 포함)
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      work: {
        include: {
          characters: true,  // 캐릭터 정보
          lorebook: true,    // 로어북 정보
        },
      },
      messages: {
        include: { character: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  
  // 3. 유저 메시지 저장
  const userMessage = await prisma.message.create({
    data: {
      sessionId,
      characterId: null,  // null = 유저 메시지
      content,
      messageType: 'user',
    },
  });
}
```

**시각화**:
```
HTTP PUT /api/chat
{ sessionId: "abc123", content: "안녕하세요!" }
         ↓
[요청 검증] → [DB 조회] → [메시지 저장]
         ↓
세션 정보:
- 캐릭터: [아셀, 리아, 카이]
- 로어북: [항목1, 항목2, ...]
- 메시지: [최근 30개]
```

---

### 3️⃣ 컨텍스트 수집

**위치**: `src/app/api/chat/route.ts` (213-236줄)

**처리 순서**:
```typescript
1. 대화 히스토리 포맷팅
   - 최근 30개 메시지
   - 형식: "캐릭터명: 내용" 또는 "유저명: 내용"

2. 로어북 필터링
   - 최근 6개 메시지 + 현재 메시지에서 키워드 검색
   - 조건 확인:
     * 키워드 매칭
     * 친밀도 조건
     * 턴 수 조건
     * 동석 캐릭터 조건
   - 우선순위 정렬
   - 최대 5개만 선택

3. 장면 상태 수집
   - 현재 장소
   - 현재 시간
   - 등장 캐릭터 목록
   - 최근 사건들 (최대 10개)
```

**코드 흐름**:
```typescript
// 1. 대화 히스토리 포맷팅
const conversationHistory = formatConversationHistory(
  session.messages,  // 모든 메시지
  session.userName,
  30  // 최대 30개
);
// 결과: "유저: 안녕하세요!\n\n아셀: *고개를 숙이며* 안녕하세요!"

// 2. 로어북 컨텍스트 구성
const recentText = session.messages
  .slice(-6)  // 최근 6개 메시지
  .map((m) => m.content)
  .join(' ') + ' ' + content;  // + 현재 메시지

const lorebookContext = filterActiveLorebookEntries(
  session.work.lorebook,
  recentText,           // 키워드 검색 대상
  session.intimacy,     // 친밀도 조건
  session.turnCount,    // 턴 수 조건
  presentCharacters     // 동석 캐릭터 조건
);
// 결과: 활성화된 로어북 항목들의 내용 (최대 5개)

// 3. 장면 상태
const sceneState = {
  location: session.currentLocation,      // "베타 동 로비"
  time: session.currentTime,              // "오후"
  presentCharacters: ["아셀", "리아"],   // 현재 있는 캐릭터들
  recentEvents: ["유저: 안녕하세요!"]     // 최근 사건들
};
```

**시각화**:
```
대화 히스토리 (최근 30개):
─────────────────────────────
유저: 안녕하세요!
아셀: *고개를 숙이며* 안녕하세요!
유저: 오늘 날씨가 좋네요
─────────────────────────────

로어북 필터링:
최근 텍스트: "... 날씨가 좋네요"
         ↓
키워드 검색: "날씨" 발견
         ↓
조건 확인:
✓ 키워드 매칭: "날씨"
✓ 친밀도: 0.5 >= 0.3 ✓
✓ 턴 수: 5 >= 3 ✓
✓ 동석 캐릭터: "아셀" 있음 ✓
         ↓
활성화된 로어북: "베타 동 날씨 정보"

장면 상태:
- 장소: 베타 동 로비
- 시간: 오후
- 등장 캐릭터: [아셀, 리아]
- 최근 사건: [유저: 안녕하세요!]
```

---

### 4️⃣ AI 프롬프트 생성 및 호출

**위치**: `src/lib/gemini.ts` (88-189줄)

**처리 순서**:
```typescript
1. Rate Limit 대기
   - 최소 3초 간격 유지
   - 전역 변수로 마지막 요청 시간 추적

2. 캐릭터 정보 정리
   - 각 캐릭터 프롬프트 (최대 1500자)
   - 형식: "### 캐릭터명\n프롬프트 내용"

3. 시스템 프롬프트 생성
   - 3단계 시퀀스 규칙
   - 등장인물 정보
   - 현재 상황
   - 배경 정보 (로어북)
   - 이전 대화
   - 유저의 현재 행동

4. Gemini API 호출
   - generateContent() 호출
   - 재시도 로직 (최대 3번)
   - 에러 처리
```

**프롬프트 구조**:
```
당신은 유저의 상상을 현실로 시각화하는 '공감각적 비주얼 노벨 작가'입니다.

## [3단계 시퀀스 규칙]
1. [Step 1: Re-Narration] (narrator 필드)
   - 유저의 행동을 영화적 기법으로 확장
   - 공감각적 묘사 (시각, 청각, 촉각 등)

2. [Step 2: Character Dialogue] (responses[].content 내 대사)
   - 캐릭터의 고유한 말투로 응답

3. [Step 3: Character Action] (responses[].content 내 *별표* 묘사)
   - 대사 직후 행동이나 표정 변화 묘사

## 설정 및 상황
[세계관]: ...
[등장인물]: 
### 아셀
[아셀의 프롬프트...]

### 리아
[리아의 프롬프트...]

[현재 장소/시간]: 베타 동 로비 / 오후
[최근 사건]: 유저: 안녕하세요!
[배경 정보]: [활성화된 로어북 내용]

## 이전 대화
유저: 안녕하세요!
아셀: *고개를 숙이며* 안녕하세요!

## 유저(유저)의 현재 행동
오늘 날씨가 좋네요

## 출력 형식 (JSON Only)
{
  "narrator": "Step 1: 공감각적 묘사",
  "responses": [
    { "character": "캐릭터명", "content": "\"대사\" *행동*" }
  ],
  "scene_update": { "location": "...", "time": "...", "present_characters": [...] }
}
```

**코드 흐름**:
```typescript
// 1. Rate Limit 대기
await waitForRateLimit();  // 최소 3초 간격

// 2. 캐릭터 정보 정리
const characterDescriptions = characters
  .map((char) => {
    const shortPrompt = char.prompt.length > 1500
      ? char.prompt.substring(0, 1500) + '...'
      : char.prompt;
    return `### ${char.name}\n${shortPrompt}`;
  })
  .join('\n\n');

// 3. 시스템 프롬프트 생성
const systemPrompt = `당신은 유저의 상상을 현실로 시각화하는...
[등장인물]: ${characterDescriptions}
[현재 장소/시간]: ${sceneState.location} / ${sceneState.time}
[배경 정보]: ${lorebookContext}
## 이전 대화
${conversationHistory}
## 유저(${userName})의 현재 행동
${userMessage}
...`;

// 4. API 호출 (재시도 로직 포함)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    if (attempt > 1) {
      await waitForRateLimit();  // 재시도 전에도 대기
    }
    
    const result = await geminiModel.generateContent(systemPrompt);
    const response = await result.response;
    const text = response.text();
    
    // JSON 파싱
    const parsed = extractAndParseJSON(text);
    return parsed;
  } catch (error) {
    // 에러 처리 및 재시도
  }
}
```

**시각화**:
```
Rate Limit 대기 (3초)
         ↓
프롬프트 생성:
─────────────────────────────
[시스템 지시]
[캐릭터 정보]
[현재 상황]
[로어북 정보]
[대화 히스토리]
[유저 메시지]
─────────────────────────────
         ↓
Gemini API 호출
         ↓
응답 받기:
{
  "narrator": "...",
  "responses": [...],
  "scene_update": {...}
}
```

---

### 5️⃣ 응답 처리 및 파싱

**위치**: `src/lib/gemini.ts` (189-285줄)

**처리 순서**:
```typescript
1. 응답 상태 확인
   - candidates 확인
   - finishReason 확인 (SAFETY, RECITATION 등)
   - Safety Filter 차단 확인

2. 텍스트 추출
   - response.text() 호출
   - 빈 응답 체크

3. JSON 파싱
   - 마크다운 코드 블록 제거
   - JSON 추출
   - 파싱

4. 캐릭터 ID 매핑
   - AI가 반환한 캐릭터 이름 → 실제 캐릭터 ID
   - 이름 매칭 (대소문자 무시, 부분 매칭)

5. 응답 검증
   - 응답이 없으면 기본 응답 사용
```

**코드 흐름**:
```typescript
// 1. 응답 상태 확인
const candidates = response.candidates;
if (!candidates || candidates.length === 0) {
  throw new Error('NO_CANDIDATES');
}

const finishReason = candidates[0].finishReason;
if (finishReason === 'SAFETY') {
  throw new Error('SAFETY_BLOCKED');
}

// 2. 텍스트 추출
const text = response.text().trim();

// 3. JSON 파싱
const parsed = extractAndParseJSON(text);
// {
//   narrator: "...",
//   responses: [
//     { character: "아셀", content: "..." }
//   ],
//   scene_update: { ... }
// }

// 4. 캐릭터 ID 매핑
const responseWithIds = parsed.responses.map((r) => {
  const char = characters.find(
    (c) => c.name === r.character ||
           c.name.includes(r.character) ||
           r.character.includes(c.name) ||
           c.name.toLowerCase() === r.character.toLowerCase()
  );
  
  return {
    characterId: char?.id || '',
    characterName: r.character,
    content: r.content,
  };
}).filter((r) => r.characterId);

// 5. 응답 검증
if (responseWithIds.length === 0 && characters.length > 0) {
  // 기본 응답 사용
  responseWithIds.push({
    characterId: characters[0].id,
    characterName: characters[0].name,
    content: '*조용히 당신을 바라본다*',
  });
}
```

**시각화**:
```
AI 응답 (JSON):
{
  "narrator": "밝은 햇살이 창문을 통해 들어온다",
  "responses": [
    { "character": "아셀", "content": "*창밖을 바라보며* 정말 좋은 날씨네요." }
  ],
  "scene_update": {
    "location": "베타 동 로비",
    "time": "오후",
    "present_characters": ["아셀"]
  }
}
         ↓
캐릭터 ID 매핑:
"아셀" → characters.find(c => c.name === "아셀")
         ↓
최종 응답:
{
  narrator: "...",
  responses: [
    {
      characterId: "아셀의 UUID",
      characterName: "아셀",
      content: "..."
    }
  ],
  updatedScene: { ... }
}
```

---

### 6️⃣ DB 저장

**위치**: `src/app/api/chat/route.ts` (269-313줄)

**처리 순서**:
```typescript
1. 나레이션 저장 (있는 경우)
   - Message 생성
   - messageType: 'narrator'
   - characterId: null

2. 캐릭터 응답들 저장
   - 각 응답마다 Message 생성
   - messageType: 'dialogue'
   - characterId: 캐릭터 ID
   - Promise.all로 병렬 처리

3. 세션 상태 업데이트
   - turnCount 증가
   - intimacy 증가 (최대 10)
   - 장면 상태 업데이트
   - recentEvents 업데이트 (최대 10개)
```

**코드 흐름**:
```typescript
// 1. 나레이션 저장
if (storyResponse.narratorNote) {
  await prisma.message.create({
    data: {
      sessionId,
      characterId: null,
      content: storyResponse.narratorNote,
      messageType: 'narrator',
    },
  });
}

// 2. 캐릭터 응답들 저장 (병렬 처리)
const savedResponses = await Promise.all(
  storyResponse.responses.map(async (response) => {
    const message = await prisma.message.create({
      data: {
        sessionId,
        characterId: response.characterId,
        content: response.content,
        messageType: 'dialogue',
      },
      include: { character: true },
    });
    return message;
  })
);

// 3. 세션 업데이트
const updatedSession = await prisma.chatSession.update({
  where: { id: sessionId },
  data: {
    turnCount: session.turnCount + 1,           // 턴 수 증가
    intimacy: Math.min(session.intimacy + 0.1, 10),  // 친밀도 증가
    currentLocation: storyResponse.updatedScene.location,
    currentTime: storyResponse.updatedScene.time,
    presentCharacters: JSON.stringify(storyResponse.updatedScene.presentCharacters),
    recentEvents: JSON.stringify(
      [...recentEvents, `${session.userName}: ${content.substring(0, 50)}`].slice(-10)
    ),
  },
});
```

**시각화**:
```
DB 저장 순서:
─────────────────────────────
1. 나레이션 메시지
   Message {
     id: "...",
     content: "밝은 햇살이...",
     messageType: "narrator"
   }

2. 캐릭터 응답들 (병렬)
   Message {
     id: "...",
     characterId: "아셀의 UUID",
     content: "*창밖을 바라보며*...",
     messageType: "dialogue"
   }

3. 세션 업데이트
   ChatSession {
     turnCount: 5 → 6
     intimacy: 0.5 → 0.6
     currentLocation: "베타 동 로비"
     presentCharacters: ["아셀"]
     recentEvents: [..., "유저: 오늘 날씨가 좋네요"]
   }
─────────────────────────────
```

---

### 7️⃣ 프론트엔드 업데이트

**위치**: `src/app/chat/[workId]/page.tsx` (197-247줄)

**처리 순서**:
```typescript
1. 응답 데이터 받기
   - userMessage
   - narratorNote
   - characterResponses
   - session

2. 새 메시지들 구성
   - 유저 메시지
   - 나레이션 메시지
   - 캐릭터 응답들

3. 화면 업데이트
   - 임시 메시지 제거
   - 실제 메시지들 추가
   - 세션 상태 업데이트

4. UI 효과
   - 스크롤 자동 이동
   - 입력란 자동 포커스
```

**코드 흐름**:
```typescript
const data = await response.json();

// 1. 새 메시지들 구성
const newMessages: Message[] = [];

// 유저 메시지
if (data.userMessage) {
  newMessages.push({
    ...data.userMessage,
    messageType: 'user',
  });
}

// 나레이터 메시지
if (data.narratorNote) {
  newMessages.push({
    id: `narrator-${Date.now()}`,
    characterId: null,
    content: data.narratorNote,
    messageType: 'narrator',
    ...
  });
}

// 캐릭터 응답들
if (data.characterResponses) {
  newMessages.push(...data.characterResponses.map((r) => ({
    ...r,
    messageType: 'dialogue',
  })));
}

// 2. 화면 업데이트
setMessages((prev) => [
  ...prev.filter((m) => m.id !== tempUserMessage.id),  // 임시 메시지 제거
  ...newMessages,  // 새 메시지들 추가
]);

// 3. 세션 업데이트
if (data.session) {
  setSession(data.session);
}

// 4. UI 효과
setTimeout(() => {
  inputRef.current?.focus();  // 입력란 포커스
}, 100);
```

**시각화**:
```
서버 응답:
{
  userMessage: { id: "...", content: "오늘 날씨가 좋네요" },
  narratorNote: "밝은 햇살이...",
  characterResponses: [
    { id: "...", character: { name: "아셀" }, content: "..." }
  ],
  session: { turnCount: 6, ... }
}
         ↓
메시지 배열 구성:
[
  { type: "user", content: "오늘 날씨가 좋네요" },
  { type: "narrator", content: "밝은 햇살이..." },
  { type: "dialogue", character: "아셀", content: "..." }
]
         ↓
화면 업데이트:
- 임시 메시지 제거
- 새 메시지들 추가
- 스크롤 이동
- 포커스 설정
```

---

## 데이터 흐름도

### 전체 데이터 흐름

```
┌──────────────┐
│   사용자 입력  │
│  "안녕하세요!" │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  프론트엔드 (React)                                          │
│  ────────────────────────────────────────────────────────── │
│  1. 입력 검증                                                │
│  2. 임시 메시지 표시                                         │
│  3. HTTP PUT /api/chat                                       │
│     { sessionId, content }                                   │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Next.js API Route                                           │
│  ────────────────────────────────────────────────────────── │
│  1. 세션 조회 (DB)                                           │
│     - ChatSession                                            │
│     - Work (characters, lorebook)                           │
│     - Messages (최근 30개)                                   │
│                                                              │
│  2. 유저 메시지 저장 (DB)                                    │
│                                                              │
│  3. 컨텍스트 수집                                            │
│     - 대화 히스토리 포맷팅                                    │
│     - 로어북 필터링                                           │
│     - 장면 상태 수집                                          │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Gemini API 호출                                             │
│  ────────────────────────────────────────────────────────── │
│  1. Rate Limit 대기 (3초)                                    │
│                                                              │
│  2. 프롬프트 생성                                            │
│     - 시스템 지시                                             │
│     - 캐릭터 정보                                             │
│     - 현재 상황                                               │
│     - 로어북 정보                                             │
│     - 대화 히스토리                                           │
│     - 유저 메시지                                             │
│                                                              │
│  3. API 호출                                                 │
│     - generateContent()                                      │
│     - 재시도 로직 (최대 3번)                                 │
│                                                              │
│  4. 응답 처리                                                │
│     - JSON 파싱                                               │
│     - 캐릭터 ID 매핑                                          │
│     - 응답 검증                                               │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  DB 저장                                                      │
│  ────────────────────────────────────────────────────────── │
│  1. 나레이션 메시지 저장                                      │
│  2. 캐릭터 응답들 저장 (병렬)                                │
│  3. 세션 상태 업데이트                                        │
│     - turnCount 증가                                          │
│     - intimacy 증가                                           │
│     - 장면 상태 업데이트                                      │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  응답 반환                                                    │
│  ────────────────────────────────────────────────────────── │
│  {                                                            │
│    userMessage: {...},                                        │
│    narratorNote: "...",                                        │
│    characterResponses: [...],                                 │
│    session: {...}                                             │
│  }                                                            │
└──────┬──────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  프론트엔드 업데이트                                          │
│  ────────────────────────────────────────────────────────── │
│  1. 임시 메시지 제거                                          │
│  2. 새 메시지들 추가                                          │
│  3. 세션 상태 업데이트                                        │
│  4. 스크롤 이동                                               │
│  5. 입력란 포커스                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 코드 위치 참조

### 주요 파일 및 함수

| 단계 | 파일 | 함수/라우트 | 줄 번호 |
|------|------|------------|---------|
| 1. 사용자 입력 | `src/app/chat/[workId]/page.tsx` | `sendMessage()` | 158-277 |
| 2. API 라우트 | `src/app/api/chat/route.ts` | `PUT()` | 157-345 |
| 3. 컨텍스트 수집 | `src/app/api/chat/route.ts` | `formatConversationHistory()`<br>`filterActiveLorebookEntries()` | 6-31<br>34-71 |
| 4. AI 호출 | `src/lib/gemini.ts` | `generateStoryResponse()` | 90-552 |
| 5. 응답 처리 | `src/lib/gemini.ts` | `extractAndParseJSON()`<br>캐릭터 ID 매핑 | 37-66<br>247-275 |
| 6. DB 저장 | `src/app/api/chat/route.ts` | `prisma.message.create()`<br>`prisma.chatSession.update()` | 269-313 |
| 7. 화면 업데이트 | `src/app/chat/[workId]/page.tsx` | `setMessages()`<br>`setSession()` | 235-242 |

---

## 핵심 포인트

### 1. 즉시 피드백
- 사용자가 메시지를 보내면 **즉시 화면에 표시**됨 (임시 메시지)
- 서버 응답을 기다리지 않아도 사용자는 즉시 피드백을 받음

### 2. 맥락 유지
- **최근 30개 메시지**를 AI에게 전달
- **장면 상태** (장소, 시간, 등장 캐릭터) 추적
- **최근 사건들** (최대 10개) 추적

### 3. 동적 정보 주입
- **로어북 시스템**: 키워드 기반으로 관련 배경 정보 자동 활성화
- 조건부 활성화: 친밀도, 턴 수, 동석 캐릭터 조건

### 4. 멀티 캐릭터 지원
- 여러 캐릭터가 **한 번의 API 호출**로 모두 응답
- AI가 상황에 맞는 캐릭터들만 선택하여 응답 생성

### 5. 에러 처리
- **자동 재시도**: 최대 3번 재시도
- **Rate Limit 대응**: 429 에러 시 자동 대기 후 재시도
- **에러 타입별 처리**: 각 에러 타입에 맞는 처리

### 6. 성능 최적화
- **병렬 처리**: 캐릭터 응답들을 병렬로 저장
- **Rate Limit 관리**: 요청 간격 제어로 API 한도 준수
- **효율적인 DB 쿼리**: 필요한 데이터만 조회

---

## 실제 예시 시나리오

### 시나리오: "안녕하세요!" 메시지 전송

```
[사용자 입력]
"안녕하세요!"
         ↓
[프론트엔드]
1. 입력란 비우기
2. 임시 메시지 표시: "안녕하세요!"
3. HTTP PUT /api/chat
         ↓
[API 라우트]
1. 세션 조회
   - 캐릭터: [아셀, 리아, 카이]
   - 메시지: [이전 대화들...]
   - 장면: { location: "베타 동 로비", time: "오후" }
2. 유저 메시지 저장
3. 컨텍스트 수집
   - 대화 히스토리: "유저: 안녕하세요!"
   - 로어북: [] (키워드 없음)
         ↓
[Gemini API]
1. Rate Limit 대기 (3초)
2. 프롬프트 생성:
   "당신은 공감각적 비주얼 노벨 작가입니다...
   [등장인물]: 아셀, 리아, 카이
   [현재 상황]: 베타 동 로비 / 오후
   [이전 대화]: (이야기 시작)
   [유저 행동]: 안녕하세요!"
3. API 호출
4. 응답 받기:
   {
     "narrator": "밝은 햇살이 창문을 통해 들어온다",
     "responses": [
       { "character": "아셀", "content": "*고개를 숙이며* 안녕하세요!" }
     ],
     "scene_update": { ... }
   }
         ↓
[DB 저장]
1. 나레이션: "밝은 햇살이..."
2. 아셀 응답: "*고개를 숙이며* 안녕하세요!"
3. 세션 업데이트:
   - turnCount: 0 → 1
   - intimacy: 0 → 0.1
         ↓
[프론트엔드]
1. 임시 메시지 제거
2. 새 메시지들 추가:
   - 유저: "안녕하세요!"
   - 나레이션: "밝은 햇살이..."
   - 아셀: "*고개를 숙이며* 안녕하세요!"
3. 스크롤 이동
4. 입력란 포커스
```

---

이 문서는 실제 코드를 기반으로 작성되었으며, 각 단계에서 일어나는 일을 상세히 설명합니다! 🎉
