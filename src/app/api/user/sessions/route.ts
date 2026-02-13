/**
 * 유저 채팅 세션 목록 API
 * GET: 로그인한 유저의 모든 채팅 세션 조회
 * Query params:
 *   - workId: 특정 작품의 세션만 조회
 *   - limit: 조회할 세션 수 제한
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { sessions: [], message: '로그인이 필요합니다.' },
        { status: 200 }
      );
    }

    // 쿼리 파라미터
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get('workId');
    const limit = searchParams.get('limit');

    // where 조건 구성
    const whereClause: { userId: string; workId?: string } = {
      userId: session.user.id,
    };
    if (workId) {
      whereClause.workId = workId;
    }

    // 유저의 채팅 세션 조회 (기본 30개 제한 — 무제한 조회 방지)
    const DEFAULT_LIMIT = 30;
    const takeCount = limit ? parseInt(limit) : DEFAULT_LIMIT;

    const chatSessions = await prisma.chatSession.findMany({
      where: whereClause,
      include: {
        work: {
          select: {
            id: true,
            title: true,
            thumbnail: true,
            description: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1, // 마지막 메시지만
          select: {
            content: true,
            messageType: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: takeCount,
    });

    // 응답 포맷팅
    const formattedSessions = chatSessions.map((cs) => ({
      id: cs.id,
      workId: cs.workId,
      work: cs.work,
      userName: cs.userName,
      turnCount: cs.turnCount,
      intimacy: cs.intimacy,
      currentLocation: cs.currentLocation,
      lastMessage: cs.messages[0] || null,
      updatedAt: cs.updatedAt,
      createdAt: cs.createdAt,
    }));

    return NextResponse.json({ sessions: formattedSessions });
  } catch (error) {
    console.error('Error fetching user sessions:', error);
    return NextResponse.json(
      { error: '세션 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
