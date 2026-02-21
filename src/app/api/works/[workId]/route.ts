import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 작품 상세 조회
export async function GET(
  request: NextRequest,
  { params }: { params: { workId: string } }
) {
  try {
    const workId = params.workId;
    const { searchParams } = new URL(request.url);
    const lite = searchParams.get('lite') === 'true'; // 채팅용 경량 모드

    const work = await prisma.work.findUnique({
      where: { id: workId },
      include: {
        characters: lite
          ? { select: { id: true, name: true, profileImage: true } }
          : true,  // 스튜디오는 prompt 포함 전체 필드
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

    // stale-while-revalidate: CDN에서 60초 캐시 + 5분간 stale 허용
    const res = NextResponse.json(workWithParsedData);
    res.headers.set('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    return res;
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const workId = params.workId;

    // 소유자 확인
    const existingWork = await prisma.work.findUnique({ where: { id: workId } });
    if (!existingWork) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existingWork.authorId !== session.user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

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
      relationshipConfig,
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
    if (relationshipConfig !== undefined) {
      // 문자열이면 그대로, 객체면 JSON.stringify
      updateData.relationshipConfig = typeof relationshipConfig === 'string'
        ? relationshipConfig
        : JSON.stringify(relationshipConfig);
    }

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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const workId = params.workId;

    // 소유자 확인
    const existingWork = await prisma.work.findUnique({ where: { id: workId } });
    if (!existingWork) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existingWork.authorId !== session.user.id) {
      return NextResponse.json({ error: '삭제 권한이 없습니다.' }, { status: 403 });
    }

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
