import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 오프닝 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { openingId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const openingId = params.openingId;
    const body = await request.json();
    const { title, content, isDefault, order, initialLocation, initialTime, initialCharacters } = body;

    // 소유자 확인
    const currentOpening = await prisma.opening.findUnique({
      where: { id: openingId },
      include: { work: true },
    });

    if (!currentOpening) {
      return NextResponse.json({ error: '오프닝을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (currentOpening.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    // 기본 오프닝으로 설정할 경우, 기존 기본 오프닝 해제
    if (isDefault && !currentOpening.isDefault) {
      await prisma.opening.updateMany({
        where: { workId: currentOpening.workId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (order !== undefined) updateData.order = order;
    if (initialLocation !== undefined) updateData.initialLocation = initialLocation;
    if (initialTime !== undefined) updateData.initialTime = initialTime;
    if (initialCharacters !== undefined) {
      updateData.initialCharacters = JSON.stringify(initialCharacters);
    }

    const opening = await prisma.opening.update({
      where: { id: openingId },
      data: updateData,
    });

    return NextResponse.json({
      ...opening,
      initialCharacters: JSON.parse(opening.initialCharacters || '[]'),
    });
  } catch (error) {
    console.error('Error updating opening:', error);
    return NextResponse.json(
      { error: '오프닝 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 오프닝 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { openingId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const openingId = params.openingId;

    // 소유자 확인
    const existing = await prisma.opening.findUnique({
      where: { id: openingId },
      include: { work: true },
    });
    if (!existing) {
      return NextResponse.json({ error: '오프닝을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existing.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.opening.delete({
      where: { id: openingId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting opening:', error);
    return NextResponse.json(
      { error: '오프닝 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
