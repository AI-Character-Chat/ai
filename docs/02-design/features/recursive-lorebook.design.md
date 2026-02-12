# Design: 재귀 로어북 스캐닝 (Recursive Lorebook Scanning)

## 구현 순서

1. **Step 1**: `filterActiveLorebookEntries()` 내부 로직을 반복 스캔 방식으로 교체

---

## Step 1: filterActiveLorebookEntries() 재귀 스캔 구현

**파일**: `src/lib/prompt-builder.ts`

기존 단일 패스를 최대 3회 반복 스캔으로 변경. 각 라운드에서 새로 활성화된 항목의 content를 스캔 텍스트에 누적.

```typescript
export function filterActiveLorebookEntries(
  entries: LorebookEntryInput[],
  recentText: string,
  intimacy: number,
  turnCount: number,
  presentCharacters: string[],
  maxEntries: number = 5
): string {
  const MAX_DEPTH = 3;
  const activatedIndices = new Set<number>(); // 이미 활성화된 항목 인덱스
  let scanText = recentText.toLowerCase();

  // 키워드 사전 파싱 (1회만)
  const parsedEntries = entries.map((entry, idx) => {
    let keywords: string[];
    if (typeof entry.keywords === 'string') {
      try { keywords = JSON.parse(entry.keywords); }
      catch { keywords = [entry.keywords]; }
    } else {
      keywords = entry.keywords;
    }
    return { idx, keywords, entry };
  });

  // 재귀 스캔 (최대 MAX_DEPTH 라운드)
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    let newActivations = 0;

    for (const { idx, keywords, entry } of parsedEntries) {
      if (activatedIndices.has(idx)) continue; // 이미 활성화된 항목 건너뜀

      const hasMatch = keywords.some(kw => scanText.includes(kw.toLowerCase()));
      if (!hasMatch) continue;

      // 조건 확인
      if (entry.minIntimacy !== null && intimacy < entry.minIntimacy) continue;
      if (entry.minTurns !== null && turnCount < entry.minTurns) continue;
      if (entry.requiredCharacter !== null &&
          !presentCharacters.includes(entry.requiredCharacter)) continue;

      activatedIndices.add(idx);
      // 활성화된 항목의 content를 스캔 텍스트에 누적
      scanText += ' ' + entry.content.toLowerCase();
      newActivations++;
    }

    if (newActivations === 0) break; // 더 이상 새 활성화 없으면 조기 종료
  }

  // 활성화된 항목들을 우선순위로 정렬
  const activeEntries = Array.from(activatedIndices)
    .map(idx => entries[idx])
    .map(e => ({ content: e.content, priority: e.priority ?? 0 }))
    .sort((a, b) => a.priority - b.priority);

  return activeEntries
    .slice(0, maxEntries)
    .map(e => e.content)
    .join('\n\n');
}
```

**핵심 변경점:**
1. 키워드 파싱을 루프 밖에서 1회만 수행 (성능 최적화)
2. `scanText`에 활성화된 항목의 content를 누적 → 다음 라운드에서 연쇄 매칭
3. `activatedIndices` Set으로 중복 방지
4. 새 활성화가 0이면 조기 종료 (불필요한 반복 방지)
5. 함수 시그니처 변경 없음 → route.ts 수정 불필요

---

## 폴백 전략

| 상황 | 동작 |
|------|------|
| 재귀 깊이 3 초과 | 자동 중단, 현재까지 활성화된 항목 반환 |
| 로어북 0개 | 빈 문자열 반환 (기존과 동일) |
| 키워드 파싱 실패 | 원본 문자열을 단일 키워드로 사용 (기존과 동일) |

## 테스트 시나리오

1. `npm run build` 성공
2. 기존 단일 키워드 매칭 동작 유지 (1회차에서 활성화)
3. A 로어북 content에 B 로어북 키워드 포함 시 B도 활성화 확인
4. 이미 활성화된 항목이 재활성화되지 않음 확인
