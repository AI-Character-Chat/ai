import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 알림 목록 조회
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    // 전체 공지 (userId가 null) + 로그인한 경우 개인 알림
    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { userId: null }, // 전체 공지
          ...(userId ? [{ userId }] : []), // 로그인한 경우 개인 알림
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50, // 최근 50개
    });

    // 읽지 않은 알림 수
    const unreadCount = await prisma.notification.count({
      where: {
        OR: [
          { userId: null, isRead: false },
          ...(userId ? [{ userId, isRead: false }] : []),
        ],
      },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: '알림을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 알림 읽음 처리
export async function PATCH() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }
    const userId = session.user.id;

    // 개인 알림만 읽음 처리 (전체 공지는 per-user 추적 구조 필요 — 추후 개선)
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return NextResponse.json(
      { error: '알림 읽음 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}
