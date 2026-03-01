/**
 * 🧠 서사 지속형 장기 기억 시스템 (Narrative Memory System)
 *
 * 목표: 정보 기억이 아니라, 유저와 캐릭터 간의 서사적 관계 상태를
 * 지속적으로 업데이트하며, 캐릭터 성격에 따라 동일 사건을
 * 다르게 해석·기억하는 다중 시점 장기 메모리 구조
 */

import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from './gemini';

const prisma = new PrismaClient();

// ============================================================
// 유틸리티
// ============================================================

/**
 * 코사인 유사도 계산
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================
// knownFacts 분류 (Identity vs Moment vs Action) + 충돌 감지
// ============================================================

/**
 * Identity 주제(Subject) Set — "주제: 내용" 형식에서 주제가 이 Set에 있으면 Identity
 *
 * 기존 IDENTITY_KEYWORDS(문자열 포함 검색)의 한계:
 *   "키: 178cm" → '키'가 1글자라 오탐 위험 → 키워드에 못 넣음 → Identity 누락
 *   "거주지: 서울" → '거주지' 키워드 없음 → Identity 누락
 *   "별명: 수수" → '별명' 키워드 없음 → Identity 누락
 *
 * Subject 기반 매칭으로 28% → 90%+ 커버리지 달성
 */
const IDENTITY_SUBJECTS = new Set([
  // 기본 신원
  '이름', '본명', '풀네임',
  '나이', '만 나이',
  '직업', '직장', '회사',
  '전공', '학과', '학교', '대학', '대학교', '학년', '반',
  '혈액형', 'MBTI', 'mbti',
  '키', '신장', '몸무게', '체중',
  '생일', '생년월일',
  '고향', '출신', '출생지',
  '성별',
  '거주지', '사는 곳', '주소', '동네',
  '별명', '닉네임', '애칭',
  '꿈', '장래희망', '장래 희망', '목표',
  '성격', '성향',
  '외모', '생김새', '인상',
  // 가족/인물
  '아버지', '아빠', '어머니', '엄마',
  '형', '오빠', '누나', '언니',
  '동생', '여동생', '남동생',
  '할머니', '할아버지', '가족', '가족 구성',
  '남자친구', '여자친구', '애인', '연인', '배우자', '남편', '아내',
  '친구', '절친', '베프', '단짝',
  // 반려동물
  '반려동물', '반려견', '반려묘', '애완동물',
  '강아지', '고양이', '펫',
  // 건강/안전
  '알레르기', '알러지', '공포증', '트라우마', '지병',
  // 신체 특성
  '왼손잡이', '오른손잡이',
  // 선호/취향 (비교적 안정적)
  '취미', '특기', '관심사',
  // 열망/목표 (안정적 의지)
  '배우고 싶은 것', '하고 싶은 것', '되고 싶은 것',
  '여행 계획', '여행 예정', '가고 싶은 곳',
  '해보고 싶은 것', '도전하고 싶은 것',
]);

/**
 * 레거시 키워드 — "주제: 내용" 형식이 아닌 옛 fact용 폴백
 */
const LEGACY_IDENTITY_KEYWORDS = [
  '이름', '나이', '직업', '전공', '학교', '대학',
  '혈액형', 'MBTI', '생일', '고향', '출신', '성별',
  '아버지', '어머니', '아빠', '엄마', '언니', '오빠', '누나',
  '동생', '여동생', '남동생', '할머니', '할아버지', '가족',
  '왼손잡이', '오른손잡이', '알레르기', '공포증', '트라우마',
  '반려', '강아지', '고양이',
];

/**
 * fact가 Identity(불변/반불변 정보)인지 판별
 *
 * 판별 우선순위:
 * 1. "주제: 내용" 형식 → 주제를 IDENTITY_SUBJECTS에서 정확 매칭
 * 2. "좋아하는/싫어하는 X" 패턴 → Identity (선호도는 비교적 안정)
 * 3. "X 이름" 패턴 → Identity (인물 이름)
 * 4. 콜론 없는 레거시 형식 → LEGACY_IDENTITY_KEYWORDS 포함 검색
 */
function isIdentityFact(fact: string): boolean {
  // 1. "주제: 내용" 형식에서 주제 추출
  const colonMatch = fact.match(/^([^:：]+)[：:]/);
  if (colonMatch) {
    const subject = colonMatch[1].trim();
    // 정확히 일치
    if (IDENTITY_SUBJECTS.has(subject)) return true;
    // "좋아하는/싫어하는 X" 패턴
    if (subject.startsWith('좋아하는') || subject.startsWith('싫어하는')) return true;
    // "배우고 싶은/하고 싶은/되고 싶은/해보고 싶은 X" 패턴 → Identity (안정적 열망)
    if (subject.startsWith('배우고 싶') || subject.startsWith('하고 싶') ||
        subject.startsWith('되고 싶') || subject.startsWith('해보고 싶')) return true;
    // "X 이름" 패턴 (가족/인물 이름: "여동생 이름", "강아지 이름" 등)
    if (subject.endsWith('이름')) return true;
    return false;
  }

  // 2. 콜론 없는 레거시 형식 → 키워드 포함 검색 폴백
  return LEGACY_IDENTITY_KEYWORDS.some(kw => fact.includes(kw));
}

/**
 * Action(일시적 행동/상황) 주제 Set
 * 이 주제의 fact는 knownFacts 대신 sharedExperiences로 분류
 */
const ACTION_SUBJECTS = new Set([
  // 행동/상황
  '유저의 행동', '행동', '한 일',
  '약속', '부탁', '요청',
  '현재 상황', '상황', '근황',
  '기분', '감정', '감정 상태',
  '고민', '걱정',
  // 일시적/상황적 정보
  '과거 경험', '경험', '최근 경험',
  '의견', '생각', '느낌',
  '소유물', '물건',
  '신체 상태', '컨디션', '건강 상태',
  '기억 상태',
  '습관', '버릇',
  '욕구', '바람',
  '활동', '최근 활동',
  '현재 행동',
]);

