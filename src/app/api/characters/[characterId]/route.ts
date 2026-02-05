import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 캐릭터 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const characterId = params.characterId;

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        work: true,
      },
    });

    if (!character) {
      return NextResponse.json(
        { error: '캐릭터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json(character);
  } catch (error) {
    console.error('Error fetching character:', error);
    return NextResponse.json(
      { error: '캐릭터를 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 캐릭터 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const characterId = params.characterId;
    const body = await request.json();
    const { name, profileImage, prompt } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (profileImage !== undefined) updateData.profileImage = profileImage;
    if (prompt !== undefined) updateData.prompt = prompt;

    const character = await prisma.character.update({
      where: { id: characterId },
      data: updateData,
    });

    return NextResponse.json(character);
  } catch (error) {
    console.error('Error updating character:', error);
    return NextResponse.json(
      { error: '캐릭터 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 캐릭터 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const characterId = params.characterId;

    await prisma.character.delete({
      where: { id: characterId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting character:', error);
    return NextResponse.json(
      { error: '캐릭터 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
