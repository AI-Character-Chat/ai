import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 오프닝 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const {
      workId,
      title,
      content,
      isDefault = false,
      order = 0,
      initialLocation = '알 수 없는 장소',
      initialTime = '알 수 없는 시간',
    } = body;

    if (!workId || !title || !content) {
      return NextResponse.json(
        { error: '작품 ID, 제목, 내용은 필수입니다.' },
        { status: 400 }
      );
    }

    // 작품 소유자 확인
    const work = await prisma.work.findUnique({ where: { id: workId } });
    if (!work) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (work.authorId !== session.user.id) {
      return NextResponse.json({ error: '이 작품에 오프닝을 추가할 권한이 없습니다.' }, { status: 403 });
    }

    // 기본 오프닝으로 설정할 경우, 기존 기본 오프닝 해제
    if (isDefault) {
      await prisma.opening.updateMany({
        where: { workId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const opening = await prisma.opening.create({
      data: {
        workId,
        title,
        content,
        isDefault,
        order,
        initialLocation,
        initialTime,
      },
    });

    return NextResponse.json(opening);
  } catch (error) {
    console.error('Error creating opening:', error);
    return NextResponse.json(
      { error: '오프닝 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품별 오프닝 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const workId = searchParams.get('workId');

    if (!workId) {
      return NextResponse.json(
        { error: '작품 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const openings = await prisma.opening.findMany({
      where: { workId },
      orderBy: { order: 'asc' },
    });

    return NextResponse.json(openings);
  } catch (error) {
    console.error('Error fetching openings:', error);
    return NextResponse.json(
      { error: '오프닝 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 오프닝 수정
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, content, isDefault, order, initialLocation, initialTime } = body;

    if (!id) {
      return NextResponse.json(
        { error: '오프닝 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 소유자 확인
    const existingOpening = await prisma.opening.findUnique({
      where: { id },
      include: { work: true },
    });

    if (!existingOpening) {
      return NextResponse.json({ error: '오프닝을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (existingOpening.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '수정 권한이 없습니다.' }, { status: 403 });
    }

    // 기본 오프닝으로 변경할 경우, 기존 기본 오프닝 해제
    if (isDefault && !existingOpening.isDefault) {
      await prisma.opening.updateMany({
        where: { workId: existingOpening.workId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const opening = await prisma.opening.update({
      where: { id },
      data: {
        title: title ?? existingOpening.title,
        content: content ?? existingOpening.content,
        isDefault: isDefault ?? existingOpening.isDefault,
        order: order ?? existingOpening.order,
        initialLocation: initialLocation ?? existingOpening.initialLocation,
        initialTime: initialTime ?? existingOpening.initialTime,
      },
    });

    return NextResponse.json(opening);
  } catch (error) {
    console.error('Error updating opening:', error);
    return NextResponse.json(
      { error: '오프닝 수정에 실패했습니다.' },
      { status: 500 }
    );
  }
}
