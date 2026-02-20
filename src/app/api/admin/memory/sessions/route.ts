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

export async function GET(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const search = searchParams.get('search') || '';
    const pageSize = 20;

    const where = search
      ? { work: { title: { contains: search, mode: 'insensitive' as const } } }
      : {};

    const [sessions, totalCount] = await Promise.all([
      prisma.chatSession.findMany({
        where,
        select: {
          id: true,
          turnCount: true,
          createdAt: true,
          userId: true,
          work: { select: { title: true } },
          user: { select: { name: true } },
          _count: { select: { messages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.chatSession.count({ where }),
    ]);

    // 세션별 CharacterMemory 수 병렬 조회
    const memoryCounts = await Promise.all(
      sessions.map(s =>
        prisma.characterMemory.count({ where: { sessionId: s.id } })
      )
    );

    const result = sessions.map((s, i) => ({
      id: s.id,
      workTitle: s.work.title,
      userName: s.user?.name || '비로그인',
      userId: s.userId,
      turnCount: s.turnCount,
      messageCount: s._count.messages,
      memoriesCount: memoryCounts[i],
      createdAt: s.createdAt,
    }));

    return NextResponse.json({
      sessions: result,
      totalPages: Math.ceil(totalCount / pageSize),
      currentPage: page,
    });
  } catch (error) {
    console.error('Failed to fetch memory sessions:', error);
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
  }
}
