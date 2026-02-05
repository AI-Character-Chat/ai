import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 오프닝 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { openingId: string } }
) {
  try {
    const openingId = params.openingId;
    const body = await request.json();
    const { title, content, isDefault, order, initialLocation, initialTime, initialCharacters } = body;

    console.log('=== 오프닝 수정 API ===');
    console.log('openingId:', openingId);
    console.log('initialCharacters:', initialCharacters);

    // 현재 오프닝 조회
    const currentOpening = await prisma.opening.findUnique({
      where: { id: openingId },
    });

    if (!currentOpening) {
      return NextResponse.json(
        { error: '오프닝을 찾을 수 없습니다.' },
        { status: 404 }
      );
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
    // initialCharacters는 배열로 받아서 JSON 문자열로 저장
    if (initialCharacters !== undefined) {
      updateData.initialCharacters = JSON.stringify(initialCharacters);
    }

    console.log('업데이트 데이터:', updateData);

    const opening = await prisma.opening.update({
      where: { id: openingId },
      data: updateData,
    });

    // 응답 시 initialCharacters를 배열로 파싱해서 반환
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
    const openingId = params.openingId;

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
