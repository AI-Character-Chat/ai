import prisma from '@/lib/prisma';
import {
  generateSessionSummary,
  StoryTurn,
} from '@/lib/gemini';
import {
  formatConversationHistory,
  filterActiveLorebookEntries,
  extractRecentText,
  findRelevantMessages,
  buildSelectiveHistory,
  MessageWithCharacter,
} from '@/lib/prompt-builder';
import {
  buildNarrativeContext,
  processConversationForMemory,
  decayMemoryStrength,
  pruneWeakMemories,
  consolidateMemories,
  promoteMemories,
  getActiveScene,
  SceneContext,
  MemoryScope,
  MemoryProcessingResult,
} from '@/lib/narrative-memory';
import { LorebookEntry, Character } from '@prisma/client';

// 요약 Race Condition 방지
const summarizingSessionIds = new Set<string>();

async function triggerSummary(
  sessionId: string,
  messages: Array<{ messageType: string; content: string; character?: { name: string } | null }>,
  existingSummary?: string
) {
  if (summarizingSessionIds.has(sessionId)) return;
  summarizingSessionIds.add(sessionId);

  try {
    const summaryMessages = messages.map(m => ({
      role: m.messageType,
      content: m.content,
      characterName: m.character?.name,
    }));
    const summary = await generateSessionSummary(summaryMessages, existingSummary);
    if (summary) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { sessionSummary: summary },
      });
    }
  } catch (e) {
    console.error('[Summary] Trigger summary failed:', e);
  } finally {
    summarizingSessionIds.delete(sessionId);
  }
}

export interface ChatContextParams {
  sessionId: string;
  content: string;
  session: {
    userName: string;
    intimacy: number;
    turnCount: number;
    userPersona: string | null;
    work: { lorebook: LorebookEntry[] };
  };
  olderMessages: MessageWithCharacter[];
  recentMessages: MessageWithCharacter[];
  presentCharacters: string[];
  characters: Character[];
  queryEmbedding: number[];
  authUserId: string;
  workId: string;
}

export type UserPersona = { name: string; age: number | null; gender: string; description: string | null };

export interface CharacterMemoryDebug {
  characterId: string;
  characterName: string;
  relationship: {
    intimacyLevel: string;
    trust: number;
    affection: number;
    respect: number;
    rivalry: number;
    familiarity: number;
  };
  recentMemoriesCount: number;
  recentMemories: Array<{ interpretation: string; importance: number }>;
  emotionalHistory: Array<{ emotion: string; intensity: number; at: string }>;
  knownFacts: string[];
}

export interface ChatContextResult {
  conversationHistory: string;
  lorebookContext: string;
  memoryPrompts: string[];
  presentChars: Character[];
  relevantHistory: MessageWithCharacter[];
  preScene: SceneContext | null;
  effectiveUserName: string;
  userPersona: UserPersona | undefined;
  previousPresentCharacters: string[];
  characterMemoryDebug: CharacterMemoryDebug[];
}

export async function buildChatContext(params: ChatContextParams): Promise<ChatContextResult> {
  const {
    sessionId,
    content,
    session,
    olderMessages,
    recentMessages,
    presentCharacters,
    characters,
    queryEmbedding,
    authUserId,
    workId,
  } = params;

  // 크로스세션 메모리 스코프
  const memoryScope: MemoryScope = { userId: authUserId, workId, sessionId };

  // 유저 페르소나 (한 번만 파싱, route.ts에서도 재사용)
  let userPersona: UserPersona | undefined;
  try {
    const parsed = JSON.parse(session.userPersona || '{}');
    if (parsed.name) userPersona = parsed;
  } catch { /* ignore */ }

  const effectiveUserName = userPersona?.name || session.userName;

  // 이전 대화에 등장한 캐릭터 (buildContents에서 사용)
  const appearedCharactersInHistory = new Set<string>();
  recentMessages.forEach(msg => {
    if (msg.character?.name) appearedCharactersInHistory.add(msg.character.name);
  });
  const previousPresentCharacters = Array.from(appearedCharactersInHistory);

  // [1] 선별적 대화 히스토리 빌드
  const immediateIds = new Set(recentMessages.map((m) => m.id as string));
  const relevantHistory = findRelevantMessages(
    olderMessages,
    immediateIds,
    queryEmbedding,
    5
  );

  const conversationHistory = relevantHistory.length > 0
    ? buildSelectiveHistory(relevantHistory, recentMessages, effectiveUserName)
    : formatConversationHistory(recentMessages, effectiveUserName);

  const recentText = extractRecentText(recentMessages, content);
  const lorebookContext = filterActiveLorebookEntries(
    session.work.lorebook,
    recentText,
    session.intimacy,
    session.turnCount,
    presentCharacters
  );

  // [2] narrative-memory: 캐릭터별 기억 수집 + 장면 정보 (병렬)
  const presentChars = characters.filter((c) =>
    presentCharacters.includes(c.name) ||
    presentCharacters.some((pc) => c.name.includes(pc) || pc.includes(c.name.split(' ')[0]))
  );

  const preScene = await getActiveScene(sessionId).catch(() => null);

  const narrativeContexts = await Promise.all(
    presentChars.map((c) =>
      buildNarrativeContext(memoryScope, c.id, c.name, content, queryEmbedding, preScene)
        .catch((e) => {
           console.error(`[NarrativeMemory] Build context failed for ${c.name}:`, e);
           return { narrativePrompt: '', relationship: null, recentMemories: [], sceneContext: null };
        })
    )
  );

  const memoryPrompts = narrativeContexts
    .map((ctx) => ctx.narrativePrompt)
    .filter((p) => p.length > 0);

  // 메모리 디버그 데이터 수집 (buildNarrativeContext 결과에서 추출)
  const characterMemoryDebug: CharacterMemoryDebug[] = narrativeContexts.map((ctx, i) => ({
    characterId: presentChars[i].id,
    characterName: presentChars[i].name,
    relationship: ctx.relationship ? {
      intimacyLevel: ctx.relationship.intimacyLevel,
      trust: ctx.relationship.trust,
      affection: ctx.relationship.affection,
      respect: ctx.relationship.respect,
      rivalry: ctx.relationship.rivalry,
      familiarity: ctx.relationship.familiarity,
    } : { intimacyLevel: 'stranger', trust: 50, affection: 50, respect: 50, rivalry: 0, familiarity: 0 },
    recentMemoriesCount: ctx.recentMemories.length,
    recentMemories: ctx.recentMemories,
    emotionalHistory: ctx.relationship?.emotionalHistory || [],
    knownFacts: ctx.relationship?.knownFacts || [],
  }));

  return {
    conversationHistory,
    lorebookContext,
    memoryPrompts,
    presentChars,
    relevantHistory,
    preScene,
    effectiveUserName,
    userPersona,
    previousPresentCharacters,
    characterMemoryDebug,
  };
}

