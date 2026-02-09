import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 댓글 목록 조회
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get('workId');

    if (!workId) {
      return NextResponse.json({ error: 'workId is required' }, { status: 400 });
    }

    const session = await auth();
    const userId = session?.user?.id;

    const comments = await prisma.workComment.findMany({
      where: {
        workId,
        parentId: null, // 최상위 댓글만
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
            _count: {
              select: { likes: true },
            },
            likes: userId ? {
              where: { userId },
              select: { id: true },
            } : false,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { likes: true },
        },
        likes: userId ? {
          where: { userId },
          select: { id: true },
        } : false,
      },
      orderBy: [
        { isPinned: 'desc' }, // 고정 댓글 먼저
        { createdAt: 'desc' },
      ],
    });

    // 좋아요 수와 좋아요 여부를 포함하도록 변환
    const commentsWithLikes = comments.map((comment) => ({
      ...comment,
      likeCount: comment._count.likes,
      isLiked: userId ? comment.likes.length > 0 : false,
      replies: comment.replies.map((reply) => ({
        ...reply,
        likeCount: reply._count.likes,
        isLiked: userId ? reply.likes.length > 0 : false,
      })),
    }));

    return NextResponse.json(commentsWithLikes);
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
  }
}

// 댓글 작성
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workId, content, parentId } = await request.json();

    if (!workId || !content) {
      return NextResponse.json({ error: 'workId and content are required' }, { status: 400 });
    }

    if (content.length > 500) {
      return NextResponse.json({ error: 'Content is too long (max 500 characters)' }, { status: 400 });
    }

    // 대댓글인 경우 부모 댓글 확인
    if (parentId) {
      const parentComment = await prisma.workComment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment || parentComment.workId !== workId) {
        return NextResponse.json({ error: 'Invalid parent comment' }, { status: 400 });
      }
    }

    const comment = await prisma.workComment.create({
      data: {
        workId,
        userId: session.user.id,
        content,
        parentId: parentId || null,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    // 작품 작성자에게 알림 (자기 작품에 댓글 달면 알림 안 함)
    const work = await prisma.work.findUnique({
      where: { id: workId },
      select: { authorId: true, title: true },
    });

    if (work?.authorId && work.authorId !== session.user.id) {
      await prisma.notification.create({
        data: {
          userId: work.authorId,
          type: 'comment',
          title: '새 댓글',
          content: `${session.user.name || '익명'}님이 "${work.title}"에 댓글을 남겼습니다.`,
          link: `/?workId=${workId}&scrollTo=comments`,
        },
      });
    }

    return NextResponse.json(comment);
  } catch (error) {
    console.error('Failed to create comment:', error);
    return NextResponse.json({ error: 'Failed to create comment' }, { status: 500 });
  }
}

// 댓글 수정 (고정/해제)
export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId, isPinned } = await request.json();

    if (!commentId || typeof isPinned !== 'boolean') {
      return NextResponse.json({ error: 'commentId and isPinned are required' }, { status: 400 });
    }

    // 댓글 정보 조회
    const comment = await prisma.workComment.findUnique({
      where: { id: commentId },
      include: {
        work: {
          select: { authorId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // 작품 작성자만 고정/해제 가능
    if (comment.work.authorId !== session.user.id) {
      return NextResponse.json({ error: 'Only the author can pin comments' }, { status: 403 });
    }

    // 대댓글은 고정 불가
    if (comment.parentId) {
      return NextResponse.json({ error: 'Cannot pin a reply' }, { status: 400 });
    }

    // 고정 시 기존 고정 댓글 해제 (하나만 고정 가능)
    if (isPinned) {
      await prisma.workComment.updateMany({
        where: {
          workId: comment.workId,
          isPinned: true,
        },
        data: { isPinned: false },
      });
    }

    const updatedComment = await prisma.workComment.update({
      where: { id: commentId },
      data: { isPinned },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        replies: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(updatedComment);
  } catch (error) {
    console.error('Failed to update comment:', error);
    return NextResponse.json({ error: 'Failed to update comment' }, { status: 500 });
  }
}

// 댓글 삭제
export async function DELETE(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const commentId = searchParams.get('commentId');

    if (!commentId) {
      return NextResponse.json({ error: 'commentId is required' }, { status: 400 });
    }

    const comment = await prisma.workComment.findUnique({
      where: { id: commentId },
      include: {
        work: {
          select: { authorId: true },
        },
      },
    });

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    // 작성자 본인 또는 작품 작성자만 삭제 가능
    if (comment.userId !== session.user.id && comment.work.authorId !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.workComment.delete({
      where: { id: commentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