/**
 * fact가 Action(일시적 행동/상황)인지 판별
 * Action fact는 knownFacts 대신 sharedExperiences에 저장
 */
function isActionFact(fact: string): boolean {
  const colonMatch = fact.match(/^([^:：]+)[：:]/);
  if (colonMatch) {
    const subject = colonMatch[1].trim();
    if (ACTION_SUBJECTS.has(subject)) return true;
    // "정호의 X" 패턴에서 X 추출 후 재확인
    const possessiveMatch = subject.match(/^.+?의\s*(.+)$/);
    if (possessiveMatch && ACTION_SUBJECTS.has(possessiveMatch[1].trim())) return true;
    return false;
  }
  // 콜론 없는 팩트: 키워드로 action 감지
  const ACTION_KEYWORDS = ['사왔다', '갔다', '했다', '먹었다', '봤다', '샀다',
    '불편하다', '힘들었다', '안 먹', '기억하지 못', '취소됨', '준비를 하지'];
  return ACTION_KEYWORDS.some(kw => fact.includes(kw));
}

/**
 * fact에서 충돌 감지용 키(subject) 추출
 *
 * 패턴:
 *   "직업: 개발자"        → "직업"
 *   "나이는 25살"         → "나이"
 *   "여동생 이름은 수아"  → "여동생 이름"
 *   "MBTI는 INFJ"        → "MBTI"
 *   "왼손잡이이다"        → "_손잡이"  (binary opposite)
 */
function extractFactKey(fact: string): string | null {
  // 1. "subject: value" 형식
  const colonMatch = fact.match(/^([^:：]+)[：:]/);
  if (colonMatch) return colonMatch[1].trim();

  // 2. "subject은/는 value" 형식
  const topicMatch = fact.match(/^(.+?)(?:은|는)\s/);
  if (topicMatch) return topicMatch[1].trim();

  // 3. Binary opposite 패턴
  if (fact.includes('왼손잡이') || fact.includes('오른손잡이')) return '_손잡이';
  if (fact.includes('남성') || fact.includes('여성')) return '_성별';

  return null;
}

/**
 * 부정 사실(Negative Fact) 판별
 *
 * AI가 "전공을 모른다", "기억나지 않는다" 등의 자기 발언을
 * extractedFacts로 역추출하는 버그 방어
 */
const NEGATIVE_PATTERNS = [
  /모른다$/,
  /모름$/,
  /몰라$/,
  /없다$/,
  /없음$/,
  /기억.*않/,
  /기억.*없/,
  /흐릿/,
  /확실.*않/,
  /불명/,
  /모르겠/,
  /파악.*못/,
  /알 수 없/,
  /알지 못/,
  /안 ?밝/,
  /밝히지 않/,
];

function isNegativeFact(fact: string): boolean {
  return NEGATIVE_PATTERNS.some(pattern => pattern.test(fact));
}

/**
 * 다중값을 허용하는 카테고리 — 같은 key라도 값이 다르면 추가(APPEND)
 * 예: "공포증: 고소공포증" + "공포증: 강아지 공포증" → 둘 다 보존
 */
const MULTI_VALUE_KEYS = new Set([
  '공포증', '알레르기', '알러지', '트라우마',
  '취미', '특기', '관심사',
  '반려동물', '반려견', '반려묘', '고양이', '강아지', '펫',
  '좋아하는 음식', '좋아하는 색', '좋아하는 계절',
  '싫어하는 것', '좋아하는 것',
  '외국어', '언어',
]);

/**
 * fact에서 값(value) 부분 추출 — "주제: 값" → "값"
 */
function extractFactValue(fact: string): string | null {
  const colonMatch = fact.match(/^[^:：]+[：:]\s*(.+)/);
  return colonMatch ? colonMatch[1].trim() : null;
}

/**
 * 새 fact를 기존 fact 목록에 병합하면서 충돌 해결
 *
 * - 부정 사실("X를 모른다") → 거부 (AI 역추출 방어)
 * - MULTI_VALUE_KEYS 카테고리 → 값이 다르면 추가, 같으면 skip
 * - 그 외 같은 key(subject)를 가진 fact가 이미 있으면 → 최신 값으로 교체
 * - 없으면 → 추가
 * - key 추출 불가한 fact → 단순 추가 (Set 중복제거)
 */
function resolveFactConflicts(existingFacts: string[], newFacts: string[]): string[] {
  const result = [...existingFacts];

  for (const newFact of newFacts) {
    // 부정 사실 거부
    if (isNegativeFact(newFact)) {
      console.log(`[KnownFacts] 부정 사실 거부: "${newFact}"`);
      continue;
    }

    // 이미 완전히 동일한 fact 존재 → skip
    if (result.includes(newFact)) continue;

    const newKey = extractFactKey(newFact);

    if (newKey) {
      // 같은 key를 가진 기존 fact 검색
      const conflictIdx = result.findIndex(existing => {
        const existingKey = extractFactKey(existing);
        return existingKey === newKey;
      });

      if (conflictIdx !== -1) {
        if (MULTI_VALUE_KEYS.has(newKey)) {
          // 다중값 카테고리: 값이 다르면 추가, 같으면 skip
          const existingValue = extractFactValue(result[conflictIdx]);
          const newValue = extractFactValue(newFact);
          if (existingValue !== newValue) {
            console.log(`[KnownFacts] 다중값 추가: "${result[conflictIdx]}" + "${newFact}"`);
            result.push(newFact);
          }
        } else {
          // 단일값 카테고리: 최신 값으로 교체 (기존 동작)
          console.log(`[KnownFacts] 충돌 해결: "${result[conflictIdx]}" → "${newFact}"`);
          result[conflictIdx] = newFact;
        }
        continue;
      }
    }

    // 충돌 없음 → 추가
    result.push(newFact);
  }

  return result;
}