export interface ImmediateMemoryParams {
  sessionId: string;
  preSceneId?: string;
  content: string;
  allTurns: StoryTurn[];
  session: {
    workId: string;
    proAnalysis: string | null;
  };
  authUserId: string;
  workId: string;
  extractedFacts?: string[];
}

/**
 * 즉시 메모리 처리 (동기, surprise 결과 반환)
 * SSE 종료 전에 호출되어 memory_update 이벤트로 결과 전송
 */
export async function processImmediateMemory(params: ImmediateMemoryParams): Promise<MemoryProcessingResult[]> {
  const { sessionId, preSceneId, content, allTurns, session, authUserId, workId, extractedFacts } = params;
  const memoryScope: MemoryScope = { userId: authUserId, workId, sessionId };
  const dialogueTurns = allTurns.filter((t) => t.type === 'dialogue');

  // Pro 분석에서 다축 관계 델타 추출
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

  return await processConversationForMemory({
    scope: memoryScope,
    sceneId: preSceneId,
    userMessage: content,
    characterResponses: dialogueTurns.map((t) => ({
      characterId: t.characterId,
      characterName: t.characterName,
      content: t.content,
      emotion: t.emotion ? { primary: t.emotion.primary, intensity: t.emotion.intensity } : undefined,
      relationshipDelta: relationshipDeltas[t.characterName] || undefined,
    })),
    extractedFacts: extractedFacts && extractedFacts.length > 0 ? extractedFacts : undefined,
    emotionalMoment: dialogueTurns.some((t) =>
      ['sad', 'angry', 'surprised', 'happy'].includes(t.emotion.primary) && t.emotion.intensity > 0.7
    ),
  });
}

export interface BackgroundTaskParams {
  sessionId: string;
  session: {
    workId: string;
    turnCount: number;
    sessionSummary: string | null;
  };
  authUserId: string;
  workId: string;
  recentMessages: MessageWithCharacter[];
}

/**
 * 백그라운드 작업 (fire-and-forget)
 * 세션 요약, 기억 감쇠, 통합, 정리 등
 */
export async function processRemainingBackgroundTasks(params: BackgroundTaskParams) {
  const { sessionId, session, authUserId, workId, recentMessages } = params;
  const memoryScope: MemoryScope = { userId: authUserId, workId, sessionId };

  // [A] 5턴마다: 세션 요약 + 기억 감쇠 (비동기)
  const newTurnCount = session.turnCount + 1;
  if (newTurnCount % 5 === 0) {
    triggerSummary(sessionId, recentMessages, session.sessionSummary || undefined)
      .catch((e) => console.error('[Summary] Trigger failed:', e));
    decayMemoryStrength(memoryScope)
      .catch((e) => console.error('[NarrativeMemory] Decay failed:', e));
  }

  // [B] 10턴마다: 기억 진화 — 통합 + 승격 (A-MEM)
  if (newTurnCount % 10 === 0) {
    consolidateMemories(memoryScope).catch((e) => console.error('[NarrativeMemory] Consolidate failed:', e));
    promoteMemories(memoryScope).catch((e) => console.error('[NarrativeMemory] Promote failed:', e));
  }

  // [C] 25턴마다: 약한 기억 정리 (비동기)
  if (newTurnCount % 25 === 0) {
    pruneWeakMemories(memoryScope)
      .catch((e) => console.error('[NarrativeMemory] Prune failed:', e));
  }
}
