import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 관리자 권한 체크
async function checkAdmin() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true }
  });

  if (!user || user.role !== 'admin') return null;
  return user;
}

// 배너 목록 조회 (공개 API - 관리자 권한 불필요)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminMode = searchParams.get('admin') === 'true';

  try {
    // 관리자 모드: 모든 배너 조회
    if (adminMode) {
      const admin = await checkAdmin();
      if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const banners = await prisma.banner.findMany({
        orderBy: { order: 'asc' }
      });
      return NextResponse.json(banners);
    }

    // 일반 모드: 활성화된 배너만 조회
    const now = new Date();
    const banners = await prisma.banner.findMany({
      where: {
        isActive: true,
        OR: [
          { startDate: null, endDate: null },
          { startDate: { lte: now }, endDate: null },
          { startDate: null, endDate: { gte: now } },
          { startDate: { lte: now }, endDate: { gte: now } }
        ]
      },
      orderBy: { order: 'asc' }
    });

    return NextResponse.json(banners);
  } catch (error) {
    console.error('Failed to fetch banners:', error);
    return NextResponse.json({ error: 'Failed to fetch banners' }, { status: 500 });
  }
}

// 배너 생성
export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, imageUrl, linkUrl, order, isActive, startDate, endDate } = body;

    if (!title || !imageUrl) {
      return NextResponse.json({ error: 'Title and imageUrl are required' }, { status: 400 });
    }

    const banner = await prisma.banner.create({
      data: {
        title,
        imageUrl,
        linkUrl,
        order: order || 0,
        isActive: isActive ?? true,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      }
    });

    return NextResponse.json(banner);
  } catch (error) {
    console.error('Failed to create banner:', error);
    return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 });
  }
}

// 배너 수정
export async function PUT(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, imageUrl, linkUrl, order, isActive, startDate, endDate } = body;

    if (!id) {
      return NextResponse.json({ error: 'Banner ID is required' }, { status: 400 });
    }

    const banner = await prisma.banner.update({
      where: { id },
      data: {
        title,
        imageUrl,
        linkUrl,
        order,
        isActive,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null
      }
    });

    return NextResponse.json(banner);
  } catch (error) {
    console.error('Failed to update banner:', error);
    return NextResponse.json({ error: 'Failed to update banner' }, { status: 500 });
  }
}

// 배너 삭제
export async function DELETE(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Banner ID is required' }, { status: 400 });
    }

    await prisma.banner.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete banner:', error);
    return NextResponse.json({ error: 'Failed to delete banner' }, { status: 500 });
  }
}
