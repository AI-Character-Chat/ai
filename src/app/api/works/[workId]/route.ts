import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 작품 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { workId: string } }
) {
  try {
    const workId = params.workId;

    const work = await prisma.work.findUnique({
      where: { id: workId },
      include: {
        characters: true,
        openings: {
          orderBy: { order: 'asc' },
        },
        lorebook: {
          orderBy: { priority: 'asc' },
        },
        images: true,
      },
    });

    if (!work) {
      return NextResponse.json(
        { error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // tags와 lorebook keywords JSON 파싱
    const workWithParsedData = {
      ...work,
      tags: JSON.parse(work.tags),
      lorebook: work.lorebook.map((entry) => ({
        ...entry,
        keywords: JSON.parse(entry.keywords),
      })),
    };

    return NextResponse.json(workWithParsedData);
  } catch (error) {
    console.error('Error fetching work:', error);
    return NextResponse.json(
      { error: '작품을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품 수정
export async function PUT(
  request: NextRequest,
  { params }: { params: { workId: string } }
) {
  try {
    const workId = params.workId;
    const body = await request.json();
    const {
      title,
      description,
      thumbnail,
      tags,
      targetAudience,
      visibility,
      isAdult,
      worldSetting,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);
    if (targetAudience !== undefined) updateData.targetAudience = targetAudience;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (isAdult !== undefined) updateData.isAdult = isAdult;
    if (worldSetting !== undefined) updateData.worldSetting = worldSetting;

    const work = await prisma.work.update({
      where: { id: workId },
      data: updateData,
    });

    return NextResponse.json({
      ...work,
      tags: JSON.parse(work.tags),
    });
  } catch (error) {
    console.error('Error updating work:', error);
    return NextResponse.json(
      { error: '작품 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: { workId: string } }
) {
  try {
    const workId = params.workId;

    await prisma.work.delete({
      where: { id: workId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting work:', error);
    return NextResponse.json(
      { error: '작품 삭제에 실패했습니다.' },
      { status: 500 }
    );
  }
}