// ============================================================
// 크로스세션 메모리 스코프
// ============================================================

export interface MemoryScope {
  userId: string;   // 크로스세션 핵심 — 유저 식별
  workId: string;   // 크로스세션 핵심 — 작품 식별
  sessionId: string; // Scene 연결용 (세션별 고유)
}

// ============================================================
// 타입 정의
// ============================================================

export interface EmotionalTone {
  mood: string; // "따뜻함", "긴장감", "편안함"
  intensity: number; // 0.0 ~ 1.0
  keywords: string[]; // ["친밀", "농담", "위로"]
}

export interface CharacterInterpretation {
  characterId: string;
  characterName: string;
  originalEvent: string;
  interpretation: string; // 캐릭터 시점의 해석
  emotionalResponse: {
    emotion: string;
    intensity: number;
  };
}

export interface SceneContext {
  sceneId: string;
  location: string;
  time: string;
  participants: string[];
  emotionalTone: EmotionalTone;
  topics: string[];
  summary?: string;
}

export interface RelationshipState {
  characterId: string;
  characterName: string;
  intimacyLevel: string;
  intimacyScore: number;
  trust: number;
  affection: number;
  respect: number;
  rivalry: number;
  familiarity: number;
  relationshipLabel?: string;
  speechStyle: string;
  nicknameForUser?: string;
  knownFacts: string[];
  sharedExperiences: string[];
  emotionalHistory: Array<{ emotion: string; intensity: number; at: string }>;
}

export interface MemoryProcessingResult {
  characterId: string;
  characterName: string;
  surpriseAction: 'reinforce' | 'skip' | 'save' | 'no_facts';
  surpriseScore: number;
  adjustedImportance: number;
  relationshipUpdate: {
    trustDelta: number;
    affectionDelta: number;
    respectDelta: number;
    rivalryDelta: number;
    familiarityDelta: number;
  };
  newFactsCount: number;
}

// ============================================================
// 원본 대화 저장 (데이터 소유권 확보)
// ============================================================

/**
 * 원본 대화를 ConversationLog에 저장
 * - 모든 대화 원문을 보관하여 추후 마이그레이션 대비
 */
export async function saveConversationLog(params: {
  sessionId: string;
  speakerType: 'user' | 'character' | 'narrator';
  speakerId?: string;
  speakerName: string;
  content: string;
  sceneId?: string;
  emotionTag?: { primary: string; intensity: number };
}) {
  return await prisma.conversationLog.create({
    data: {
      sessionId: params.sessionId,
      speakerType: params.speakerType,
      speakerId: params.speakerId,
      speakerName: params.speakerName,
      content: params.content,
      sceneId: params.sceneId,
      emotionTag: params.emotionTag ? JSON.stringify(params.emotionTag) : null,
    },
  });
}

// ============================================================
// Scene (장면) 관리 - 서사 단위 기억의 핵심
// ============================================================

/**
 * 새 장면 시작
 */
export async function startScene(params: {
  sessionId: string;
  location: string;
  time: string;
  participants: string[]; // 캐릭터 ID 배열
}): Promise<string> {
  // 이전 활성 장면 종료
  await prisma.scene.updateMany({
    where: { sessionId: params.sessionId, isActive: true },
    data: { isActive: false, endedAt: new Date() },
  });

  const scene = await prisma.scene.create({
    data: {
      sessionId: params.sessionId,
      location: params.location,
      time: params.time,
      participants: JSON.stringify(params.participants),
      isActive: true,
    },
  });

  return scene.id;
}

/**
 * 현재 활성 장면 가져오기
 */
export async function getActiveScene(sessionId: string): Promise<SceneContext | null> {
  const scene = await prisma.scene.findFirst({
    where: { sessionId, isActive: true },
    orderBy: { startedAt: 'desc' },
  });

  if (!scene) return null;

  return {
    sceneId: scene.id,
    location: scene.location,
    time: scene.time,
    participants: JSON.parse(scene.participants),
    emotionalTone: JSON.parse(scene.emotionalTone),
    topics: JSON.parse(scene.topics),
    summary: scene.summary || undefined,
  };
}

/**
 * 장면 업데이트 (토픽, 감정 톤 등)
 */
export async function updateScene(
  sceneId: string,
  updates: {
    topics?: string[];
    emotionalTone?: EmotionalTone;
    summary?: string;
    location?: string;
    time?: string;
  }
) {
  const data: Record<string, unknown> = {};

  if (updates.topics) {
    // 기존 토픽에 새 토픽 추가 (중복 제거)
    const scene = await prisma.scene.findUnique({ where: { id: sceneId } });
    if (scene) {
      const existingTopics: string[] = JSON.parse(scene.topics);
      const combinedTopics = existingTopics.concat(updates.topics);
      const newTopics = Array.from(new Set(combinedTopics));
      data.topics = JSON.stringify(newTopics);
    }
  }

  if (updates.emotionalTone) {
    data.emotionalTone = JSON.stringify(updates.emotionalTone);
  }

  if (updates.summary) {
    data.summary = updates.summary;
  }

  if (updates.location) {
    data.location = updates.location;
  }

  if (updates.time) {
    data.time = updates.time;
  }

  await prisma.scene.update({
    where: { id: sceneId },
    data,
  });
}

/**
 * 장면 종료
 */
export async function endScene(sceneId: string, summary?: string) {
  await prisma.scene.update({
    where: { id: sceneId },
    data: {
      isActive: false,
      endedAt: new Date(),
      summary,
    },
  });
}

// ============================================================
// 유저-캐릭터 관계 관리
// ============================================================

/**
 * 관계 데이터를 RelationshipState로 변환
 */
