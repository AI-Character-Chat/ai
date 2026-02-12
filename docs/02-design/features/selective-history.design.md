# Design: 선별적 대화 히스토리 주입 (Selective Conversation History)

## 구현 순서

1. **Step 1**: DB 스키마 — Message에 embedding 필드 추가
2. **Step 2**: 유저 메시지 저장 시 임베딩 생성 + 관련 메시지 검색 함수
3. **Step 3**: formatConversationHistory 분리 + route.ts 통합

---

## Step 1: DB 스키마

**파일**: `prisma/schema.prisma`
**위치**: Message 모델

```diff
model Message {
  ...
  metadata    String?
+ embedding   String  @default("[]") // 256차원 임베딩 (유저 메시지만)
  ...
}
```

---

## Step 2: 임베딩 저장 + 검색 함수

**파일**: `src/lib/prompt-builder.ts`

### A. 관련 메시지 검색 함수 추가

```typescript
import prisma from './prisma';
import { generateEmbedding } from './gemini';

// cosineSimilarity는 narrative-memory.ts에서 이미 구현됨 → 공통 유틸로 export
export function cosineSimilarity(a: number[], b: number[]): number { ... }

export async function searchRelevantHistory(
  sessionId: string,
  queryEmbedding: number[],
  excludeMessageIds: string[], // 즉시 컨텍스트에 이미 포함된 메시지 제외
  topK: number = 5
): Promise<MessageWithCharacter[]> {
  // 1. 임베딩이 있는 과거 유저 메시지 조회
  const userMessages = await prisma.message.findMany({
    where: {
      sessionId,
      messageType: 'user',
      id: { notIn: excludeMessageIds },
      NOT: { embedding: '[]' },
    },
    orderBy: { createdAt: 'desc' },
    take: 100, // 최대 100개에서 검색
  });

  // 2. 코사인 유사도 계산 + 정렬
  const scored = userMessages.map(msg => ({
    id: msg.id,
    similarity: cosineSimilarity(queryEmbedding, JSON.parse(msg.embedding)),
    createdAt: msg.createdAt,
  })).filter(s => s.similarity > 0.3) // 최소 유사도 임계값
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  if (scored.length === 0) return [];

  // 3. 선택된 유저 메시지 ID의 "직후 AI 응답"도 함께 조회
  const relevantIds = scored.map(s => s.id);
  const relevantMessages = await prisma.message.findMany({
    where: { sessionId, id: { in: relevantIds } },
    include: { character: true },
    orderBy: { createdAt: 'asc' },
  });

  // 4. 각 유저 메시지의 바로 다음 AI 응답 찾기
  const result: MessageWithCharacter[] = [];
  for (const userMsg of relevantMessages) {
    result.push(userMsg);
    // 직후 AI 응답 조회
    const aiResponse = await prisma.message.findFirst({
      where: {
        sessionId,
        createdAt: { gt: userMsg.createdAt },
        messageType: { in: ['dialogue', 'narrator'] },
      },
      include: { character: true },
      orderBy: { createdAt: 'asc' },
    });
    if (aiResponse) result.push(aiResponse);
  }

  return result;
}
```

### B. route.ts에서 유저 메시지 임베딩 저장

```diff
// 유저 메시지 저장 (기존)
const userMessage = await prisma.message.create({
  data: { sessionId, characterId: null, content, messageType: 'user' },
});

+ // 유저 메시지 임베딩 생성 (fire-and-forget → 다음 턴에서 검색 가능)
+ generateEmbedding(content).then(emb => {
+   if (emb.length > 0) {
+     prisma.message.update({
+       where: { id: userMessage.id },
+       data: { embedding: JSON.stringify(emb) },
+     }).catch(() => {});
+   }
+ }).catch(() => {});
```

---

## Step 3: 선별적 히스토리 빌드

**파일**: `src/app/api/chat/route.ts`

### A. DB 쿼리 변경

```diff
  messages: {
    include: { character: true },
    orderBy: { createdAt: 'desc' },
-   take: 30,
+   take: 10, // 즉시 컨텍스트 (최근 10개)
  },
```

### B. 관련 히스토리 검색 추가

```typescript
// 즉시 컨텍스트 (최근 10개)
const immediateMessages = session.messages.reverse();
const immediateIds = immediateMessages.map(m => m.id);

// 현재 메시지 임베딩 생성 → 관련 과거 검색
let relevantHistory: MessageWithCharacter[] = [];
try {
  const queryEmbedding = await generateEmbedding(content);
  if (queryEmbedding.length > 0) {
    relevantHistory = await searchRelevantHistory(
      sessionId, queryEmbedding, immediateIds, 5
    );
  }
} catch { /* 폴백: 관련 검색 없이 진행 */ }

// 합체: [관련 과거] + [즉시 컨텍스트]
const conversationHistory = buildSelectiveHistory(
  relevantHistory, immediateMessages, effectiveUserName
);
```

### C. 새 포맷 함수

```typescript
function buildSelectiveHistory(
  relevantHistory: MessageWithCharacter[],
  immediateMessages: MessageWithCharacter[],
  userName: string
): string {
  const sections: string[] = [];

  // 관련 과거 대화 (시간순)
  if (relevantHistory.length > 0) {
    const formatted = relevantHistory.map(msg => formatSingleMessage(msg, userName));
    sections.push(`[관련 과거 대화]\n${formatted.join('\n')}`);
  }

  // 즉시 컨텍스트 (최근)
  const immediate = immediateMessages.map(msg => formatSingleMessage(msg, userName));
  if (immediate.length > 0) {
    sections.push(`[최근 대화]\n${immediate.join('\n')}`);
  }

  return sections.join('\n\n---\n\n');
}
```

## 폴백 전략

| 상황 | 동작 |
|------|------|
| 임베딩 생성 실패 | 즉시 컨텍스트 10개만 사용 (기존보다 적지만 sessionSummary로 보완) |
| 과거 메시지에 임베딩 없음 (기존 데이터) | 검색 결과 0 → 즉시 컨텍스트만 |
| searchRelevantHistory 실패 | catch → 즉시 컨텍스트만 |
