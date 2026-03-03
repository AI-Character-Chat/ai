/**
 * Pro 백그라운드 분석 API
 * 클라이언트가 Flash 응답 완료 후 호출
 * Pro(gemini-2.5-pro + thinking)로 서사 분석 → DB 저장 → 메트릭 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { generateProAnalysis } from '@/lib/gemini';
import { getAllRelationships, type MemoryScope } from '@/lib/narrative-memory';

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
  if (!session.userId || session.userId !== authSession.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const characters = session.work.characters;

  // 유저 이름 결정
  let effectiveUserName = session.userName;
  try {
    const parsed = JSON.parse(session.userPersona || '{}');
    if (parsed.name) effectiveUserName = parsed.name;
  } catch { /* ignore */ }

  // ② 경량 systemInstruction (캐릭터 이름만, 전체 프롬프트 제외)
  const charNames = characters.map(c => c.name);
  const systemInstruction = `당신은 인터랙티브 소설의 서사 분석가입니다. 등장인물: ${charNames.join(', ')}. 유저: ${effectiveUserName}.`;

  let presentCharacters: string[] = [];
  let recentEvents: string[] = [];
  try {
    presentCharacters = JSON.parse(session.presentCharacters) as string[];
    recentEvents = JSON.parse(session.recentEvents) as string[];
  } catch { /* 잘못된 JSON — 빈 배열 폴백 */ }

  // ③ 경량 memoryContext (관계 수치 + knownFacts만, 임베딩 검색/경험/감정 제외)
  let memoryContext = '';
  try {
    const scope: MemoryScope = {
      userId: authSession.user.id,
      workId: session.workId,
      sessionId: sessionId,
    };

    const relationships = await getAllRelationships(scope);

    const parts = relationships
      .filter(rel => charNames.includes(rel.characterName))
      .map(rel => {
        const lines: string[] = [`${rel.characterName}: ${rel.intimacyLevel} (친밀${rel.intimacyScore} 신뢰${rel.trust} 호감${rel.affection} 존경${rel.respect} 경쟁${rel.rivalry})`];
        if (rel.knownFacts.length > 0) {
          lines.push(`  사실: ${rel.knownFacts.join(', ')}`);
        }
        return lines.join('\n');
      });

    memoryContext = parts.join('\n');
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
    turnCount: session.turnCount,
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
