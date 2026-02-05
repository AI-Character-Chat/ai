# 캐릭터 이미지 생성 아키텍처 설계

## 문제 정의
- Gemini 이미지 생성 시 캐릭터 표정이 대사와 일치하지 않음
- "차갑고 오만한" 대사를 하는 캐릭터가 "따뜻하게 웃는" 이미지로 생성됨
- 몰입감 저해의 주요 원인

## 해결 방안: 하이브리드 스프라이트 시스템

### 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 1: 캐릭터 등록 단계 (1회)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  창작자 입력           Gemini로 특성 분석        표정 세트 생성      │
│  (프롬프트 + 이미지) ─→ (성격, 외모, 말투) ─→   (12-16개 표정)      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓ DB 저장
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 2: 실시간 채팅 단계                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  사용자 입력  →  LLM 응답      →   감정 분류   →   표정 이미지 선택   │
│              (대사 + 감정태그)    (12개 카테고리)  (사전 생성에서)    │
│                                                                 │
│                     ↓ 특수 상황만                                 │
│              실시간 이미지 생성 (선택적)                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: 캐릭터 특성 분석 및 표정 세트 생성

#### 1.1 캐릭터 특성 자동 추출

창작자가 입력한 자유 텍스트 프롬프트를 Gemini로 분석하여 구조화:

```typescript
interface CharacterVisualProfile {
  // 기본 외모
  appearance: {
    hairColor: string;       // "은발", "검은 머리" 등
    eyeColor: string;        // "적안", "푸른 눈" 등
    skinTone: string;        // "창백한", "건강한 피부" 등
    bodyType: string;        // "마른", "건장한" 등
    distinctiveFeatures: string[];  // ["뾰족한 턱", "긴 속눈썹"]
  };

  // 성격 기반 표정 경향
  expressionTendency: {
    defaultExpression: string;     // "무표정", "미소", "날카로운 눈빛"
    smileTendency: number;         // 0-1 (얼마나 자주 웃는지)
    emotionalRange: 'restrained' | 'moderate' | 'expressive';
    dominantTraits: string[];      // ["오만", "차가움", "신비로움"]
  };

  // 스타일
  style: {
    artStyle: 'anime' | 'semi-realistic' | 'realistic';
    colorPalette: string[];        // 캐릭터 대표 색상
    clothingStyle: string;         // "정장", "캐주얼", "판타지 로브"
  };
}
```

#### 1.2 표정 세트 (12-16개 권장)

비주얼 노벨 업계 표준 + FACS(Facial Action Coding System) 기반:

| 카테고리 | 표정 ID | 설명 | FACS 기반 묘사 |
|---------|---------|------|---------------|
| **기본** | neutral | 무표정 | relaxed face, neutral gaze |
| | slight_smile | 약한 미소 | corners of mouth slightly raised |
| | smile | 미소 | warm smile, relaxed eyes |
| **부정-차가움** | cold | 차가운 | half-lidded eyes, lips pressed, no smile |
| | contempt | 경멸 | one corner of mouth raised, narrowed eyes |
| | annoyed | 짜증 | furrowed brows, tight lips |
| **부정-분노** | angry | 분노 | furrowed brows, intense gaze, clenched jaw |
| | glare | 노려봄 | narrowed eyes, sharp gaze |
| **부정-슬픔** | sad | 슬픔 | downturned mouth, drooping eyes |
| | melancholy | 우울 | distant gaze, slight frown |
| **긍정** | happy | 행복 | bright smile, crinkled eyes |
| | amused | 재미 | playful smirk, raised eyebrow |
| **기타** | surprised | 놀람 | wide eyes, raised eyebrows |
| | embarrassed | 당황 | averted gaze, slight blush |
| | thinking | 생각 | looking up/away, thoughtful |
| | suspicious | 의심 | narrowed eyes, tilted head |

#### 1.3 표정 이미지 생성 전략

**Option A: 단일 기준 이미지에서 표정 변형 (권장)**
- 프로필 이미지를 기준으로 12-16개 표정 변형 생성
- Stability AI SDXL + IP-Adapter 또는 ComfyUI 활용

**Option B: 프롬프트 기반 일괄 생성**
- 캐릭터 특성 프롬프트 + 각 표정 프롬프트 조합
- 일관성 유지를 위해 seed 값 고정

