/**
 * Pro 백그라운드 분석 API
 * 클라이언트가 Flash 응답 완료 후 호출
 * Pro(gemini-2.5-pro + thinking)로 서사 분석 → DB 저장 → 메트릭 반환
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { buildSystemInstruction, generateProAnalysis } from '@/lib/gemini';

export async function POST(request: NextRequest) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { sessionId?: string; userMessage?: string; aiResponseSummary?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { sessionId, userMessage, aiResponseSummary } = body;
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
  });

  // DB 저장
  if (result.analysis) {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { proAnalysis: result.analysis },
    });
  }

  return NextResponse.json(result);
}
