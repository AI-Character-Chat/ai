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
 * 캐릭터와의 관계 가져오기 (없으면 생성)
 */
export async function getOrCreateRelationship(
  sessionId: string,
  characterId: string,
  characterName: string
): Promise<RelationshipState> {
  let relationship = await prisma.userCharacterRelationship.findUnique({
    where: {
      sessionId_characterId: { sessionId, characterId },
    },
  });

  if (!relationship) {
    relationship = await prisma.userCharacterRelationship.create({
      data: {
        sessionId,
        characterId,
        intimacyLevel: 'stranger',
        intimacyScore: 0,
        speechStyle: 'formal',
      },
    });
  }

  return {
    characterId: relationship.characterId,
    characterName,
    intimacyLevel: relationship.intimacyLevel,
    intimacyScore: relationship.intimacyScore,
    trust: relationship.trust,
    affection: relationship.affection,
    respect: relationship.respect,
    rivalry: relationship.rivalry,
    familiarity: relationship.familiarity,
    relationshipLabel: relationship.relationshipLabel || undefined,
    speechStyle: relationship.speechStyle,
    nicknameForUser: relationship.nicknameForUser || undefined,
    knownFacts: JSON.parse(relationship.knownFacts),
    sharedExperiences: JSON.parse(relationship.sharedExperiences),
    emotionalHistory: JSON.parse(relationship.emotionalHistory || '[]'),
  };
}

/**
 * 관계 상태 업데이트
 */
