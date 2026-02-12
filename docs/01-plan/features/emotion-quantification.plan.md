# Plan: 감정 정량화 (Emotion Quantification)

## 1. 문제 정의

### 현재 상태
- 감정 intensity가 0.7로 하드코딩 → 실제 감정 강도를 반영하지 못함
- `emotionalHistory` 필드(UserCharacterRelationship)가 정의만 되어 있고 미사용
- `ConversationLog.emotionTag`도 저장되지 않음
- 감정 히스토리가 프롬프트에 반영되지 않아 캐릭터가 이전 감정 맥락을 모름
- emotionalMoment 판정이 하드코딩된 0.7 기준이라 항상 false

### 목표
1. **AI가 감정 intensity를 직접 반환**: JSON schema에 emotionIntensity 필드 추가
2. **감정 히스토리 기록**: 대화마다 캐릭터의 감정을 emotionalHistory에 누적
3. **감정 프롬프트 주입**: generateNarrativePrompt에 최근 감정 흐름 표시
4. **ConversationLog 감정 태깅**: 각 대화 턴의 감정 태그 저장

## 2. 요구사항

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| R1 | JSON schema에 emotionIntensity (0.0~1.0) 필드 추가 | 필수 |
| R2 | StoryTurn에서 AI 반환 intensity 사용 (하드코딩 제거) | 필수 |
| R3 | processConversationForMemory에서 emotionalHistory 누적 | 필수 |
| R4 | generateNarrativePrompt에 최근 감정 흐름 표시 | 필수 |
| R5 | 감정 히스토리 최대 10개 유지 (FIFO) | 필수 |

## 3. 영향 분석

### 수정 파일 (2개)
| 파일 | 변경 내용 |
|------|-----------|
| `src/lib/gemini.ts` | JSON schema에 emotionIntensity 추가, 파싱 시 실제 값 사용 |
| `src/lib/narrative-memory.ts` | emotionalHistory 기록 + 프롬프트 주입 |

### DB 스키마 변경: 없음
- 기존 `emotionalHistory String @default("[]")` 활용

## 4. 성능 예측

| 항목 | 설명 |
|------|------|
| 추가 비용 | 없음 (AI 응답에 필드 1개 추가) |
| 품질 향상 | 감정 강도에 따른 세밀한 반응, 감정 연속성 유지 |
| emotionalMoment 정확도 | 실제 AI 판단 intensity 기반 → 정확해짐 |
