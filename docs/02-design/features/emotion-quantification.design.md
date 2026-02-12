# Design: 감정 정량화 (Emotion Quantification)

## 구현 순서

1. **Step 1**: gemini.ts — JSON schema에 emotionIntensity 추가 + 파싱 수정
2. **Step 2**: narrative-memory.ts — emotionalHistory 기록 + 프롬프트 주입

---

## Step 1: gemini.ts — emotionIntensity 필드 추가

**RESPONSE_SCHEMA 수정:**

turns.items.properties에 emotionIntensity 추가:
```typescript
emotionIntensity: {
  type: Type.NUMBER,
  description: 'dialogue일 때 감정 강도 0.0~1.0. narrator일 때 0.5.',
},
```

**파싱 수정 (generateStoryResponseStream):**

하드코딩 `intensity: 0.7` → AI 반환값 사용:
```diff
  emotion: {
    primary: EXPRESSION_TYPES.includes(turn.emotion) ? turn.emotion : 'neutral',
-   intensity: 0.7,
+   intensity: typeof turn.emotionIntensity === 'number'
+     ? Math.max(0, Math.min(1, turn.emotionIntensity))
+     : 0.5,
  },
```

---

## Step 2: narrative-memory.ts — 감정 히스토리

**processConversationForMemory 수정:**

감정 히스토리 누적 로직 추가:
```typescript
// 감정 히스토리 누적
if (response.emotion) {
  const rel = await prisma.userCharacterRelationship.findFirst({
    where: { sessionId, characterId: response.characterId },
  });
  if (rel) {
    const history = JSON.parse(rel.emotionalHistory || '[]') as Array<{
      emotion: string; intensity: number; at: string;
    }>;
    history.push({
      emotion: response.emotion.primary,
      intensity: response.emotion.intensity,
      at: new Date().toISOString(),
    });
    // 최대 10개 유지 (FIFO)
    const trimmed = history.slice(-10);
    await prisma.userCharacterRelationship.update({
      where: { id: rel.id },
      data: { emotionalHistory: JSON.stringify(trimmed) },
    });
  }
}
```

**generateNarrativePrompt 수정:**

RelationshipState에 emotionalHistory 추가, 프롬프트에 최근 감정 흐름 표시:
```typescript
// 최근 감정 흐름
if (relationship.emotionalHistory.length > 0) {
  lines.push(`\n[${characterName}의 최근 감정 흐름]`);
  const recentEmotions = relationship.emotionalHistory.slice(-5);
  lines.push(`- ${recentEmotions.map(e => `${e.emotion}(${(e.intensity * 100).toFixed(0)}%)`).join(' → ')}`);
}
```

---

## 폴백 전략

| 상황 | 동작 |
|------|------|
| AI가 emotionIntensity 미반환 | 0.5 기본값 사용 |
| emotionalHistory 파싱 실패 | 빈 배열로 초기화 |
| 감정 히스토리 DB 업데이트 실패 | catch → 무시, 다음 턴에 재시도 |

## 테스트 시나리오

1. `npm run build` 성공
2. AI 응답에 emotionIntensity가 0.0~1.0 범위로 포함되는지 확인
3. 여러 턴 후 emotionalHistory에 감정 기록이 누적되는지 확인
4. 프롬프트에 감정 흐름이 표시되는지 확인
