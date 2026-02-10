import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 로어북 항목 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { entryId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const entryId = params.entryId;

    // 소유자 확인
    const existing = await prisma.lorebookEntry.findUnique({
      where: { id: entryId },
      include: { work: true },
    });
    if (!existing) {
      return NextResponse.json({ error: '로어북 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existing.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      name,
      keywords,
      content,
      priority,
      minIntimacy,
      minTurns,
      requiredCharacter,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (keywords !== undefined) updateData.keywords = JSON.stringify(keywords);
    if (content !== undefined) updateData.content = content;
    if (priority !== undefined) updateData.priority = priority;
    if (minIntimacy !== undefined) updateData.minIntimacy = minIntimacy;
    if (minTurns !== undefined) updateData.minTurns = minTurns;
    if (requiredCharacter !== undefined) updateData.requiredCharacter = requiredCharacter;

    const entry = await prisma.lorebookEntry.update({
      where: { id: entryId },
      data: updateData,
    });

    return NextResponse.json({
      ...entry,
      keywords: JSON.parse(entry.keywords),
    });
  } catch (error) {
    console.error('Error updating lorebook entry:', error);
    return NextResponse.json(
      { error: '로어북 항목 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 로어북 항목 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { entryId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const entryId = params.entryId;

    // 소유자 확인
    const existing = await prisma.lorebookEntry.findUnique({
      where: { id: entryId },
      include: { work: true },
    });
    if (!existing) {
      return NextResponse.json({ error: '로어북 항목을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existing.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

    await prisma.lorebookEntry.delete({
      where: { id: entryId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting lorebook entry:', error);
    return NextResponse.json(
      { error: '로어북 항목 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