**Option C: Gemini로 생성 (현재 가능)**
- 기준 이미지 + 표정별 상세 FACS 프롬프트
- 일관성은 떨어지지만 즉시 적용 가능

### Phase 2: 실시간 감정 분류 및 표정 선택

#### 2.1 LLM 응답 시 감정 태그 생성

기존 Gemini 응답 스키마에 감정 태그 추가:

```json
{
  "character": "라울",
  "content": "*차갑게 눈을 가늘게 뜨며* \"흥, 그 정도로 나를 감동시킬 수 있다고 생각했나?\"",
  "emotion": {
    "primary": "contempt",
    "intensity": 0.8,
    "secondary": "cold"
  }
}
```

#### 2.2 감정 → 표정 매핑 로직

```typescript
function selectExpression(
  emotion: { primary: string; intensity: number; secondary?: string },
  characterProfile: CharacterVisualProfile
): string {
  // 1. 기본 매핑
  const baseMapping: Record<string, string> = {
    'contempt': 'contempt',
    'cold': 'cold',
    'angry': 'angry',
    'happy': 'smile',
    // ... 등
  };

  // 2. 캐릭터 성격 반영
  // 예: smileTendency가 낮은 캐릭터는 'happy' → 'slight_smile'로 조정
  let expression = baseMapping[emotion.primary] || 'neutral';

  if (emotion.primary === 'happy' && characterProfile.expressionTendency.smileTendency < 0.3) {
    expression = 'slight_smile';
  }

  // 3. 강도 반영
  if (emotion.intensity > 0.8 && expression === 'annoyed') {
    expression = 'angry';
  }

  return expression;
}
```

### Phase 3: 동적 이미지 생성 (보완용)

사전 생성으로 커버 못하는 특수 상황만 실시간 생성:

- 특수 의상/배경이 필요한 이벤트 씬
- 극단적 감정 (울음, 격분)
- 다수 캐릭터 상호작용 장면

## DB 스키마 확장

```prisma
// 캐릭터 시각 프로필 (분석 결과 저장)
model CharacterVisualProfile {
  id              String   @id @default(uuid())
  characterId     String   @unique

  // 외모 분석 결과 (JSON)
  appearance      String   // JSON: hairColor, eyeColor, etc.

  // 표정 경향 분석 결과 (JSON)
  expressionTendency String // JSON: defaultExpression, smileTendency, etc.

  // 스타일 분석 결과 (JSON)
  style           String   // JSON: artStyle, colorPalette, etc.

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  character       Character @relation(fields: [characterId], references: [id], onDelete: Cascade)
}

// 사전 생성된 표정 이미지
model CharacterExpression {
  id              String   @id @default(uuid())
  characterId     String

  expressionType  String   // "neutral", "smile", "cold", "angry", etc.
  imageUrl        String   // 생성된 표정 이미지 URL

  // 메타데이터
  facsDescription String?  // FACS 기반 표정 설명

  createdAt       DateTime @default(now())

  character       Character @relation(fields: [characterId], references: [id], onDelete: Cascade)

  @@unique([characterId, expressionType])
  @@index([characterId])
}
```

## 구현 우선순위

### 1단계: 즉시 적용 (프롬프트 개선)
- [ ] FACS 기반 구체적 표정 묘사로 프롬프트 변경
- [ ] 감정 태그 시스템 추가 (Gemini 응답 스키마 수정)
- [ ] 캐릭터 성격 기반 기본 표정 설정

### 2단계: 스프라이트 시스템 구축
- [ ] CharacterVisualProfile 스키마 추가
- [ ] 캐릭터 특성 자동 분석 API
- [ ] 표정 세트 생성 (12-16개)
- [ ] 감정 → 표정 매핑 로직

### 3단계: 고급 기능
- [ ] 표정 이미지 캐싱 시스템
- [ ] 특수 상황 감지 및 동적 생성
- [ ] 사용자 피드백 기반 학습

## 예상 효과

| 접근법 | 표정 정확도 | 응답 속도 | 비용 |
|--------|-----------|----------|------|
| 현재 (실시간 생성) | ~30% | 느림 (2-5초) | 높음 |
| 프롬프트 개선만 | ~50% | 느림 | 높음 |
| 스프라이트 시스템 | ~95% | 빠름 (<100ms) | 낮음 |
| 하이브리드 | ~90% | 중간 | 중간 |
