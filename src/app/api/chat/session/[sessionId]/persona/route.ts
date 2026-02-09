/**
 * 채팅 세션 페르소나 업데이트 API
 * PUT: 세션의 userName 및 userPersona 변경
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const { userName, personaId } = await request.json();

    if (!userName || typeof userName !== 'string') {
      return NextResponse.json(
        { error: '유효한 닉네임이 필요합니다.' },
        { status: 400 }
      );
    }

    // 세션 존재 및 소유자 확인
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
    });

    if (!chatSession) {
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (chatSession.userId !== session.user.id) {
      return NextResponse.json(
        { error: '권한이 없습니다.' },
        { status: 403 }
      );
    }

    // 페르소나 정보 조회 (ID가 제공된 경우)
    let userPersona = {
      name: userName,
      age: null as number | null,
      gender: 'private',
      description: null as string | null,
    };

    if (personaId) {
      const persona = await prisma.persona.findUnique({
        where: { id: personaId },
      });

      if (persona && persona.userId === session.user.id) {
        userPersona = {
          name: persona.name,
          age: persona.age,
          gender: persona.gender,
          description: persona.description,
        };
      }
    }

    // userName과 userPersona 업데이트
    const updatedSession = await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        userName: userPersona.name,
        userPersona: JSON.stringify(userPersona),
      },
    });

    console.log(`[Persona] 세션 ${sessionId} 페르소나 변경: ${userPersona.name}`);

    return NextResponse.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error('Error updating session persona:', error);
    return NextResponse.json(
      { error: '페르소나 변경에 실패했습니다.' },
      { status: 500 }
    );
  }
}
