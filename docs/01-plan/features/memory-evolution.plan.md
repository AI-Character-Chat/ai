# Plan: 메모리 진화 (A-MEM / Memory Evolution)

## 1. 문제 정의

### 현재 상태
- 기억이 **정적**: 한 번 저장되면 interpretation/importance가 변하지 않음
- `strength` 감쇠만 존재 → 시간이 지나면 약해질 뿐, 더 강해지거나 통합되지 않음
- 유사한 기억이 중복 저장됨 → "유저가 고양이를 좋아한다" 5번 반복 저장 가능
- 개별 기억 → 상위 패턴/인사이트로 승격되는 메커니즘 없음

### 목표 (A-MEM 핵심)
1. **기억 통합 (Consolidation)**: 유사한 개별 기억을 상위 요약 기억으로 병합
2. **기억 승격 (Promotion)**: 반복 언급/높은 중요도 기억을 `episodic → semantic`으로 승격
3. **기억 강화 (Reinforcement)**: 관련 대화 발생 시 기존 기억의 importance/strength 강화
4. 기존 decay/prune와 조화롭게 동작

## 2. 요구사항

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| R1 | 유사 기억 탐지 (코사인 유사도 > 0.85) | 필수 |
| R2 | 유사 기억 통합 → 새 semantic 기억 생성 + 원본 삭제 | 필수 |
| R3 | 반복 언급 기억 승격 (mentionedCount >= 3 → semantic) | 필수 |
| R4 | 관련 대화 시 기존 기억 강화 (importance/strength 업) | 필수 |
| R5 | 10턴마다 비동기 consolidation 실행 | 필수 |
| R6 | 기존 decay/prune와 충돌 없음 | 필수 |

## 3. 영향 분석

### 수정 파일 (2개)
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/narrative-memory.ts` | consolidateMemories(), promoteMemories(), reinforceMemory() 함수 추가 |
| `src/app/api/chat/route.ts` | 10턴마다 consolidation fire-and-forget 호출 |

### DB 스키마 변경: 없음
- 기존 CharacterMemory 필드로 충분 (memoryType, importance, strength, embedding, mentionedCount)

## 4. 성능 예측

| 항목 | 설명 |
|------|------|
| 실행 빈도 | 10턴마다 1회 (fire-and-forget) |
| 소요 시간 | ~200ms (인메모리 유사도 계산, 최대 100개 비교) |
| 기억 수 감소 | 유사 기억 통합으로 세션당 기억 수 30-50% 감소 |
| 품질 향상 | 중복 제거 + 상위 패턴 생성 → AI 참조 품질 향상 |
