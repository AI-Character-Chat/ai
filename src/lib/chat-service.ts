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
} from '@/lib/narrative-memory';
import {
  searchMemoriesForCharacters,
  formatMem0ForPrompt,
  addMemory,
  isMem0Available,
  pruneMemories as pruneMem0Memories,
} from '@/lib/memory';
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
}

export type UserPersona = { name: string; age: number | null; gender: string; description: string | null };

export interface ChatContextResult {
  conversationHistory: string;
  lorebookContext: string;
  memoryPrompts: string[];
  mem0Context: string;
  mem0SearchMs: number;
  mem0MemoriesFound: number;
  presentChars: Character[];
  relevantHistory: MessageWithCharacter[];
  preScene: SceneContext | null;
  effectiveUserName: string;
  userPersona: UserPersona | undefined;
  previousPresentCharacters: string[];
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
  } = params;

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

  const mem0SearchStart = Date.now();
  const preScene = await getActiveScene(sessionId).catch(() => null);

  const [narrativeContexts, mem0Results] = await Promise.all([
    Promise.all(
      presentChars.map((c) =>
        buildNarrativeContext(sessionId, c.id, c.name, content, queryEmbedding, preScene)
          .catch((e) => {
             console.error(`[NarrativeMemory] Build context failed for ${c.name}:`, e);
             return { narrativePrompt: '', relationship: null, recentMemories: [], sceneContext: null };
          })
      )
    ),
    isMem0Available()
      ? searchMemoriesForCharacters(
          content,
          authUserId,
          presentChars.map((c) => ({ id: c.id, name: c.name })),
        ).catch((e) => {
          console.error('[Mem0] Search failed:', e);
          return new Map<string, string[]>();
        })
      : Promise.resolve(new Map<string, string[]>()),
  ]);

  const mem0SearchMs = Date.now() - mem0SearchStart;
  const memoryPrompts = narrativeContexts
    .map((ctx) => ctx.narrativePrompt)
    .filter((p) => p.length > 0);

  const charNameMap = new Map(presentChars.map((c) => [c.id, c.name]));
  const mem0Context = formatMem0ForPrompt(mem0Results, charNameMap);
  const mem0MemoriesFound = Array.from(mem0Results.values()).reduce((s, m) => s + m.length, 0);

  return {
    conversationHistory,
    lorebookContext,
    memoryPrompts,
    mem0Context,
    mem0SearchMs,
    mem0MemoriesFound,
    presentChars,
    relevantHistory,
    preScene,
    effectiveUserName,
    userPersona,
    previousPresentCharacters,
  };
}

export interface BackgroundTaskParams {
  sessionId: string;
  preSceneId?: string;
  content: string;
  allTurns: StoryTurn[];
  session: {
    workId: string;
    turnCount: number;
    sessionSummary: string | null;
    proAnalysis: string | null;
  };
  authUserId: string;
  presentChars: Character[];
  recentMessages: MessageWithCharacter[];
  extractedFacts?: string[];
}

export async function processBackgroundTasks(params: BackgroundTaskParams) {
  const {
    sessionId,
    preSceneId,
    content,
    allTurns,
    session,
    authUserId,
    presentChars,
    recentMessages,
    extractedFacts,
  } = params;

  // [A] 캐릭터 기억 업데이트 (매 턴)
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

  processConversationForMemory({
    sessionId,
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
  }).catch((e) => console.error('[NarrativeMemory] processConversation failed:', e));

  // [A-2] mem0 장기 기억 저장 (캐릭터별, fire-and-forget)
  if (isMem0Available() && dialogueTurns.length > 0) {
    dialogueTurns.forEach((t) => {
      addMemory(
        [
          { role: 'user', content },
          { role: 'assistant', content: `[${t.characterName}] ${t.content}` },
        ],
        authUserId,
        t.characterId,
        { work_id: session.workId, character_name: t.characterName },
      ).catch((e) => console.error(`[Mem0] save failed for ${t.characterName}:`, e));
    });
  }

  // [B] 5턴마다: 세션 요약 + 기억 감쇠 (비동기)
  const newTurnCount = session.turnCount + 1;
  if (newTurnCount % 5 === 0) {
    triggerSummary(sessionId, recentMessages, session.sessionSummary || undefined)
      .catch((e) => console.error('[Summary] Trigger failed:', e));
    decayMemoryStrength(sessionId)
      .catch((e) => console.error('[NarrativeMemory] Decay failed:', e));
  }

  // [D] 10턴마다: 기억 진화 — 통합 + 승격 (A-MEM)
  if (newTurnCount % 10 === 0) {
    consolidateMemories(sessionId).catch((e) => console.error('[NarrativeMemory] Consolidate failed:', e));
    promoteMemories(sessionId).catch((e) => console.error('[NarrativeMemory] Promote failed:', e));
  }

  // [C] 25턴마다: 약한 기억 정리 (비동기)
  if (newTurnCount % 25 === 0) {
    pruneWeakMemories(sessionId)
      .catch((e) => console.error('[NarrativeMemory] Prune failed:', e));

    // mem0 기억 정리 (캐릭터당 최대 100개)
    if (isMem0Available()) {
      presentChars.forEach((c) => {
        pruneMem0Memories(authUserId, c.id, 100).catch((e) => console.error(`[Mem0] Prune failed for ${c.name}:`, e));
      });
    }
  }
}