function mapRelationshipToState(
  r: { characterId: string; intimacyLevel: string; intimacyScore: number; trust: number; affection: number; respect: number; rivalry: number; familiarity: number; relationshipLabel: string | null; speechStyle: string; nicknameForUser: string | null; knownFacts: string; sharedExperiences: string; emotionalHistory: string },
  characterName: string
): RelationshipState {
  return {
    characterId: r.characterId,
    characterName,
    intimacyLevel: r.intimacyLevel,
    intimacyScore: r.intimacyScore,
    trust: r.trust,
    affection: r.affection,
    respect: r.respect,
    rivalry: r.rivalry,
    familiarity: r.familiarity,
    relationshipLabel: r.relationshipLabel || undefined,
    speechStyle: r.speechStyle,
    nicknameForUser: r.nicknameForUser || undefined,
    knownFacts: JSON.parse(r.knownFacts),
    sharedExperiences: JSON.parse(r.sharedExperiences),
    emotionalHistory: JSON.parse(r.emotionalHistory || '[]'),
  };
}

/**
 * 캐릭터와의 관계 가져오기 (없으면 생성)
 * 크로스세션: userId+workId+characterId로 검색, 레거시 폴백 지원
 */
export async function getOrCreateRelationship(
  scope: MemoryScope,
  characterId: string,
  characterName: string
): Promise<RelationshipState> {
  // 1차: 크로스세션 검색 (userId+workId+characterId)
  let relationship = await prisma.userCharacterRelationship.findFirst({
    where: { userId: scope.userId, workId: scope.workId, characterId },
  });

  if (!relationship) {
    // 2차: 레거시 폴백 (sessionId+characterId)
    relationship = await prisma.userCharacterRelationship.findUnique({
      where: { sessionId_characterId: { sessionId: scope.sessionId, characterId } },
    });

    if (relationship && !relationship.userId) {
      // 레거시 데이터 → userId/workId 백필
      relationship = await prisma.userCharacterRelationship.update({
        where: { id: relationship.id },
        data: { userId: scope.userId, workId: scope.workId },
      });
    }
  }

  if (!relationship) {
    // 신규 생성 (크로스세션 필드 포함)
    relationship = await prisma.userCharacterRelationship.create({
      data: {
        sessionId: scope.sessionId,
        userId: scope.userId,
        workId: scope.workId,
        characterId,
        intimacyLevel: 'stranger',
        intimacyScore: 0,
        speechStyle: 'formal',
      },
    });
  }

  return mapRelationshipToState(relationship, characterName);
}

/**
 * 관계 상태 업데이트
 */
export async function updateRelationship(
  scope: MemoryScope,
  characterId: string,
  sceneId: string | undefined,
  updates: {
    intimacyDelta?: number;
    trustDelta?: number;
    affectionDelta?: number;
    respectDelta?: number;
    rivalryDelta?: number;
    familiarityDelta?: number;
    newLabel?: string;
    newFacts?: string[];
    newExperience?: string;
    speechStyleChange?: string;
    nicknameChange?: string;
  }
) {
  // 크로스세션 검색 → 레거시 폴백
  const relationship = await prisma.userCharacterRelationship.findFirst({
    where: { userId: scope.userId, workId: scope.workId, characterId },
  }) || await prisma.userCharacterRelationship.findUnique({
    where: { sessionId_characterId: { sessionId: scope.sessionId, characterId } },
  });

  if (!relationship) return;

  const data: Record<string, unknown> = {
    totalTurns: { increment: 1 },
    lastInteraction: new Date(),
  };

  // 다축 관계 업데이트
  const axes = [
    { key: 'trust', delta: updates.trustDelta, current: relationship.trust },
    { key: 'affection', delta: updates.affectionDelta, current: relationship.affection },
    { key: 'respect', delta: updates.respectDelta, current: relationship.respect },
    { key: 'rivalry', delta: updates.rivalryDelta, current: relationship.rivalry },
    { key: 'familiarity', delta: updates.familiarityDelta, current: relationship.familiarity },
  ];

  const axisValues: Record<string, number> = {};
  for (const axis of axes) {
    if (axis.delta) {
      const newVal = Math.max(0, Math.min(100, axis.current + axis.delta));
      data[axis.key] = newVal;
      axisValues[axis.key] = newVal;
    } else {
      axisValues[axis.key] = axis.current;
    }
  }

  // intimacyScore 자동 계산 (5축 가중 평균)
  const newScore = Math.max(0, Math.min(100,
    axisValues.affection * 0.35 +
    axisValues.trust * 0.25 +
    axisValues.familiarity * 0.25 +
    axisValues.respect * 0.15 -
    axisValues.rivalry * 0.1
  ));
  data.intimacyScore = newScore;

  // 레거시 intimacyDelta 지원 (다축이 없을 때 폴백)
  if (updates.intimacyDelta && !updates.affectionDelta && !updates.trustDelta) {
    data.intimacyScore = Math.max(0, Math.min(100, relationship.intimacyScore + updates.intimacyDelta));
  }

  // 친밀도 레벨 자동 업데이트
  const finalScore = data.intimacyScore as number;
  const newLevel = getIntimacyLevel(finalScore);
  if (newLevel !== relationship.intimacyLevel) {
    data.intimacyLevel = newLevel;

    // 관계 변화 기록
    if (sceneId) {
      await prisma.relationshipChange.create({
        data: {
          relationshipId: relationship.id,
          sceneId,
          changeType: finalScore > relationship.intimacyScore ? 'intimacy_up' : 'intimacy_down',
          previousValue: relationship.intimacyLevel,
          newValue: newLevel,
        },
      });
    }
  }

  // 관계 라벨 변화
  if (updates.newLabel) {
    if (sceneId && relationship.relationshipLabel !== updates.newLabel) {
      await prisma.relationshipChange.create({
        data: {
          relationshipId: relationship.id,
          sceneId,
          changeType: 'label_change',
          previousValue: relationship.relationshipLabel,
          newValue: updates.newLabel,
        },
      });
    }
    data.relationshipLabel = updates.newLabel;
  }

  // 새로 알게 된 사실 (충돌 감지 적용 — 같은 주제의 기존 fact는 최신 값으로 교체)
  if (updates.newFacts && updates.newFacts.length > 0) {
    const existingFacts: string[] = JSON.parse(relationship.knownFacts);
    const resolvedFacts = resolveFactConflicts(existingFacts, updates.newFacts);
    data.knownFacts = JSON.stringify(resolvedFacts);
  }

  // 공유 경험 추가
  if (updates.newExperience) {
    const experiences: string[] = JSON.parse(relationship.sharedExperiences);
    experiences.push(updates.newExperience);
    // 영구 기억: 모든 경험 보존
    data.sharedExperiences = JSON.stringify(experiences);
  }

  // 말투 변화
  if (updates.speechStyleChange) {
    data.speechStyle = updates.speechStyleChange;
  }

  // 별명 변화
  if (updates.nicknameChange) {
    data.nicknameForUser = updates.nicknameChange;
  }

  await prisma.userCharacterRelationship.update({
    where: { id: relationship.id },
    data,
  });
}

