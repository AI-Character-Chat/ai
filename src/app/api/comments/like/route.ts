import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 좋아요 상태 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');
    const session = await auth();

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
    }

    const likeCount = await prisma.commentLike.count({
      where: { commentId },
    });

    let isLiked = false;
    if (session?.user?.id) {
      const like = await prisma.commentLike.findUnique({
        where: {
          commentId_userId: {
            commentId,
            userId: session.user.id,
          },
        },
      });
      isLiked = !!like;
    }

    return NextResponse.json({ likeCount, isLiked });
  } catch (error) {
    console.error('Failed to fetch comment like:', error);
    return NextResponse.json({ error: 'Failed to fetch comment like' }, { status: 500 });
  }
}

// 좋아요 토글
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId } = await request.json();

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
    }

    // 댓글 존재 확인
    const comment = await prisma.workComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // 기존 좋아요 확인
    const existingLike = await prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId: session.user.id,
        },
      },
    });

    let isLiked: boolean;

    if (existingLike) {
      // 좋아요 취소
      await prisma.commentLike.delete({
        where: { id: existingLike.id },
      });
      isLiked = false;
    } else {
      // 좋아요 추가
      await prisma.commentLike.create({
        data: {
          commentId,
          userId: session.user.id,
        },
      });
      isLiked = true;
    }

    const likeCount = await prisma.commentLike.count({
      where: { commentId },
    });

    return NextResponse.json({ isLiked, likeCount });
  } catch (error) {
    console.error('Failed to toggle comment like:', error);
    return NextResponse.json({ error: 'Failed to toggle comment like' }, { status: 500 });
  }
}
