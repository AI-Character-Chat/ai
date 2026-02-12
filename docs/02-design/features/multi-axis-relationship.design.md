# Design: 다축 관계 그래프 (Multi-Axis Relationship)

## 구현 순서

1. **Step 1**: DB 스키마 확장 — 5축 필드 추가
2. **Step 2**: RelationshipState 인터페이스 + getOrCreateRelationship 확장
3. **Step 3**: updateRelationship() 다축 처리 + intimacyScore 자동 계산
4. **Step 4**: generateNarrativePrompt() 다축 관계 표시
5. **Step 5**: Pro 분석 프롬프트에 관계 변화 추론 추가 + processConversationForMemory 연동

---

## Step 1: DB 스키마 확장

**파일**: `prisma/schema.prisma`
**위치**: UserCharacterRelationship 모델, intimacyScore 아래

```diff
  intimacyLevel  String  @default("stranger")
  intimacyScore  Float   @default(0)  // 0.0 ~ 100.0

+ // === 다축 관계 그래프 (Multi-Axis) ===
+ trust       Float @default(50)  // 신뢰도: 약속/비밀 이행 (0-100)
+ affection   Float @default(30)  // 호감도: 정서적 친밀감 (0-100)
+ respect     Float @default(50)  // 존경도: 능력/인품 인정 (0-100)
+ rivalry     Float @default(10)  // 경쟁심: 대립/라이벌 의식 (0-100)
+ familiarity Float @default(0)   // 친숙도: 함께한 경험량 (0-100)

  // 관계 유형
  relationshipLabel String?
```

**마이그레이션**: `npx prisma db push` — 모든 필드에 @default가 있으므로 기존 데이터 안전

---

## Step 2: RelationshipState 인터페이스 확장

**파일**: `src/lib/narrative-memory.ts`
**위치**: RelationshipState 인터페이스 (line 64)

```diff
  export interface RelationshipState {
    characterId: string;
    characterName: string;
    intimacyLevel: string;
    intimacyScore: number;
+   trust: number;
+   affection: number;
+   respect: number;
+   rivalry: number;
+   familiarity: number;
    relationshipLabel?: string;
    speechStyle: string;
    nicknameForUser?: string;
    knownFacts: string[];
    sharedExperiences: string[];
  }
```

**getOrCreateRelationship() 수정** (line 240):
```diff
  if (!relationship) {
    relationship = await prisma.userCharacterRelationship.create({
      data: {
        sessionId,
        characterId,
        intimacyLevel: 'stranger',
        intimacyScore: 0,
        speechStyle: 'formal',
+       trust: 50,
+       affection: 30,
+       respect: 50,
+       rivalry: 10,
+       familiarity: 0,
      },
    });
  }

  return {
    characterId: relationship.characterId,
    characterName,
    intimacyLevel: relationship.intimacyLevel,
    intimacyScore: relationship.intimacyScore,
+   trust: relationship.trust,
+   affection: relationship.affection,
+   respect: relationship.respect,
+   rivalry: relationship.rivalry,
+   familiarity: relationship.familiarity,
    relationshipLabel: relationship.relationshipLabel || undefined,
    ...
  };
```

**getAllRelationships() 수정** (line 385):
```diff
  return relationships.map((r) => ({
    ...
    intimacyScore: r.intimacyScore,
+   trust: r.trust,
+   affection: r.affection,
+   respect: r.respect,
+   rivalry: r.rivalry,
+   familiarity: r.familiarity,
    ...
  }));
```

---

## Step 3: updateRelationship() 다축 처리

**파일**: `src/lib/narrative-memory.ts`
**위치**: updateRelationship() (line 268)

### updates 타입 확장:
```diff
  updates: {
    intimacyDelta?: number;
+   trustDelta?: number;
+   affectionDelta?: number;
+   respectDelta?: number;
+   rivalryDelta?: number;
+   familiarityDelta?: number;
    newLabel?: string;
    ...
  }
```

### 다축 처리 로직 + intimacyScore 자동 계산:
```typescript
// 다축 관계 업데이트
const axisUpdates: Record<string, number> = {};
const axes = [
  { key: 'trust', delta: updates.trustDelta, current: relationship.trust },
  { key: 'affection', delta: updates.affectionDelta, current: relationship.affection },
  { key: 'respect', delta: updates.respectDelta, current: relationship.respect },
  { key: 'rivalry', delta: updates.rivalryDelta, current: relationship.rivalry },
  { key: 'familiarity', delta: updates.familiarityDelta, current: relationship.familiarity },
];

for (const axis of axes) {
  if (axis.delta) {
    const newVal = Math.max(0, Math.min(100, axis.current + axis.delta));
    data[axis.key] = newVal;
    axisUpdates[axis.key] = newVal;
  }
}

// intimacyScore 자동 계산 (5축 가중 평균)
const t = axisUpdates.trust ?? relationship.trust;
const a = axisUpdates.affection ?? relationship.affection;
const r = axisUpdates.respect ?? relationship.respect;
const rv = axisUpdates.rivalry ?? relationship.rivalry;
const f = axisUpdates.familiarity ?? relationship.familiarity;
const newScore = Math.max(0, Math.min(100,
  a * 0.35 + t * 0.25 + f * 0.25 + r * 0.15 - rv * 0.1
));
data.intimacyScore = newScore;

// 친밀도 레벨 자동 업데이트
const newLevel = getIntimacyLevel(newScore);
if (newLevel !== relationship.intimacyLevel) {
  data.intimacyLevel = newLevel;
  // 관계 변화 기록 (기존 로직 유지)
  ...
}
```

