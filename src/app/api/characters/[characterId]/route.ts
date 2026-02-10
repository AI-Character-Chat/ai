import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const characterId = params.characterId;

    // 캐릭터 + 작품 조회로 소유자 확인
    const existing = await prisma.character.findUnique({
      where: { id: characterId },
      include: { work: true },
    });
    if (!existing) {
      return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existing.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const characterId = params.characterId;

    // 소유자 확인
    const existing = await prisma.character.findUnique({
      where: { id: characterId },
      include: { work: true },
    });
    if (!existing) {
      return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existing.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

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