export async function updateRelationship(
  sessionId: string,
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
  const relationship = await prisma.userCharacterRelationship.findUnique({
    where: { sessionId_characterId: { sessionId, characterId } },
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

  // 새로 알게 된 사실
  if (updates.newFacts && updates.newFacts.length > 0) {
    const existingFacts: string[] = JSON.parse(relationship.knownFacts);
    const combinedFacts = existingFacts.concat(updates.newFacts);
    const allFacts = Array.from(new Set(combinedFacts));
    data.knownFacts = JSON.stringify(allFacts);
  }

  // 공유 경험 추가
  if (updates.newExperience) {
    const experiences: string[] = JSON.parse(relationship.sharedExperiences);
    experiences.push(updates.newExperience);
    // 최근 20개만 유지
    data.sharedExperiences = JSON.stringify(experiences.slice(-20));
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
 * 세션의 모든 캐릭터 관계 가져오기
 */
export async function getAllRelationships(sessionId: string): Promise<RelationshipState[]> {
  const relationships = await prisma.userCharacterRelationship.findMany({
    where: { sessionId },
    include: { character: true },
  });

  return relationships.map((r) => ({
    characterId: r.characterId,
    characterName: r.character.name,
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
  }));
}

// ============================================================
// 캐릭터별 기억 관리 (성격 필터 기반)
// ============================================================

/**
 * 유사 기억 강화 (A-MEM: Reinforcement)
 * 새 기억과 유사한 기존 기억이 있으면 강화하고 새 저장 생략
 */
async function reinforceMemory(
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
      await prisma.characterMemory.update({
        where: { id: mem.id },
        data: {
          strength: Math.min(1.0, mem.strength + 0.2),
          importance: Math.min(1.0, Math.max(mem.importance, newImportance)),
          mentionedCount: { increment: 1 },
          lastMentioned: new Date(),
        },
      });
      return true;
    }
  }
  return false;
}

/**
 * 캐릭터의 기억 저장 (캐릭터 성격 필터 적용)
 *
 * 같은 사건이라도 캐릭터마다 다르게 해석하여 저장
 * A-MEM: 유사 기억이 있으면 강화, 없으면 새로 저장
 */
export async function saveCharacterMemory(params: {
  sessionId: string;
  characterId: string;
  sceneId?: string;
  originalEvent: string;
  interpretation: string;
  emotionalResponse?: { emotion: string; intensity: number };
  memoryType?: 'episodic' | 'semantic' | 'emotional';
  importance?: number;
  keywords?: string[];
}) {
  // 임베딩 생성 (interpretation 기반 — 캐릭터 관점의 해석이 검색 키)
  const embedding = await generateEmbedding(params.interpretation);

  // A-MEM: 유사 기억이 있으면 강화하고 새 저장 생략
  const reinforced = await reinforceMemory(
    params.sessionId, params.characterId, embedding, params.importance || 0.5
  );
  if (reinforced) return null;

  return await prisma.characterMemory.create({
    data: {
      sessionId: params.sessionId,
      characterId: params.characterId,
      sceneId: params.sceneId,
      originalEvent: params.originalEvent,
      interpretation: params.interpretation,
      emotionalResponse: params.emotionalResponse
        ? JSON.stringify(params.emotionalResponse)
        : null,
      memoryType: params.memoryType || 'episodic',
      importance: params.importance || 0.5,
      keywords: JSON.stringify(params.keywords || []),
      embedding: JSON.stringify(embedding),
    },
  });
}

/**
 * 캐릭터의 관련 기억 검색
 * queryEmbedding이 있으면 의미 유사도 기반, 없으면 importance 기반 폴백
 */
export async function searchCharacterMemories(params: {
  sessionId: string;
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
      sessionId: params.sessionId,
      characterId: params.characterId,
      ...(params.memoryType && { memoryType: params.memoryType }),
      ...(params.minImportance && { importance: { gte: params.minImportance } }),
    },
    orderBy: [{ importance: 'desc' }, { createdAt: 'desc' }],
    // 임베딩 검색 시 전체 로드 후 인메모리 정렬 (최대 100개)
    take: params.queryEmbedding?.length ? 100 : (params.limit || 10),
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
 * 기억 강도 자연 감소 (Memory Decay)
 *
 * 매 턴마다 호출하여 기억 강도를 자연스럽게 감소시킴
 * - episodic (일화적): factor 0.95 (빠르게 감소)
 * - semantic (의미적): factor 0.98 (느리게 감소)
 * - emotional (감정적): factor 0.97 (중간)
 * - strength가 0.1 이하이면 감소하지 않음 (최소값 보장)
 */
export async function decayMemoryStrength(sessionId: string) {
  const decayFactors: Record<string, number> = {
    episodic: 0.95,
    semantic: 0.98,
    emotional: 0.97,
  };

  for (const [memoryType, factor] of Object.entries(decayFactors)) {
    await prisma.$executeRawUnsafe(
      `UPDATE "CharacterMemory" SET strength = strength * $1 WHERE "sessionId" = $2 AND "memoryType" = $3 AND strength > 0.1`,
      factor,
      sessionId,
      memoryType
    );
  }
}

/**
 * 약한 기억 정리 (Pruning)
 *
 * 1. strength가 임계값 이하이고 한번도 언급되지 않은 기억 삭제
 * 2. 세션당 최대 기억 수 초과 시 중요도/강도 낮은 것부터 삭제
 */
export async function pruneWeakMemories(
  sessionId: string,
  options: {
    minStrength?: number;
    maxPerSession?: number;
  } = {}
): Promise<number> {
  const { minStrength = 0.15, maxPerSession = 100 } = options;

  // 1. 약한 기억 삭제 (strength < 임계값 + 한번도 언급 안됨)
  const deletedWeak = await prisma.characterMemory.deleteMany({
    where: {
      sessionId,
      strength: { lt: minStrength },
      mentionedCount: 0,
    },
  });

  // 2. 세션당 최대 수 초과 시 오래된 것 삭제
  const totalCount = await prisma.characterMemory.count({ where: { sessionId } });
  let deletedOverflow = 0;

  if (totalCount > maxPerSession) {
    const oldMemories = await prisma.characterMemory.findMany({
      where: { sessionId },
      orderBy: [{ importance: 'asc' }, { strength: 'asc' }, { createdAt: 'asc' }],
      take: totalCount - maxPerSession,
      select: { id: true },
    });

    if (oldMemories.length > 0) {
      const result = await prisma.characterMemory.deleteMany({
        where: { id: { in: oldMemories.map((m) => m.id) } },
      });
      deletedOverflow = result.count;
    }
  }

  const totalDeleted = deletedWeak.count + deletedOverflow;
  if (totalDeleted > 0) {
    console.log(
      `[NarrativeMemory] Pruned ${totalDeleted} memories (weak: ${deletedWeak.count}, overflow: ${deletedOverflow})`
    );
  }

  return totalDeleted;
}

// ============================================================
// 기억 진화 (A-MEM: Memory Evolution)
// ============================================================

/**
 * 유사 기억 통합 (Consolidation)
 * 동일 캐릭터의 유사 episodic 기억 그룹을 하나의 semantic 기억으로 병합
 */
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

/**
 * 반복 언급 기억 승격 (Promotion)
 * episodic 중 mentionedCount >= 3인 기억을 semantic으로 승격
 */
export async function promoteMemories(sessionId: string): Promise<number> {
  const result = await prisma.characterMemory.updateMany({
    where: {
      sessionId,
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
  sessionId: string,
  characterId: string,
  characterName: string,
  userMessage?: string
): Promise<{
  relationship: RelationshipState;
  recentMemories: Array<{ interpretation: string; importance: number }>;
  sceneContext: SceneContext | null;
  narrativePrompt: string;
}> {
  // 1. 관계 상태 가져오기
  const relationship = await getOrCreateRelationship(sessionId, characterId, characterName);

  // 2. 유저 입력 임베딩 생성 (있을 때만)
  let queryEmbedding: number[] | undefined;
  if (userMessage) {
    queryEmbedding = await generateEmbedding(userMessage);
    if (queryEmbedding.length === 0) queryEmbedding = undefined; // 실패 시 폴백
  }

  // 3. 기억 검색 (임베딩 기반 또는 importance 폴백)
  const recentMemories = await searchCharacterMemories({
    sessionId,
    characterId,
    queryEmbedding,
    limit: 5,
    minImportance: 0.3,
  });

  // 4. 현재 장면 정보
  const sceneContext = await getActiveScene(sessionId);

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
  const lines: string[] = [];

  // 관계 상태 (다축)
  lines.push(`[${characterName}의 유저에 대한 인식]`);
  lines.push(`- 관계 단계: ${translateIntimacyLevel(relationship.intimacyLevel)}`);
  lines.push(`- 신뢰: ${relationship.trust.toFixed(0)} | 호감: ${relationship.affection.toFixed(0)} | 존경: ${relationship.respect.toFixed(0)} | 경쟁심: ${relationship.rivalry.toFixed(0)} | 친숙도: ${relationship.familiarity.toFixed(0)}`);

  // 관계 특성 요약 (높은/낮은 축 강조)
  const traits: string[] = [];
  if (relationship.trust >= 70) traits.push('깊이 신뢰함');
  else if (relationship.trust <= 30) traits.push('불신');
  if (relationship.affection >= 70) traits.push('강한 애착');
  if (relationship.respect >= 70) traits.push('높은 존경');
  if (relationship.rivalry >= 50) traits.push('라이벌 의식');
  if (traits.length > 0) lines.push(`- 핵심 감정: ${traits.join(', ')}`);

  if (relationship.relationshipLabel) {
    lines.push(`- 유저를 "${relationship.relationshipLabel}"(으)로 인식`);
  }

  // 말투 가이드
  const speechGuide = {
    formal: '존댓말, 조심스러운 태도',
    casual: '반말, 편한 태도',
    intimate: '애칭 사용, 친밀한 태도',
  };
  lines.push(`- 말투: ${speechGuide[relationship.speechStyle as keyof typeof speechGuide] || '상황에 맞게'}`);

  if (relationship.nicknameForUser) {
    lines.push(`- 유저를 "${relationship.nicknameForUser}"(이)라고 부름`);
  }

  // 알고 있는 정보
  if (relationship.knownFacts.length > 0) {
    lines.push(`\n[${characterName}이 유저에 대해 알고 있는 것]`);
    relationship.knownFacts.slice(-5).forEach((fact) => {
      lines.push(`- ${fact}`);
    });
  }

  // 최근 기억 (캐릭터 해석)
  if (memories.length > 0) {
    lines.push(`\n[${characterName}의 최근 기억]`);
    memories.forEach((m) => {
      lines.push(`- ${m.interpretation}`);
    });
  }

  // 공유 경험
  if (relationship.sharedExperiences.length > 0) {
    lines.push(`\n[함께한 중요한 순간들]`);
    relationship.sharedExperiences.slice(-3).forEach((exp) => {
      lines.push(`- ${exp}`);
    });
  }

  // 최근 감정 흐름
  if (relationship.emotionalHistory.length > 0) {
    lines.push(`\n[${characterName}의 최근 감정 흐름]`);
    const recentEmotions = relationship.emotionalHistory.slice(-5);
    lines.push(`- ${recentEmotions.map(e => `${e.emotion}(${(e.intensity * 100).toFixed(0)}%)`).join(' → ')}`);
  }

  // 현재 장면 분위기
  if (scene && scene.emotionalTone.mood) {
    lines.push(`\n[현재 장면 분위기]`);
    lines.push(`- ${scene.emotionalTone.mood} (강도: ${(scene.emotionalTone.intensity * 100).toFixed(0)}%)`);
  }

  return lines.join('\n');
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
 * 1. 유저가 언급한 새로운 정보 → knownFacts에 추가
 * 2. 감정적 순간 → 관계 변화 기록
 * 3. 캐릭터 해석 → CharacterMemory에 저장
 */
export async function processConversationForMemory(params: {
  sessionId: string;
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
  extractedFacts?: string[]; // AI가 추출한 새로운 정보들
  emotionalMoment?: boolean; // 감정적으로 중요한 순간인지
}) {
  const { sessionId, sceneId, userMessage, characterResponses, extractedFacts, emotionalMoment } =
    params;

  for (const response of characterResponses) {
    // 1. 관계 업데이트 (다축)
    const delta = response.relationshipDelta || {};
    await updateRelationship(sessionId, response.characterId, sceneId, {
      trustDelta: delta.trust || 0,
      affectionDelta: delta.affection || (emotionalMoment ? 3 : 1),
      respectDelta: delta.respect || 0,
      rivalryDelta: delta.rivalry || 0,
      familiarityDelta: delta.familiarity || 0.5,
      newFacts: extractedFacts,
    });

    // 2. 감정 히스토리 누적
    if (response.emotion) {
      try {
        const rel = await prisma.userCharacterRelationship.findUnique({
          where: { sessionId_characterId: { sessionId, characterId: response.characterId } },
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
    if (extractedFacts && extractedFacts.length > 0) {
      // 간단한 해석 생성 (추후 AI로 고도화)
      const interpretation = `유저가 "${extractedFacts.join(', ')}"에 대해 이야기했다`;

      // emotion 타입 변환 (primary → emotion)
      const emotionalResponse = response.emotion
        ? { emotion: response.emotion.primary, intensity: response.emotion.intensity }
        : undefined;

      await saveCharacterMemory({
        sessionId,
        characterId: response.characterId,
        sceneId,
        originalEvent: userMessage,
        interpretation,
        emotionalResponse,
        importance: emotionalMoment ? 0.8 : 0.5,
        keywords: extractedFacts,
      });
    }
  }

  // 3. 장면 토픽 업데이트
  if (sceneId && extractedFacts && extractedFacts.length > 0) {
    await updateScene(sceneId, { topics: extractedFacts });
  }
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