기존 `intimacyDelta` 로직은 제거 — 5축이 intimacyScore를 자동 산출하므로 불필요.

---

## Step 4: generateNarrativePrompt() 다축 표시

**파일**: `src/lib/narrative-memory.ts`
**위치**: generateNarrativePrompt() (line 678)

```diff
  // 관계 상태
  lines.push(`[${characterName}의 유저에 대한 인식]`);
- lines.push(`- 관계: ${translateIntimacyLevel(relationship.intimacyLevel)}`);
- lines.push(`- 친밀도: ${relationship.intimacyScore.toFixed(0)}/100`);
+ lines.push(`- 관계 단계: ${translateIntimacyLevel(relationship.intimacyLevel)}`);
+ lines.push(`- 신뢰: ${relationship.trust.toFixed(0)} | 호감: ${relationship.affection.toFixed(0)} | 존경: ${relationship.respect.toFixed(0)} | 경쟁심: ${relationship.rivalry.toFixed(0)} | 친숙도: ${relationship.familiarity.toFixed(0)}`);
+
+ // 관계 특성 요약 (높은 축 강조)
+ const traits: string[] = [];
+ if (relationship.trust >= 70) traits.push('깊이 신뢰함');
+ else if (relationship.trust <= 30) traits.push('불신');
+ if (relationship.affection >= 70) traits.push('강한 애착');
+ if (relationship.respect >= 70) traits.push('높은 존경');
+ if (relationship.rivalry >= 50) traits.push('라이벌 의식');
+ if (traits.length > 0) lines.push(`- 핵심 감정: ${traits.join(', ')}`);
```

---

## Step 5: Pro 분석 프롬프트 + processConversationForMemory 연동

### A. Pro 분석 프롬프트 확장

**파일**: `src/lib/gemini.ts`
**위치**: generateProAnalysis() 내부 프롬프트

기존 분석 항목에 추가:
```diff
  ## 분석 항목
  ...
  3. 관계 변화: 유저와 캐릭터 간 관계 진전/후퇴
+
+ ## 관계 변화 분석 (반드시 JSON 포함)
+ 이번 대화에서 각 캐릭터와 유저 사이의 관계 변화를 분석하세요.
+ 변화가 없는 축은 0으로 표기하세요.
+
+ ```json
+ {"relationshipDeltas": {
+   "캐릭터이름": {"trust": 0, "affection": 0, "respect": 0, "rivalry": 0, "familiarity": 0.5}
+ }}
+ ```
+
+ 변화량 가이드:
+ - 일상 대화: trust ±0~1, affection ±1~3, familiarity +0.5
+ - 감정적 순간: trust ±3~5, affection ±3~8, respect ±2~5
+ - 갈등/대립: rivalry +3~10, trust -3~10
+ - 약속 이행/위반: trust ±5~15
```

### B. Pro 분석 결과에서 관계 델타 파싱

**파일**: `src/app/api/chat/route.ts`
**위치**: processConversationForMemory 호출부 (line 435)

```typescript
// Pro 분석 결과에서 관계 델타 추출
let relationshipDeltas: Record<string, {
  trust?: number; affection?: number; respect?: number;
  rivalry?: number; familiarity?: number;
}> = {};

if (session.proAnalysis) {
  try {
    const jsonMatch = session.proAnalysis.match(/```json\s*([\s\S]*?)```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.relationshipDeltas) {
        relationshipDeltas = parsed.relationshipDeltas;
      }
    }
  } catch { /* 파싱 실패 시 기본 델타 사용 */ }
}

// processConversationForMemory에 다축 델타 전달
processConversationForMemory({
  ...
  characterResponses: dialogueTurns.map(t => ({
    ...
    relationshipDelta: relationshipDeltas[t.characterName] || undefined,
  })),
  ...
});
```

### C. processConversationForMemory 수정

```diff
  characterResponses: Array<{
    ...
+   relationshipDelta?: {
+     trust?: number; affection?: number; respect?: number;
+     rivalry?: number; familiarity?: number;
+   };
  }>;
```

```diff
  for (const response of characterResponses) {
+   const delta = response.relationshipDelta || {};
    await updateRelationship(sessionId, response.characterId, sceneId, {
-     intimacyDelta: emotionalMoment ? 2 : 0.5,
+     trustDelta: delta.trust || 0,
+     affectionDelta: delta.affection || (emotionalMoment ? 3 : 1),
+     respectDelta: delta.respect || 0,
+     rivalryDelta: delta.rivalry || 0,
+     familiarityDelta: delta.familiarity || 0.5, // 대화할 때마다 기본 증가
      newFacts: extractedFacts,
    });
```

---

## 폴백 전략

| 상황 | 동작 |
|------|------|
| Pro 분석 미실행 (첫 턴) | affection +1, familiarity +0.5 (기본값) |
| Pro 분석 실패 | 동일 기본값 |
| Pro 분석 JSON 파싱 실패 | 동일 기본값 |
| 기존 세션 데이터 (마이그레이션 전) | 5축 @default 적용됨 |

## 테스트 시나리오

1. `npx prisma db push` 성공
2. `npm run build` 성공
3. 새 세션 시작 → 초기값 trust:50 affection:30 respect:50 rivalry:10 familiarity:0
4. 대화 3턴 → familiarity 1.5 이상 증가 확인
5. Pro 분석 결과에 relationshipDeltas JSON 포함 확인
6. generateNarrativePrompt에 5축 정보 표시 확인
7. 기존 세션 접속 → 5축 기본값 정상 적용 확인