/**
 * 친밀도 점수 → 레벨 변환
 */
function getIntimacyLevel(score: number): string {
  if (score >= 80) return 'intimate';
  if (score >= 60) return 'close_friend';
  if (score >= 40) return 'friend';
  if (score >= 20) return 'acquaintance';
  return 'stranger';
}

/**
 * 유저+작품의 모든 캐릭터 관계 가져오기 (크로스세션)
 */
export async function getAllRelationships(scope: MemoryScope): Promise<RelationshipState[]> {
  const relationships = await prisma.userCharacterRelationship.findMany({
    where: { userId: scope.userId, workId: scope.workId },
    include: { character: true },
  });

  return relationships.map((r) => mapRelationshipToState(r, r.character.name));
}

// ============================================================
// 캐릭터별 기억 관리 (성격 필터 기반)
// ============================================================

/**
 * Surprise-based 기억 신선도 평가 (Titans 개념 적용)
 *
 * 새 기억이 기존 기억 대비 얼마나 "놀라운지" 평가하여 3단계 행동 결정:
 *
 * | 유사도       | 판정     | 행동                                     |
 * |-------------|---------|------------------------------------------|
 * | >= 0.90     | 거의 동일  | 기존 기억 강화 (A-MEM reinforcement)       |
 * | 0.75 ~ 0.90 | 비슷한 변형 | imp>=0.4 감쇠저장, imp<0.4 skip           |
 * | < 0.75      | 새로운 정보 | surprise boost로 importance 상향 저장      |
 *
 * @returns action: 'reinforce'(강화됨) | 'skip'(저장 불필요) | 'save'(저장 필요)
 */
