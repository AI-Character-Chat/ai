/**
 * Pro 백그라운드 분석 API
 * 클라이언트가 Flash 응답 완료 후 호출
 * Pro(gemini-2.5-pro + thinking)로 서사 분석 → DB 저장 → 메트릭 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { buildSystemInstruction, generateProAnalysis, generateEmbedding } from '@/lib/gemini';
import { buildNarrativeContext, searchCharacterMemories, type MemoryScope } from '@/lib/narrative-memory';

export async function POST(request: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; messageId?: string; userMessage?: string; aiResponseSummary?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { sessionId, messageId, userMessage, aiResponseSummary } = body;
  if (!sessionId || !userMessage || !aiResponseSummary) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // 세션 + 작품 데이터 로드
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      work: { include: { characters: true } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }
  if (session.userId && session.userId !== authSession.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const characters = session.work.characters;

  // 유저 이름 결정
  let effectiveUserName = session.userName;
  try {
    const parsed = JSON.parse(session.userPersona || '{}');
    if (parsed.name) effectiveUserName = parsed.name;
  } catch { /* ignore */ }

  // systemInstruction 빌드 (Pro 분석용)
  const systemInstruction = buildSystemInstruction({
    worldSetting: session.work.worldSetting || '',
    characters: characters.map(c => ({ name: c.name, prompt: c.prompt })),
    lorebookStatic: '',
    userName: effectiveUserName,
  });

  const presentCharacters = JSON.parse(session.presentCharacters) as string[];
  const recentEvents = JSON.parse(session.recentEvents) as string[];

  // 메모리 컨텍스트 로드 (buildNarrativeContext + 임베딩 기반 기억 검색)
  let memoryContext = '';
  try {
    const scope: MemoryScope = {
      userId: authSession.user.id,
      workId: session.workId,
      sessionId: sessionId,
    };

    // 현재 턴 임베딩 생성 (1회, 모든 캐릭터에 재사용)
    const queryEmbedding = await generateEmbedding(userMessage);
    const embedding = queryEmbedding.length > 0 ? queryEmbedding : undefined;

    // 각 캐릭터별 풍부한 컨텍스트 + 주제 관련 기억 병렬 로드
    const contextResults = await Promise.all(
      characters.map(async (c) => {
        const [narrative, topicMemories] = await Promise.all([
          buildNarrativeContext(scope, c.id, c.name, userMessage, embedding),
          searchCharacterMemories({
            scope,
            characterId: c.id,
            queryEmbedding: embedding,
            limit: 5,
            minImportance: 0.3,
          }),
        ]);
        return { character: c, narrative, topicMemories };
      })
    );

    const parts = contextResults.map(({ character, narrative, topicMemories }) => {
      const rel = narrative.relationship;
      const lines: string[] = [`### ${character.name}`];

      // 관계 수치
      lines.push(`관계: ${rel.intimacyLevel} (친밀 ${rel.intimacyScore}, 신뢰 ${rel.trust}, 호감 ${rel.affection}, 존경 ${rel.respect}, 경쟁 ${rel.rivalry})`);

      // 핵심 사실 (Identity)
      const identityFacts = rel.knownFacts.filter(f =>
        /^(이름|나이|직업|성별|MBTI|고향|학교|생일):/i.test(f)
      );
      const otherFacts = rel.knownFacts.filter(f => !identityFacts.includes(f));
      if (identityFacts.length > 0) {
        lines.push(`핵심 정보: ${identityFacts.join(' | ')}`);
      }
      if (otherFacts.length > 0) {
        lines.push(`알고 있는 사실: ${otherFacts.join(', ')}`);
      }

      // 이번 턴 주제와 관련된 기억 (임베딩 검색 결과)
      if (topicMemories.length > 0) {
        lines.push(`이번 대화와 관련된 기억:`);
        topicMemories.forEach(m => {
          const sim = m.similarity ? `(관련도 ${(m.similarity * 100).toFixed(0)}%)` : '';
          lines.push(`  - ${m.interpretation} ${sim}`);
        });
      }

      // 함께한 경험
      if (rel.sharedExperiences.length > 0) {
        lines.push(`함께한 경험: ${rel.sharedExperiences.slice(-10).join(', ')}`);
      }

      // 감정 흐름
      if (rel.emotionalHistory.length > 0) {
        const emotions = rel.emotionalHistory.slice(-5);
        lines.push(`최근 감정 흐름: ${emotions.map(e => `${e.emotion}(${e.intensity})`).join(' → ')}`);
      }

      // 장면 분위기 (첫 캐릭터의 것만 — 동일 장면)
      if (narrative.sceneContext) {
        const tone = narrative.sceneContext.emotionalTone;
        if (tone) {
          lines.push(`장면 분위기: ${tone.mood} (강도 ${(tone.intensity * 100).toFixed(0)}%)`);
        }
      }

      return lines.join('\n');
    });

    memoryContext = parts.join('\n\n');
  } catch (e) {
    console.error('[ProAnalysis] 메모리 컨텍스트 로드 실패:', e instanceof Error ? e.message : String(e));
  }

  // Pro 분석 실행
  const result = await generateProAnalysis({
    systemInstruction,
    conversationSummary: session.sessionSummary || '(첫 대화)',
    currentTurnSummary: `${effectiveUserName}: ${userMessage}\n\n${aiResponseSummary}`,
    sceneState: {
      location: session.currentLocation,
      time: session.currentTime,
      presentCharacters,
      recentEvents,
    },
    characterNames: characters.map(c => c.name),
    memoryContext,
  });

  // DB 저장: 세션 proAnalysis + 메시지 metadata에 proAnalysisMetrics 추가
  const proMetrics = {
    analysis: result.analysis,
    timeMs: result.timeMs,
    promptTokens: result.promptTokens,
    outputTokens: result.outputTokens,
    thinkingTokens: result.thinkingTokens,
    totalTokens: result.totalTokens,
    status: result.analysis ? 'complete' : 'failed',
  };

  const dbOps: Promise<unknown>[] = [];

  if (result.analysis) {
    dbOps.push(
      prisma.chatSession.update({
        where: { id: sessionId },
        data: { proAnalysis: result.analysis },
      })
    );
  }

  // 메시지 metadata에 proAnalysisMetrics 병합 (새로고침 시에도 유지)
  if (messageId) {
    dbOps.push(
      prisma.message.findUnique({ where: { id: messageId }, select: { metadata: true } })
        .then(msg => {
          const existing = msg?.metadata ? JSON.parse(msg.metadata) : {};
          return prisma.message.update({
            where: { id: messageId },
            data: { metadata: JSON.stringify({ ...existing, proAnalysisMetrics: proMetrics }) },
          });
        })
        .catch(e => console.error('[ProAnalysis] metadata save failed:', e))
    );
  }

  await Promise.all(dbOps);

  return NextResponse.json(result);
}
