import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

async function checkAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true }
  });

  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sessionId } = params;

  try {
    // 세션 기본 정보
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        turnCount: true,
        createdAt: true,
        userId: true,
        workId: true,
        work: {
          select: {
            title: true,
            characters: { select: { id: true, name: true } },
          },
        },
        user: { select: { name: true } },
      },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // 병렬 쿼리: 메시지 + 기억 + 관계
    const [messages, memories, relationships] = await Promise.all([
      // 메시지 (embedding 제외)
      prisma.message.findMany({
        where: { sessionId },
        select: {
          id: true,
          content: true,
          characterId: true,
          messageType: true,
          metadata: true,
          createdAt: true,
          character: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),

      // CharacterMemory (embedding 제외) — sessionId 또는 userId+workId
      prisma.characterMemory.findMany({
        where: session.userId
          ? { userId: session.userId, workId: session.workId }
          : { sessionId },
        select: {
          id: true,
          characterId: true,
          originalEvent: true,
          interpretation: true,
          importance: true,
          strength: true,
          memoryType: true,
          keywords: true,
          mentionedCount: true,
          createdAt: true,
          character: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),

      // UserCharacterRelationship — sessionId 또는 userId+workId
      prisma.userCharacterRelationship.findMany({
        where: session.userId
          ? { userId: session.userId, workId: session.workId }
          : { sessionId },
        select: {
          id: true,
          characterId: true,
          trust: true,
          affection: true,
          respect: true,
          rivalry: true,
          familiarity: true,
          intimacyLevel: true,
          intimacyScore: true,
          knownFacts: true,
          sharedExperiences: true,
          emotionalHistory: true,
          totalTurns: true,
          speechStyle: true,
          nicknameForUser: true,
          character: { select: { name: true } },
        },
      }),
    ]);

    return NextResponse.json({
      session: {
        id: session.id,
        workTitle: session.work.title,
        userName: session.user?.name || '비로그인',
        turnCount: session.turnCount,
        characters: session.work.characters,
        createdAt: session.createdAt,
      },
      messages: messages.map(m => ({
        ...m,
        characterName: m.character?.name || null,
        metadata: m.metadata ? JSON.parse(m.metadata) : null,
      })),
      memories: memories.map(m => ({
        ...m,
        characterName: m.character?.name || null,
        keywords: JSON.parse(m.keywords || '[]'),
      })),
      relationships: relationships.map(r => ({
        ...r,
        characterName: r.character?.name || null,
        knownFacts: JSON.parse(r.knownFacts || '[]'),
        sharedExperiences: JSON.parse(r.sharedExperiences || '[]'),
        emotionalHistory: JSON.parse(r.emotionalHistory || '[]'),
      })),
    });
  } catch (error) {
    console.error('Failed to fetch session detail:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}
