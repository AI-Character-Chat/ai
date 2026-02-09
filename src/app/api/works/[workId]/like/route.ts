import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 좋아요 토글
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { workId } = await params;
    const userId = session.user.id;

    // 기존 좋아요 확인
    const existingLike = await prisma.workLike.findUnique({
      where: { workId_userId: { workId, userId } },
    });

    if (existingLike) {
      // 좋아요 취소
      await prisma.workLike.delete({
        where: { id: existingLike.id },
      });
      return NextResponse.json({ liked: false });
    } else {
      // 좋아요 추가
      await prisma.workLike.create({
        data: { workId, userId },
      });

      // 작품 정보 가져오기 (알림용)
      const work = await prisma.work.findUnique({
        where: { id: workId },
        select: { authorId: true, title: true },
      });

      // 작품 작성자에게 알림 보내기 (자기 자신이 아닌 경우)
      if (work?.authorId && work.authorId !== userId) {
        const liker = await prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });

        await prisma.notification.create({
          data: {
            userId: work.authorId,
            type: 'like',
            title: '새로운 좋아요',
            content: `${liker?.name || '누군가'}님이 "${work.title}" 작품을 좋아합니다.`,
            link: `/?workId=${workId}`,
          },
        });
      }

      return NextResponse.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling like:', error);
    return NextResponse.json({ error: '좋아요 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// 좋아요 상태 확인
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workId: string }> }
) {
  try {
    const session = await auth();
    const { workId } = await params;

    const likeCount = await prisma.workLike.count({ where: { workId } });

    let isLiked = false;
    if (session?.user?.id) {
      const existingLike = await prisma.workLike.findUnique({
        where: { workId_userId: { workId, userId: session.user.id } },
      });
      isLiked = !!existingLike;
    }

    return NextResponse.json({ likeCount, isLiked });
  } catch (error) {
    console.error('Error fetching like status:', error);
    return NextResponse.json({ error: '좋아요 정보를 불러오는데 실패했습니다.' }, { status: 500 });
  }
}