async function evaluateMemoryNovelty(
  scope: MemoryScope,
  characterId: string,
  newEmbedding: number[],
  newImportance: number,
  newInterpretation?: string,
): Promise<{ action: 'reinforce' | 'skip' | 'save'; surpriseScore: number; adjustedImportance: number }> {
  const memories = await prisma.characterMemory.findMany({
    where: { userId: scope.userId, workId: scope.workId, characterId },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  if (memories.length === 0) {
    // 첫 기억은 항상 놀라움
    return { action: 'save', surpriseScore: 1.0, adjustedImportance: Math.min(1.0, newImportance + 0.2) };
  }

  let maxSimilarity = 0;
  let mostSimilarMemory: typeof memories[0] | null = null;

  if (newEmbedding.length > 0) {
    // 임베딩 기반 비교
    for (const mem of memories) {
      const emb = JSON.parse(mem.embedding || '[]') as number[];
      if (emb.length === 0) continue;
      const sim = cosineSimilarity(newEmbedding, emb);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        mostSimilarMemory = mem;
      }
    }
  }

  // 임베딩 비교 실패 시 (빈 임베딩) 텍스트 기반 폴백
  if (maxSimilarity === 0 && newInterpretation) {
    const newWordsArr = newInterpretation.split(/\s+/).filter(w => w.length >= 2);
    const newWords = new Set(newWordsArr);
    for (const mem of memories) {
      const memWordsArr = mem.interpretation.split(/\s+/).filter(w => w.length >= 2);
      const memWords = new Set(memWordsArr);
      if (newWords.size === 0 || memWords.size === 0) continue;
      let overlap = 0;
      newWordsArr.forEach(w => { if (memWords.has(w)) overlap++; });
      const sim = overlap / Math.max(newWords.size, memWords.size);
      if (sim > maxSimilarity) {
        maxSimilarity = sim;
        mostSimilarMemory = mem;
      }
    }
  }

  const surpriseScore = 1.0 - maxSimilarity;

  // [1] 거의 동일한 기억 (>=0.90): 기존 강화, 새 저장 생략
  if (maxSimilarity >= 0.90 && mostSimilarMemory) {
    await prisma.characterMemory.update({
      where: { id: mostSimilarMemory.id },
      data: {
        strength: Math.min(1.0, mostSimilarMemory.strength + 0.2),
        importance: Math.min(1.0, Math.max(mostSimilarMemory.importance, newImportance)),
        mentionedCount: { increment: 1 },
        lastMentioned: new Date(),
      },
    });
    return { action: 'reinforce', surpriseScore, adjustedImportance: newImportance };
  }

  // [2] 비슷한 기억 (0.75~0.90): 약간 다른 변형
  if (maxSimilarity >= 0.75) {
    // importance가 극히 낮은 경우만 skip, 나머지는 감쇠 저장
    if (newImportance >= 0.4) {
      const dampened = newImportance * 0.8; // 중복성 감안 20% 감쇠
      return { action: 'save', surpriseScore, adjustedImportance: dampened };
    }
    return { action: 'skip', surpriseScore, adjustedImportance: newImportance };
  }

  // [3] 새로운 정보 (<0.75): surprise boost로 importance 상향
  const surpriseBoost = surpriseScore * 0.3; // 최대 +0.3
  const adjustedImportance = Math.min(1.0, newImportance + surpriseBoost);
  return { action: 'save', surpriseScore, adjustedImportance };
}

/**
 * 캐릭터의 기억 저장 (Surprise-based 필터링 적용)
 *
 * 저장 전 evaluateMemoryNovelty로 신선도 평가:
 * - 기존과 동일 → 강화 (A-MEM)
 * - 뻔한 정보 → skip
 * - 놀라운 정보 → surprise boost로 중요도 상향 저장
 */
export async function saveCharacterMemory(params: {
  scope: MemoryScope;
  characterId: string;
  sceneId?: string;
  originalEvent: string;
  interpretation: string;
  emotionalResponse?: { emotion: string; intensity: number };
  memoryType?: 'episodic' | 'semantic' | 'emotional';
  importance?: number;
  keywords?: string[];
}): Promise<{ action: 'reinforce' | 'skip' | 'save'; surpriseScore: number; adjustedImportance: number }> {
  // 임베딩 생성 (interpretation 기반 — 캐릭터 관점의 해석이 검색 키)
  const embedding = await generateEmbedding(params.interpretation);

  // Surprise-based 신선도 평가
  const { action, surpriseScore, adjustedImportance } = await evaluateMemoryNovelty(
    params.scope, params.characterId, embedding, params.importance || 0.5, params.interpretation
  );

  if (action === 'reinforce' || action === 'skip') {
    return { action, surpriseScore, adjustedImportance };
  }

  await prisma.characterMemory.create({
    data: {
      sessionId: params.scope.sessionId,
      userId: params.scope.userId,
      workId: params.scope.workId,
      characterId: params.characterId,
      sceneId: params.sceneId,
      originalEvent: params.originalEvent,
      interpretation: params.interpretation,
      emotionalResponse: params.emotionalResponse
        ? JSON.stringify(params.emotionalResponse)
        : null,
      memoryType: params.memoryType || 'episodic',
      importance: adjustedImportance,
      keywords: JSON.stringify(params.keywords || []),
      embedding: JSON.stringify(embedding),
    },
  });

  return { action: 'save', surpriseScore, adjustedImportance };
}

/**
 * 캐릭터의 관련 기억 검색
 * queryEmbedding이 있으면 의미 유사도 기반, 없으면 importance 기반 폴백
 */
export async function searchCharacterMemories(params: {
  scope: MemoryScope;
  characterId: string;
  queryEmbedding?: number[];
  keywords?: string[];
  memoryType?: string;
  minImportance?: number;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    originalEvent: string;
    interpretation: string;
    importance: number;
    createdAt: Date;
    similarity?: number;
  }>
> {
  const memories = await prisma.characterMemory.findMany({
    where: {
      userId: params.scope.userId,
      workId: params.scope.workId,
      characterId: params.characterId,
      ...(params.memoryType && { memoryType: params.memoryType }),
      ...(params.minImportance && { importance: { gte: params.minImportance } }),
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    // 임베딩 검색 시 전체 로드 후 인메모리 정렬 (최대 300개)
    take: params.queryEmbedding?.length ? 300 : (params.limit || 10),
  });

  // 임베딩 기반 정렬
  if (params.queryEmbedding?.length) {
    const scored = memories.map(m => {
      const emb: number[] = JSON.parse(m.embedding || '[]');
      const similarity = emb.length > 0
        ? cosineSimilarity(params.queryEmbedding!, emb)
        : 0;
      // 복합 점수: 유사도 70% + 중요도 20% + 강도 10%
      const score = similarity * 0.7 + m.importance * 0.2 + m.strength * 0.1;
      return { ...m, similarity, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, params.limit || 5);

    return top.map(m => ({
      id: m.id,
      originalEvent: m.originalEvent,
      interpretation: m.interpretation,
      importance: m.importance,
      createdAt: m.createdAt,
      similarity: m.similarity,
    }));
  }

  // 폴백: 기존 importance 기반
  return memories.map((m) => ({
    id: m.id,
    originalEvent: m.originalEvent,
    interpretation: m.interpretation,
    importance: m.importance,
    createdAt: m.createdAt,
  }));
}

/**
 * 기억 언급 시 업데이트
 */
export async function markMemoryMentioned(memoryId: string) {
  await prisma.characterMemory.update({
    where: { id: memoryId },
    data: {
      mentionedCount: { increment: 1 },
      lastMentioned: new Date(),
      // 언급할수록 기억 강도 유지 (시간 감소 방지)
      strength: 1.0,
    },
  });
}

/**
 * 기억 강도 자연 감소 (Emotion-Weighted Memory Decay)
 *
 * Ebbinghaus 곡선 + 감정 강도 반영:
 * - 기본 감쇠: episodic 0.95, semantic 0.98, emotional 0.97
 * - 감정 보정: emotionalResponse.intensity가 높을수록 감쇠 느림 (x0.4 가중)
 * - 중요도 보정: importance가 높을수록 감쇠 느림 (x0.3 가중)
 * - 최대 factor: 0.995 (아무리 중요해도 미세하게는 감쇠)
 * - strength가 0.1 이하이면 감소하지 않음 (최소값 보장)
 *
 * 예시 (episodic, base=0.95):
 *   감정 없음, importance=0.5 → factor 0.9575 (일반 감쇠)
 *   감정 0.8,  importance=0.5 → factor 0.9735 (느린 감쇠)
 *   감정 1.0,  importance=0.8 → factor 0.982  (아주 느린 감쇠)
 */
export async function decayMemoryStrength(scope: MemoryScope) {
  // 영구 기억: decay 비활성화 — 모든 기억의 강도를 유지
  return;
}

/**
 * 약한 기억 정리 (Pruning)
 *
 * 1. strength가 임계값 이하이고 한번도 언급되지 않은 기억 삭제
 * 2. 세션당 최대 기억 수 초과 시 중요도/강도 낮은 것부터 삭제
 */
export async function pruneWeakMemories(
  scope: MemoryScope,
  options: {
    minStrength?: number;
    maxPerScope?: number;
  } = {}
): Promise<number> {
  // 영구 기억: 삭제 비활성화 — 모든 기억을 DB에 보존
  return 0;
}

// ============================================================
// 기억 진화 (A-MEM: Memory Evolution)
// ============================================================

/**
 * 유사 기억 통합 (Consolidation)
 * 동일 캐릭터의 유사 episodic 기억 그룹을 하나의 semantic 기억으로 병합
 */
export async function consolidateMemories(scope: MemoryScope): Promise<number> {
  const characters = await prisma.characterMemory.findMany({
    where: { userId: scope.userId, workId: scope.workId },
    select: { characterId: true },
    distinct: ['characterId'],
  });

  let totalConsolidated = 0;

  for (const { characterId } of characters) {
    const memories = await prisma.characterMemory.findMany({
      where: { userId: scope.userId, workId: scope.workId, characterId, memoryType: 'episodic' },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    const used = new Set<string>();
    const groups: (typeof memories)[] = [];

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

    for (const group of groups) {
      const bestMemory = group.reduce((a, b) => a.importance > b.importance ? a : b);
      const combinedInterpretation = group.map(m => m.interpretation).join(' / ');
      const maxImportance = Math.max(...group.map(m => m.importance));
      const totalMentions = group.reduce((sum, m) => sum + m.mentionedCount, 0);

      await prisma.characterMemory.create({
        data: {
          sessionId: scope.sessionId,
          userId: scope.userId,
          workId: scope.workId,
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

      // 영구 기억: 원본 에피소드 삭제하지 않음 (semantic 통합본만 추가)

      totalConsolidated += group.length;
    }
  }

  if (totalConsolidated > 0) {
    console.log(`[MemoryEvolution] Consolidated ${totalConsolidated} memories`);
  }
  return totalConsolidated;
}

/**
 * 반복 언급 기억 승격 (Promotion)
 * episodic 중 mentionedCount >= 3인 기억을 semantic으로 승격
 */
export async function promoteMemories(scope: MemoryScope): Promise<number> {
  const result = await prisma.characterMemory.updateMany({
    where: {
      userId: scope.userId,
      workId: scope.workId,
      memoryType: 'episodic',
      mentionedCount: { gte: 3 },
    },
    data: {
      memoryType: 'semantic',
      importance: 0.8,
    },
  });

  if (result.count > 0) {
    console.log(`[MemoryEvolution] Promoted ${result.count} memories to semantic`);
  }
  return result.count;
}

/**
 * 만료된 이미지 캐시 정리
 */
export async function cleanExpiredImageCache(): Promise<number> {
  const result = await prisma.generatedImageCache.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  if (result.count > 0) {
    console.log(`[ImageCache] Cleaned ${result.count} expired entries`);
  }
  return result.count;
}

// ============================================================
// 서사 컨텍스트 생성 (Gemini 프롬프트용)
// ============================================================

/**
 * 캐릭터를 위한 서사 컨텍스트 생성
 *
 * 이 함수가 반환하는 정보를 Gemini 프롬프트에 주입하여
 * 캐릭터가 "기억을 바탕으로 대화"할 수 있게 함
 */
export async function buildNarrativeContext(
  scope: MemoryScope,
  characterId: string,
  characterName: string,
  userMessage?: string,
  cachedEmbedding?: number[],
  cachedScene?: SceneContext | null,
): Promise<{
  relationship: RelationshipState;
  recentMemories: Array<{ interpretation: string; importance: number }>;
  sceneContext: SceneContext | null;
  narrativePrompt: string;
}> {
  // 1. 관계 상태 가져오기 (크로스세션)
  const relationship = await getOrCreateRelationship(scope, characterId, characterName);

  // 2. 임베딩: 캐시된 것 사용, 없으면 생성 (1회만)
  let queryEmbedding: number[] | undefined = cachedEmbedding && cachedEmbedding.length > 0
    ? cachedEmbedding
    : undefined;
  if (!queryEmbedding && userMessage) {
    queryEmbedding = await generateEmbedding(userMessage);
    if (queryEmbedding.length === 0) queryEmbedding = undefined;
  }

  // 3. 기억 검색 (크로스세션, 임베딩 기반 또는 importance 폴백)
  const recentMemories = await searchCharacterMemories({
    scope,
    characterId,
    queryEmbedding,
    limit: 10,
    minImportance: 0.3,
  });

  // 4. 장면 정보: 캐시된 것 사용, 없으면 조회 (세션 스코프 유지)
  const sceneContext = cachedScene !== undefined ? cachedScene : await getActiveScene(scope.sessionId);

  // 5. 서사 프롬프트 생성
  const narrativePrompt = generateNarrativePrompt(
    characterName,
    relationship,
    recentMemories,
    sceneContext
  );

  return {
    relationship,
    recentMemories,
    sceneContext,
    narrativePrompt,
  };
}

/**
 * 서사 프롬프트 생성 (Gemini에 주입할 컨텍스트)
 */
function generateNarrativePrompt(
  characterName: string,
  relationship: RelationshipState,
  memories: Array<{ interpretation: string; importance: number }>,
  scene: SceneContext | null
): string {
  const parts: string[] = [];
  parts.push(`[${characterName}] 신뢰${relationship.trust.toFixed(0)} 호감${relationship.affection.toFixed(0)} 존경${relationship.respect.toFixed(0)} 경쟁${relationship.rivalry.toFixed(0)} 친숙${relationship.familiarity.toFixed(0)}`);
  if (relationship.knownFacts.length > 0) parts.push(`사실: ${relationship.knownFacts.join('; ')}`);
  if (memories.length > 0) parts.push(`기억: ${memories.map(m => m.interpretation).join('; ')}`);
  if (relationship.sharedExperiences.length > 0) parts.push(`경험: ${relationship.sharedExperiences.slice(-30).join('; ')}`);
  return parts.join('\n');
}

/**
 * 친밀도 레벨 번역
 */
function translateIntimacyLevel(level: string): string {
  const translations: Record<string, string> = {
    stranger: '처음 만난 사이',
    acquaintance: '아는 사이',
    friend: '친구',
    close_friend: '절친한 친구',
    intimate: '특별한 사이',
  };
  return translations[level] || level;
}

// ============================================================
// 대화 분석 및 기억 추출 (Gemini 응답 후 호출)
// ============================================================

/**
 * 대화에서 중요 정보 추출하여 기억 저장
 *
 * AI 응답 후에 호출하여:
 * 1. Personal facts → knownFacts (Identity/Moment 분류)
 * 2. Action facts → sharedExperiences (행동/상황/약속)
 * 3. 감정적 순간 → 관계 변화 기록
 * 4. 캐릭터 해석 → CharacterMemory에 저장
 */
export async function processConversationForMemory(params: {
  scope: MemoryScope;
  sceneId?: string;
  userMessage: string;
  characterResponses: Array<{
    characterId: string;
    characterName: string;
    content: string;
    emotion?: { primary: string; intensity: number };
    relationshipDelta?: {
      trust?: number;
      affection?: number;
      respect?: number;
      rivalry?: number;
      familiarity?: number;
    };
  }>;
  extractedFacts?: string[];
  emotionalMoment?: boolean;
}): Promise<MemoryProcessingResult[]> {
  const { scope, sceneId, userMessage, characterResponses, extractedFacts, emotionalMoment } =
    params;

  // extractedFacts를 Personal(knownFacts) / Action(sharedExperiences) 분리
  // Personal: 이름, 나이, 취미, 선호 등 유저의 속성 → knownFacts
  // Action: 행동, 약속, 계획, 상황 등 일시적 사건 → sharedExperiences
  const personalFacts = extractedFacts?.filter(f => !isActionFact(f));
  const actionFacts = extractedFacts?.filter(f => isActionFact(f));

  const results: MemoryProcessingResult[] = [];

  for (const response of characterResponses) {
    // 1. 관계 업데이트 (다축, 크로스세션)
    const delta = response.relationshipDelta || {};
    const relDelta = {
      trustDelta: delta.trust || 0,
      affectionDelta: delta.affection || (emotionalMoment ? 3 : 1),
      respectDelta: delta.respect || 0,
      rivalryDelta: delta.rivalry || 0,
      familiarityDelta: delta.familiarity || 0.5,
    };
    await updateRelationship(scope, response.characterId, sceneId, {
      ...relDelta,
      newFacts: personalFacts && personalFacts.length > 0 ? personalFacts : undefined,
      newExperience: actionFacts && actionFacts.length > 0 ? actionFacts.join(' | ') : undefined,
    });

    // 2. 감정 히스토리 누적
    if (response.emotion) {
      try {
        const rel = await prisma.userCharacterRelationship.findFirst({
          where: { userId: scope.userId, workId: scope.workId, characterId: response.characterId },
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
      } catch (e) {
        console.error('[EmotionHistory] update failed:', e);
      }
    }

    // 3. 캐릭터 기억 저장 (캐릭터 해석은 추후 AI로 생성)
    let surpriseResult: { action: 'reinforce' | 'skip' | 'save' | 'no_facts'; surpriseScore: number; adjustedImportance: number } = { action: 'no_facts', surpriseScore: 0, adjustedImportance: 0 };
    if (extractedFacts && extractedFacts.length > 0) {
      // 간단한 해석 생성 (추후 AI로 고도화)
      const interpretation = `유저가 "${extractedFacts.join(', ')}"에 대해 이야기했다`;

      // emotion 타입 변환 (primary → emotion)
      const emotionalResponse = response.emotion
        ? { emotion: response.emotion.primary, intensity: response.emotion.intensity }
        : undefined;

      surpriseResult = await saveCharacterMemory({
        scope,
        characterId: response.characterId,
        sceneId,
        originalEvent: userMessage,
        interpretation,
        emotionalResponse,
        importance: emotionalMoment ? 0.8 : 0.5,
        keywords: extractedFacts,
      });
    }

    results.push({
      characterId: response.characterId,
      characterName: response.characterName,
      surpriseAction: surpriseResult.action,
      surpriseScore: surpriseResult.surpriseScore,
      adjustedImportance: surpriseResult.adjustedImportance,
      relationshipUpdate: relDelta,
      newFactsCount: extractedFacts?.length || 0,
    });
  }

  // 4. 장면 토픽 업데이트
  if (sceneId && extractedFacts && extractedFacts.length > 0) {
    await updateScene(sceneId, { topics: extractedFacts });
  }

  return results;
}

export default {
  // 대화 로그
  saveConversationLog,

  // Scene 관리
  startScene,
  getActiveScene,
  updateScene,
  endScene,

  // 관계 관리
  getOrCreateRelationship,
  updateRelationship,
  getAllRelationships,

  // 기억 관리
  saveCharacterMemory,
  searchCharacterMemories,
  markMemoryMentioned,
  pruneWeakMemories,
  consolidateMemories,
  promoteMemories,

  // 캐시 관리
  cleanExpiredImageCache,

  // 컨텍스트 생성
  buildNarrativeContext,

  // 대화 처리
  processConversationForMemory,
};
