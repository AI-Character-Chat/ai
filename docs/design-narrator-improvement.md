# 설계: 나레이션-대사 교대 구조 개선

## 문제
1. 응답이 대사로 시작하는 경우 있음 (T2) — 경쟁사는 항상 나레이션으로 시작
2. 나레이션이 여러 캐릭터를 한꺼번에 묘사 — 경쟁사는 캐릭터별로 분리

## 목표 구조 (경쟁사 패턴)
```
[나레이션] A캐릭터 행동/장면 묘사
[대사]    A캐릭터
[나레이션] B캐릭터 등장/행동 묘사
[대사]    B캐릭터
[나레이션] 상황 전개
[대사]    A 또는 C캐릭터
```

## 변경사항

### 변경 1: turns description 수정 (스키마)
**파일**: `src/lib/gemini.ts`, 약 140번째 줄

```
// Before
description: '응답 턴 배열',

// After
description: 'narrator로 시작, narrator와 dialogue 교대 배열',
```

- **목적**: AI에게 구조적 힌트 제공 (항상 narrator 시작, 교대 패턴)
- **리스크**: 낮음 — 창작 지시가 아닌 배열 구조 설명
- **주의**: description 최소화 원칙 준수 (9자 → 21자, 여전히 짧음)

### 변경 2: 첫 턴 narrator 보장 (코드)
**파일**: `src/lib/gemini.ts`

비스트리밍 경로 (`generateStoryResponse`) — turns 파싱 후, 첫 턴이 dialogue면 가장 가까운 narrator와 위치 교환:

```typescript
// turns 파싱 완료 후, 첫 턴이 narrator인지 확인
if (turns.length > 1 && turns[0].type !== 'narrator') {
  const firstNarrIdx = turns.findIndex(t => t.type === 'narrator');
  if (firstNarrIdx > 0) {
    const [narr] = turns.splice(firstNarrIdx, 1);
    turns.unshift(narr);
  }
}
```

스트리밍 경로 — 스트리밍은 실시간 전송이라 재배치 불가. 변경 1(스키마)에 의존.

## 구현 위치 상세

### 변경 1 위치
`src/lib/gemini.ts` RESPONSE_SCHEMA 내부:
```javascript
turns: {
  type: Type.ARRAY,
  description: '응답 턴 배열',  // ← 이 줄 수정
  minItems: '6',
```

### 변경 2 위치
`src/lib/gemini.ts` `generateStoryResponse` 함수 내부:
턴 파싱 `.filter()` 직후, 폴백 처리 전 (약 441행 이후)에 삽입.

## 검증
- `npx tsc --noEmit` 통과
- 10턴 품질 테스트로 효과 확인
- T1이 항상 나레이션으로 시작하는지
- narrator-dialogue 교대 비율 측정
