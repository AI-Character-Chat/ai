import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 댓글 신고
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { commentId, reason, description } = await request.json();

    if (!commentId || !reason) {
      return NextResponse.json({ error: 'commentId and reason are required' }, { status: 400 });
    }

    // 댓글 존재 확인 + 중복 신고 체크를 병렬로
    const [comment, existingReport] = await Promise.all([
      prisma.workComment.findUnique({
        where: { id: commentId },
        select: { id: true, workId: true },
      }),
      prisma.report.findFirst({
        where: {
          reporterId: session.user.id,
          targetType: 'comment',
          targetId: commentId,
        },
        select: { id: true },
      }),
    ]);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    if (existingReport) {
      return NextResponse.json({ error: '이미 신고한 댓글입니다.' }, { status: 409 });
    }

    // 신고 생성
    const report = await prisma.report.create({
      data: {
        reporterId: session.user.id,
        targetType: 'comment',
        targetId: commentId,
        reason,
        description: description || null,
        status: 'pending',
      },
    });

    return NextResponse.json({ success: true, reportId: report.id });
  } catch (error) {
    console.error('Failed to report comment:', error);
    return NextResponse.json({ error: 'Failed to report comment' }, { status: 500 });
  }
}
