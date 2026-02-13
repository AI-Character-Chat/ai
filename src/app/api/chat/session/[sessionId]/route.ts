/**
 * 채팅 세션 상세 조회 API
 * GET: 특정 세션의 정보와 메시지 목록 조회
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const authSession = await auth();

    // 세션 조회
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        work: {
          select: {
            id: true,
            title: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            characterId: true,
            content: true,
            messageType: true,
            imageUrl: true,
            metadata: true,
            createdAt: true,
            // embedding 제외 — 256차원 벡터(~3KB/msg)는 서버 전용
            character: {
              select: {
                id: true,
                name: true,
                profileImage: true,
              },
            },
          },
        },
      },
    });

    if (!chatSession) {
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 소유권 확인 (로그인한 유저의 세션인지)
    if (chatSession.userId && authSession?.user?.id) {
      if (chatSession.userId !== authSession.user.id) {
        return NextResponse.json(
          { error: '접근 권한이 없습니다.' },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      session: {
        id: chatSession.id,
        workId: chatSession.workId,
        userName: chatSession.userName,
        turnCount: chatSession.turnCount,
        intimacy: chatSession.intimacy,
        currentLocation: chatSession.currentLocation,
        currentTime: chatSession.currentTime,
        presentCharacters: chatSession.presentCharacters,
        recentEvents: chatSession.recentEvents,
        createdAt: chatSession.createdAt,
        updatedAt: chatSession.updatedAt,
      },
      messages: chatSession.messages,
      work: chatSession.work,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json(
      { error: '세션을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
