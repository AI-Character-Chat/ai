# Plan: 다축 관계 그래프 (Multi-Axis Relationship)

## 1. 문제 정의

### 현재 상태
- 유저-캐릭터 관계가 **단일 축 `intimacyScore` (0-100)**으로만 표현됨
- `intimacyLevel`: stranger → acquaintance → friend → close_friend → intimate (5단계)
- 모든 상호작용이 `intimacyDelta` 하나로 축약 → 관계의 뉘앙스 소실
- 예: "적대적이지만 존경하는 관계", "친밀하지만 신뢰하지 않는 관계" 등 표현 불가

### 목표
- 단일 친밀도를 **5축 관계 그래프**로 확장 (Inworld AI 참조)
- 각 축이 독립적으로 변화하여 복합적인 관계 표현 가능
- AI가 관계 상태를 참조하여 더 미묘하고 현실적인 캐릭터 반응 생성
- 기존 `intimacyScore`/`intimacyLevel` 하위 호환 유지

## 2. 요구사항

| ID | 요구사항 | 우선순위 |
|----|----------|----------|
| R1 | DB 스키마에 5축 필드 추가 (trust, affection, respect, rivalry, familiarity) | 필수 |
| R2 | RelationshipState 인터페이스 확장 | 필수 |
| R3 | updateRelationship()에서 다축 델타 처리 | 필수 |
| R4 | generateNarrativePrompt()에서 다축 정보 AI에 전달 | 필수 |
| R5 | Pro 분석에서 다축 델타 추론 (기존 emotionalMoment 대체) | 필수 |
| R6 | 기존 intimacyScore 호환 (5축 가중 평균으로 산출) | 필수 |
| R7 | 기존 데이터 무중단 (@default(50) for neutral axes) | 필수 |

## 3. 5축 정의

| 축 | 설명 | 범위 | 기본값 | 변화 예시 |
|----|------|------|--------|-----------|
| **trust** | 신뢰도 — 비밀/약속을 지킬 것이라는 믿음 | 0-100 | 50 | 약속 이행 +5, 거짓말 -15 |
| **affection** | 호감도 — 정서적 친밀감/애착 | 0-100 | 30 | 따뜻한 대화 +3, 무관심 -2 |
| **respect** | 존경도 — 능력/인품에 대한 인정 | 0-100 | 50 | 현명한 조언 +5, 무례한 행동 -10 |
| **rivalry** | 경쟁심 — 대립/라이벌 의식 | 0-100 | 10 | 도전적 발언 +5, 양보 -3 |
| **familiarity** | 친숙도 — 함께한 시간/경험의 양 | 0-100 | 0 | 대화할 때마다 +0.5~1 |

### intimacyScore 산출 공식 (하위 호환)
```
intimacyScore = affection * 0.35 + trust * 0.25 + familiarity * 0.25 + respect * 0.15 - rivalry * 0.1
```
범위: 0~100 (clamp)

## 4. 영향 분석

### 수정 파일 (4개)
| 파일 | 변경 내용 |
|------|-----------|
| `prisma/schema.prisma` | UserCharacterRelationship에 5축 필드 추가 |
| `src/lib/narrative-memory.ts` | RelationshipState 확장, updateRelationship/generateNarrativePrompt 수정 |
| `src/lib/gemini.ts` | Pro 분석 프롬프트에 다축 분석 항목 추가 |
| `src/app/api/chat/route.ts` | processConversationForMemory 호출부 수정 (다축 델타 전달) |

### 영향 받지 않는 부분
- 프론트엔드 (관계 정보는 서버 사이드에서만 사용)
- 임베딩 메모리 검색 (독립 시스템)
- 대화 스트리밍 로직

## 5. 데이터 흐름

```
[기존]
유저 메시지 → processConversationForMemory → updateRelationship(intimacyDelta: 0.5~2)

[변경 후]
유저 메시지 → Flash 응답 → Pro 분석 (다축 변화 추론)
                                ↓
                            proAnalysis에 관계 변화 포함:
                            "trust +3, affection +5, familiarity +1"
                                ↓
[다음 턴] Flash → processConversationForMemory → updateRelationship(다축 델타)
```

### 핵심 설계 결정
- **Pro가 다축 변화를 추론**: 현재 `emotionalMoment ? 2 : 0.5` 하드코딩 → Pro가 대화 내용 기반으로 각 축 변화량을 분석
- **proAnalysis JSON 확장**: 기존 텍스트 분석에 `relationshipDeltas` 필드 추가
- **familiarity는 항상 증가**: 대화 턴마다 자동 +0.5 (Pro 분석과 무관)

## 6. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| Pro 분석 실패 시 다축 업데이트 누락 | 중간 | familiarity만 자동 증가 + 기본 affection delta 유지 |
| 기존 데이터 intimacyScore 불일치 | 낮음 | 마이그레이션 시 기존 intimacyScore → affection으로 매핑 |
| 프롬프트 토큰 증가 | 낮음 | 5축 정보는 ~50토큰 이내 |

## 7. 성능 예측

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| DB 필드 | intimacyScore 1개 | 5축 + intimacyScore(계산값) |
| 프롬프트 크기 | 관계 2줄 | 관계 7줄 (~50토큰 추가) |
| updateRelationship | 단일 delta | 5축 delta (DB 쿼리 동일) |
| Pro 분석 프롬프트 | 텍스트만 | + relationshipDeltas JSON |
