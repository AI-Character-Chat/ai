# 🎭 AI 캐릭터 챗 시스템 - 채팅 로직 흐름 설명서

## 📋 목차
1. [전체 흐름 개요](#전체-흐름-개요)
2. [단계별 상세 설명](#단계별-상세-설명)
3. [데이터 흐름도](#데이터-흐름도)
4. [핵심 개념 설명](#핵심-개념-설명)

---

## 전체 흐름 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 (브라우저)                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  1. 채팅 시작 (POST 요청)      │
        │  - 작품 선택                  │
        │  - 오프닝 선택                │
        │  - 유저 이름 입력              │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  2. 채팅 세션 생성 (서버)       │
        │  - DB에 세션 저장              │
        │  - 오프닝 메시지 저장          │
        │  - 초기 장면 상태 설정         │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  3. 사용자 메시지 입력         │
        │  - 텍스트 입력                │
        │  - Enter 키 또는 전송 버튼     │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  4. 메시지 전송 (PUT 요청)     │
        │  - 세션 ID + 메시지 내용       │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  5. 서버 처리 (API Route)       │
        │  - 유저 메시지 DB 저장          │
        │  - 대화 히스토리 수집          │
        │  - 로어북 정보 필터링          │
        │  - 장면 상태 확인              │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  6. AI 프롬프트 생성           │
        │  - 캐릭터 정보                 │
        │  - 대화 히스토리               │
        │  - 현재 상황                   │
        │  - 로어북 정보                 │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  7. Gemini API 호출            │
        │  - AI에게 프롬프트 전송        │
        │  - JSON 형식 응답 받기         │
        │  - 재시도 로직 (최대 3번)      │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  8. 응답 처리                  │
        │  - JSON 파싱                   │
        │  - 캐릭터 ID 매핑              │
        │  - 나레이션 추출               │
        │  - 장면 업데이트               │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  9. DB 저장                    │
        │  - 나레이션 메시지 저장         │
        │  - 캐릭터 응답들 저장           │
        │  - 세션 상태 업데이트           │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  10. 클라이언트에 응답 전송     │
        │  - 유저 메시지                 │
        │  - 나레이션                    │
        │  - 캐릭터 응답들               │
        │  - 업데이트된 세션 정보         │
        └───────────────┬───────────────┘
                        │
                        ▼
        ┌───────────────────────────────┐
        │  11. 화면 업데이트             │
        │  - 메시지 표시                 │
        │  - 스크롤 자동 이동             │
        │  - 입력란 자동 포커스          │
        └───────────────────────────────┘
```

---

## 단계별 상세 설명

### 1️⃣ 채팅 시작 (POST /api/chat)

**사용자 행동:**
- 작품 선택
- 오프닝 선택 (여러 개일 경우)
- 유저 이름 입력
- "대화 시작하기" 버튼 클릭

**서버 처리:**
```javascript
// 1. 작품 정보 조회
const work = await prisma.work.findUnique({
  include: { characters, openings }
});

// 2. 새 채팅 세션 생성
const session = await prisma.chatSession.create({
  data: {
    workId,
    userName,
    intimacy: 0,
    turnCount: 0,
    currentLocation: "베타 동 로비",
    currentTime: "오후",
    presentCharacters: ["아셀", "다른 캐릭터들..."]
  }
});

// 3. 오프닝 메시지 저장
await prisma.message.create({
  content: opening.content,
  messageType: 'system'
});
```

**결과:**
- 채팅 세션이 생성됨
- 오프닝 메시지가 표시됨
- 입력란에 자동 포커스

---

### 2️⃣ 메시지 전송 (PUT /api/chat)

**사용자 행동:**
- 메시지 입력 (예: "안녕하세요!")
- Enter 키 또는 전송 버튼 클릭

**클라이언트 처리:**
```javascript
// 1. 즉시 화면에 유저 메시지 표시 (임시)
setMessages([...prev, tempUserMessage]);

// 2. 서버에 전송
fetch('/api/chat', {
  method: 'PUT',
  body: JSON.stringify({
    sessionId: session.id,
    content: "안녕하세요!"
  })
});
```

---

### 3️⃣ 서버 처리 (API Route)

**단계 1: 세션 정보 조회**
```javascript
const session = await prisma.chatSession.findUnique({
  include: {
    work: { characters, lorebook },
    messages: { character: true }
  }
});
```

**단계 2: 유저 메시지 저장**
```javascript
const userMessage = await prisma.message.create({
  sessionId,
  content: "안녕하세요!",
  messageType: 'user'
});
```

**단계 3: 대화 히스토리 수집**
```javascript
// 최근 30개 메시지만 사용 (너무 길면 안 됨)
const conversationHistory = formatConversationHistory(
  session.messages,  // DB에서 가져온 모든 메시지
  session.userName,
  30  // 최대 30개
);

// 결과 예시:
// "유저: 안녕하세요!
// 아셀: *고개를 숙이며* 안녕하세요!
// 유저: 오늘 날씨가 좋네요"
```

**단계 4: 로어북 필터링**
```javascript
// 최근 대화에서 키워드 검색
const recentText = "안녕하세요! 오늘 날씨가 좋네요";

// 로어북 항목 중에서:
// 1. 키워드가 매칭되는 것
// 2. 친밀도 조건 충족
// 3. 턴 수 조건 충족
// 4. 필요한 캐릭터가 있는 것
// → 이 조건들을 만족하는 로어북만 활성화

const lorebookContext = filterActiveLorebookEntries(
  session.work.lorebook,
  recentText,
  session.intimacy,      // 현재 친밀도
  session.turnCount,     // 현재 턴 수
  presentCharacters      // 현재 장면의 캐릭터들
);
```

**단계 5: 장면 상태 확인**
```javascript
const sceneState = {
  location: session.currentLocation,      // "베타 동 로비"
  time: session.currentTime,               // "오후"
  presentCharacters: ["아셀", "..."],     // 현재 있는 캐릭터들
  recentEvents: ["유저: 안녕하세요!"]      // 최근 사건들
};
```

---

### 4️⃣ AI 프롬프트 생성

**프롬프트 구조:**
```
당신은 인터랙티브 소설의 스토리텔러입니다.

## 등장 캐릭터
### 아셀
[아셀의 캐릭터 프롬프트 내용...]

### 다른 캐릭터
[다른 캐릭터의 프롬프트...]

## 현재 상황
- 장소: 베타 동 로비
- 시간: 오후
- 등장 캐릭터: 아셀, 다른 캐릭터
- 최근 사건: 유저: 안녕하세요!

## 배경 정보
[활성화된 로어북 내용...]

## 규칙
1. 각 캐릭터는 자신의 성격과 말투를 유지합니다.
2. 유저의 대사나 행동을 대신 작성하지 마세요.
3. 모든 캐릭터가 반드시 응답할 필요는 없습니다.
4. 행동 묘사는 *별표*로 감싸세요.

## 지금까지의 대화
유저: 안녕하세요!
아셀: *고개를 숙이며* 안녕하세요!

## 유저의 행동
유저: 오늘 날씨가 좋네요

## 응답 형식 (JSON으로만 응답)
{
  "narrator": "간단한 상황 묘사",
  "responses": [
    {"character": "아셀", "content": "대사와 *행동*"}
  ],
  "scene_update": {
    "location": "베타 동 로비",
    "time": "오후",
    "present_characters": ["아셀"]
  }
}
```

---

### 5️⃣ Gemini API 호출

**호출 과정:**
```javascript
// 1. API 호출 (최대 3번 재시도)
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const result = await geminiModel.generateContent(systemPrompt);
    const text = result.response.text();
    
    // 2. JSON 파싱
    const parsed = JSON.parse(text);
    
    // 3. 성공 시 반환
    return parsed;
  } catch (error) {
    // 에러 타입별 처리
    if (429 에러) {
      // Rate Limit → 대기 후 재시도
      await delay(2초 * attempt);
      continue;
    }
    if (JSON 파싱 에러) {
      // 재시도
      continue;
    }
    // 그 외 에러는 중단
    break;
  }
}
```

**AI 응답 예시:**
```json
{
  "narrator": "밝은 햇살이 창문을 통해 들어온다",
  "responses": [
    {
      "character": "아셀",
      "content": "*창밖을 바라보며* 정말 좋은 날씨네요. 산책하기 좋을 것 같아요."
    }
  ],
  "scene_update": {
    "location": "베타 동 로비",
    "time": "오후",
    "present_characters": ["아셀"]
  }
}
```

---

### 6️⃣ 응답 처리

**단계 1: JSON 파싱**
```javascript
const parsed = extractAndParseJSON(text);
// → JSON 객체로 변환
```

**단계 2: 캐릭터 ID 매핑**
```javascript
// AI가 반환한 캐릭터 이름 → 실제 캐릭터 ID로 변환
responses.map(response => {
  const char = characters.find(c => c.name === response.character);
  return {
    characterId: char.id,  // DB에 저장할 ID
    characterName: response.character,
    content: response.content
  };
});
```

**단계 3: 응답 검증**
```javascript
// 응답이 없으면 기본 응답 사용
if (responses.length === 0) {
  responses.push({
    characterId: characters[0].id,
    characterName: characters[0].name,
    content: "*조용히 당신을 바라본다*"
  });
}
```

---

### 7️⃣ DB 저장

**단계 1: 나레이션 저장**
```javascript
if (narratorNote) {
  await prisma.message.create({
    sessionId,
    content: narratorNote,
    messageType: 'narrator'
  });
}
```

**단계 2: 캐릭터 응답들 저장**
```javascript
await Promise.all(
  responses.map(response =>
    prisma.message.create({
      sessionId,
      characterId: response.characterId,
      content: response.content,
      messageType: 'dialogue'
    })
  )
);
```

**단계 3: 세션 업데이트**
```javascript
await prisma.chatSession.update({
  where: { id: sessionId },
  data: {
    turnCount: session.turnCount + 1,  // 턴 수 증가
    intimacy: Math.min(session.intimacy + 0.1, 10),  // 친밀도 증가
    currentLocation: updatedScene.location,  // 장소 업데이트
    currentTime: updatedScene.time,  // 시간 업데이트
    presentCharacters: JSON.stringify(updatedScene.presentCharacters)
  }
});
```

---

### 8️⃣ 클라이언트 응답 처리

**서버 응답:**
```json
{
  "userMessage": { "id": "...", "content": "안녕하세요!" },
  "narratorNote": "밝은 햇살이 창문을 통해 들어온다",
  "characterResponses": [
    {
      "id": "...",
      "characterId": "아셀의 ID",
      "content": "*창밖을 바라보며* 정말 좋은 날씨네요.",
      "character": { "name": "아셀", ... }
    }
  ],
  "session": { "turnCount": 2, "intimacy": 0.1, ... }
}
```

**클라이언트 처리:**
```javascript
// 1. 임시 메시지 제거
setMessages(prev => 
  prev.filter(m => m.id !== tempUserMessage.id)
);

// 2. 새 메시지들 추가
setMessages(prev => [
  ...prev,
  userMessage,        // 유저 메시지
  narratorMessage,    // 나레이션
  ...characterResponses  // 캐릭터 응답들
]);

// 3. 세션 업데이트
setSession(data.session);

// 4. 스크롤 자동 이동
scrollToBottom();

// 5. 입력란 자동 포커스
inputRef.current?.focus();
```

---

## 데이터 흐름도

```
┌──────────────┐
│   사용자 입력  │
└──────┬───────┘
       │
       ▼
┌─────────────────────────────────────┐
│  프론트엔드 (React)                  │
│  - 메시지 입력                      │
│  - 즉시 화면 표시 (임시)             │
│  - API 호출                         │
└──────┬──────────────────────────────┘
       │ HTTP PUT /api/chat
       │ { sessionId, content }
       ▼
┌─────────────────────────────────────┐
│  Next.js API Route                   │
│  - 세션 조회                        │
│  - 메시지 저장                      │
│  - 히스토리 수집                    │
│  - 로어북 필터링                    │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Gemini API 호출                     │
│  - 프롬프트 생성                    │
│  - AI 응답 받기                      │
│  - JSON 파싱                         │
│  - 재시도 로직                      │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  DB 저장 (Prisma)                    │
│  - 나레이션 저장                     │
│  - 캐릭터 응답 저장                  │
│  - 세션 업데이트                     │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  응답 반환                           │
│  { userMessage, narratorNote,       │
│    characterResponses, session }     │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  프론트엔드 업데이트                  │
│  - 메시지 표시                      │
│  - 스크롤 이동                      │
│  - 포커스 설정                      │
└─────────────────────────────────────┘
```

---

## 핵심 개념 설명

### 🎭 멀티 캐릭터 대화 시스템

**특징:**
- 여러 캐릭터가 한 공간에서 동시에 대화
- 각 캐릭터가 독립적으로 응답
- 캐릭터 간 상호작용 가능

**작동 방식:**
1. AI에게 모든 캐릭터 정보 전달
2. AI가 상황에 맞는 캐릭터들만 선택하여 응답 생성
3. 각 캐릭터의 응답을 개별 메시지로 저장

---

### 📚 로어북 시스템

**목적:**
- 특정 키워드가 나오면 관련 배경 정보를 AI에게 제공
- 대화 맥락을 더 풍부하게 만듦

**작동 방식:**
```
사용자: "학교에 가자"
         ↓
키워드 검색: "학교" 발견
         ↓
로어북 항목 활성화:
- "베타 동 학교" 항목
- 조건 확인 (친밀도, 턴 수 등)
         ↓
AI 프롬프트에 추가:
"## 배경 정보
베타 동 학교는 3층 건물로..."
```

**조건:**
- 키워드 매칭
- 최소 친밀도
- 최소 턴 수
- 필요한 캐릭터 존재 여부

---

### 🎬 장면 상태 관리

**저장되는 정보:**
- 현재 장소 (location)
- 현재 시간 (time)
- 등장 캐릭터 목록 (presentCharacters)
- 최근 사건들 (recentEvents)

**업데이트:**
- AI가 장면을 변경할 수 있음
- 예: "유저가 방을 나갔다" → presentCharacters에서 제거

---

### 🔄 재시도 로직

**에러 타입별 처리:**

1. **429 Rate Limit**
   - 대기 시간: 2초 → 4초 → 8초
   - 최대 3번 재시도

2. **JSON 파싱 에러**
   - 0.5초 → 1초 → 1.5초 대기
   - 최대 3번 재시도

3. **인증 에러 (401, 403)**
   - 재시도 안 함
   - 즉시 에러 반환

---

### 💾 데이터 저장 구조

**ChatSession (채팅 세션)**
```
- id: 세션 고유 ID
- workId: 작품 ID
- userName: 유저 이름
- intimacy: 친밀도 (0~10)
- turnCount: 대화 턴 수
- currentLocation: 현재 장소
- currentTime: 현재 시간
- presentCharacters: 현재 캐릭터들 (JSON)
- recentEvents: 최근 사건들 (JSON)
```

**Message (메시지)**
```
- id: 메시지 고유 ID
- sessionId: 세션 ID
- characterId: 캐릭터 ID (null이면 유저/나레이션)
- content: 메시지 내용
- messageType: 'user' | 'dialogue' | 'narrator' | 'system'
```

---

## 🎯 요약

1. **사용자가 메시지 입력** → 즉시 화면 표시
2. **서버로 전송** → DB에 저장
3. **대화 히스토리 + 로어북 수집** → AI 프롬프트 생성
4. **Gemini API 호출** → AI 응답 받기
5. **응답 파싱 및 저장** → DB에 저장
6. **화면 업데이트** → 메시지 표시, 스크롤, 포커스

**핵심:**
- 모든 대화는 DB에 저장되어 맥락 유지
- 로어북으로 배경 정보 동적 주입
- 멀티 캐릭터가 자연스럽게 상호작용
- 에러 발생 시 자동 재시도

---

## 🔍 디버깅 팁

**문제 발생 시 확인할 것:**

1. **터미널 로그 확인**
   ```
   === Gemini Request ===
   === Gemini Raw Response ===
   === Parsed Response ===
   ```

2. **DB 상태 확인**
   ```bash
   npx prisma studio
   ```

3. **네트워크 탭 확인**
   - API 요청/응답 확인
   - 에러 상태 코드 확인

4. **브라우저 콘솔 확인**
   - 클라이언트 에러 확인
   - 상태 업데이트 확인

---

이 문서는 시스템의 전체 흐름을 이해하는 데 도움이 됩니다! 🎉
