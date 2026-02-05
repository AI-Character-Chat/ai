import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 로어북 항목 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { entryId: string } }
) {
  try {
    const entryId = params.entryId;
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
    const entryId = params.entryId;

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
