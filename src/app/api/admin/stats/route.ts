import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 관리자 권한 체크
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

// 통계 데이터 조회
export async function GET() {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 전체 통계
    const [
      totalUsers,
      totalWorks,
      totalChatSessions,
      totalMessages,
      newUsersToday,
      newUsersWeek,
      newWorksToday,
      newWorksWeek,
      newChatsToday,
      newChatsWeek,
      publicWorks,
      pendingReports
    ] = await Promise.all([
      prisma.user.count(),
      prisma.work.count(),
      prisma.chatSession.count(),
      prisma.message.count(),
      prisma.user.count({ where: { createdAt: { gte: today } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.work.count({ where: { createdAt: { gte: today } } }),
      prisma.work.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.chatSession.count({ where: { createdAt: { gte: today } } }),
      prisma.chatSession.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.work.count({ where: { visibility: 'public' } }),
      prisma.report.count({ where: { status: 'pending' } })
    ]);

    // 일별 가입자 수 (최근 7일) - PostgreSQL
    const dailySignups = await prisma.$queryRaw<{ date: string; count: number }[]>`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count
      FROM "User"
      WHERE "createdAt" >= ${weekAgo}
      GROUP BY DATE("createdAt")
      ORDER BY date DESC
    `;

    // 인기 작품 (좋아요 순)
    const topWorks = await prisma.work.findMany({
      where: { visibility: 'public' },
      select: {
        id: true,
        title: true,
        thumbnail: true,
        _count: {
          select: {
            likes: true,
            chatSessions: true
          }
        }
      },
      orderBy: {
        likes: { _count: 'desc' }
      },
      take: 5
    });

    return NextResponse.json({
      overview: {
        totalUsers,
        totalWorks,
        totalChatSessions,
        totalMessages,
        publicWorks,
        pendingReports
      },
      growth: {
        newUsersToday,
        newUsersWeek,
        newWorksToday,
        newWorksWeek,
        newChatsToday,
        newChatsWeek
      },
      dailySignups,
      topWorks
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
