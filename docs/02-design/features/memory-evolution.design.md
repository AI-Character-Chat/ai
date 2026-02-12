# Design: 메모리 진화 (A-MEM / Memory Evolution)

## 구현 순서

1. **Step 1**: reinforceMemory() — 관련 대화 시 기존 기억 강화
2. **Step 2**: consolidateMemories() — 유사 기억 통합
3. **Step 3**: promoteMemories() — 반복 언급 기억 승격
4. **Step 4**: route.ts 통합 (10턴마다 consolidation + promotion 실행)

---

## Step 1: reinforceMemory() — 기존 기억 강화

**파일**: `src/lib/narrative-memory.ts`

새 기억 저장 전, 유사한 기존 기억이 있으면 그 기억을 강화하고 새 저장 생략.

```typescript
export async function reinforceMemory(
  sessionId: string,
  characterId: string,
  newEmbedding: number[],
  newImportance: number,
  similarityThreshold: number = 0.85
): Promise<boolean> {
  if (newEmbedding.length === 0) return false;

  const memories = await prisma.characterMemory.findMany({
    where: { sessionId, characterId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  for (const mem of memories) {
    const emb = JSON.parse(mem.embedding || '[]') as number[];
    if (emb.length === 0) continue;
    const sim = cosineSimilarity(newEmbedding, emb);
    if (sim >= similarityThreshold) {
      // 기존 기억 강화
      await prisma.characterMemory.update({
        where: { id: mem.id },
        data: {
          strength: Math.min(1.0, mem.strength + 0.2),
          importance: Math.min(1.0, Math.max(mem.importance, newImportance)),
          mentionedCount: { increment: 1 },
          lastMentioned: new Date(),
        },
      });
      return true; // 기존 기억 강화 완료 → 새 저장 불필요
    }
  }
  return false; // 유사 기억 없음 → 새로 저장
}
```

**saveCharacterMemory 수정**: 저장 전 reinforceMemory 호출.

```diff
export async function saveCharacterMemory(params: { ... }) {
  const embedding = await generateEmbedding(params.interpretation);
+
+ // 유사 기억이 있으면 강화하고 새 저장 생략
+ const reinforced = await reinforceMemory(
+   params.sessionId, params.characterId, embedding, params.importance || 0.5
+ );
+ if (reinforced) return null;

  return await prisma.characterMemory.create({ ... });
}
```

---

## Step 2: consolidateMemories() — 유사 기억 통합

**파일**: `src/lib/narrative-memory.ts`

동일 캐릭터의 유사 기억 그룹을 찾아 하나의 상위 기억으로 통합.

```typescript
export async function consolidateMemories(sessionId: string): Promise<number> {
  const characters = await prisma.characterMemory.findMany({
    where: { sessionId },
    select: { characterId: true },
    distinct: ['characterId'],
  });

  let totalConsolidated = 0;

  for (const { characterId } of characters) {
    const memories = await prisma.characterMemory.findMany({
      where: { sessionId, characterId, memoryType: 'episodic' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    // 유사 기억 그룹 탐색
    const used = new Set<string>();
    const groups: typeof memories[] = [];

    for (let i = 0; i < memories.length; i++) {
      if (used.has(memories[i].id)) continue;
      const embI = JSON.parse(memories[i].embedding || '[]') as number[];
      if (embI.length === 0) continue;

      const group = [memories[i]];
      used.add(memories[i].id);

      for (let j = i + 1; j < memories.length; j++) {
        if (used.has(memories[j].id)) continue;
        const embJ = JSON.parse(memories[j].embedding || '[]') as number[];
        if (embJ.length === 0) continue;
        if (cosineSimilarity(embI, embJ) >= 0.80) {
          group.push(memories[j]);
          used.add(memories[j].id);
        }
      }

      if (group.length >= 2) groups.push(group);
    }

    // 각 그룹을 하나의 semantic 기억으로 통합
    for (const group of groups) {
      const bestMemory = group.reduce((a, b) => a.importance > b.importance ? a : b);
      const combinedInterpretation = group.map(m => m.interpretation).join(' / ');
      const maxImportance = Math.max(...group.map(m => m.importance));
      const totalMentions = group.reduce((sum, m) => sum + m.mentionedCount, 0);

      // 새 통합 기억 생성
      await prisma.characterMemory.create({
        data: {
          sessionId,
          characterId,
          sceneId: bestMemory.sceneId,
          originalEvent: `[통합] ${group.length}개 관련 기억`,
          interpretation: combinedInterpretation.substring(0, 500),
          memoryType: 'semantic',
          importance: Math.min(1.0, maxImportance + 0.1),
          strength: 1.0,
          mentionedCount: totalMentions,
          keywords: bestMemory.keywords,
          embedding: bestMemory.embedding,
        },
      });

      // 원본 삭제
      await prisma.characterMemory.deleteMany({
        where: { id: { in: group.map(m => m.id) } },
      });

      totalConsolidated += group.length;
    }
  }

  if (totalConsolidated > 0) {
    console.log(`[MemoryEvolution] Consolidated ${totalConsolidated} memories`);
  }
  return totalConsolidated;
}
```

---

## Step 3: promoteMemories() — 반복 언급 기억 승격

```typescript
export async function promoteMemories(sessionId: string): Promise<number> {
  // episodic 중 mentionedCount >= 3인 기억을 semantic으로 승격
  const result = await prisma.characterMemory.updateMany({
    where: {
      sessionId,
      memoryType: 'episodic',
      mentionedCount: { gte: 3 },
    },
    data: {
      memoryType: 'semantic',
      importance: 0.8, // 승격 시 중요도 상향
    },
  });

  if (result.count > 0) {
    console.log(`[MemoryEvolution] Promoted ${result.count} memories to semantic`);
  }
  return result.count;
}
```

---

## Step 4: route.ts 통합

**위치**: fire-and-forget 블록 (기존 [B] 5턴마다 뒤)

```diff
  // [B] 5턴마다: 세션 요약 + 기억 감쇠
  ...

+ // [D] 10턴마다: 기억 진화 (통합 + 승격)
+ if (newTurnCount % 10 === 0) {
+   consolidateMemories(sessionId).catch(() => {});
+   promoteMemories(sessionId).catch(() => {});
+ }

  // [C] 25턴마다: 약한 기억 정리
  ...
```

실행 순서: decay(5턴) → consolidate+promote(10턴) → prune(25턴)

---

## 폴백 전략

| 상황 | 동작 |
|------|------|
| 임베딩 없는 기억 | consolidation에서 건너뜀 (기존 방식 유지) |
| consolidation 실패 | catch → 무시, 다음 10턴에서 재시도 |
| reinforceMemory 실패 | 새 기억 정상 저장 (기존 동작) |

## 테스트 시나리오

1. `npm run build` 성공
2. 같은 주제로 3회 대화 → reinforceMemory로 중복 저장 방지 확인
3. 10턴 후 로그에 `[MemoryEvolution] Consolidated` 출력 확인
4. mentionedCount >= 3인 기억이 semantic으로 승격 확인
