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

// 공지사항 목록 조회
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminMode = searchParams.get('admin') === 'true';

  try {
    if (adminMode) {
      const admin = await checkAdmin();
      if (!admin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      const announcements = await prisma.announcement.findMany({
        orderBy: [
          { isPinned: 'desc' },
          { createdAt: 'desc' }
        ]
      });
      return NextResponse.json(announcements);
    }

    // 일반 모드: 활성화된 공지만
    const announcements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('Failed to fetch announcements:', error);
    return NextResponse.json({ error: 'Failed to fetch announcements' }, { status: 500 });
  }
}

// 공지사항 생성
export async function POST(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content, type, isPinned, isActive } = body;

    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required' }, { status: 400 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        type: type || 'normal',
        isPinned: isPinned ?? false,
        isActive: isActive ?? true
      }
    });

    // 전체 알림 생성 (선택적)
    if (isActive) {
      await prisma.notification.create({
        data: {
          userId: null, // 전체 공지
          type: 'announcement',
          title: '새 공지사항',
          content: title,
          link: `/announcements/${announcement.id}`
        }
      });
    }

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Failed to create announcement:', error);
    return NextResponse.json({ error: 'Failed to create announcement' }, { status: 500 });
  }
}

// 공지사항 수정
export async function PUT(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, content, type, isPinned, isActive } = body;

    if (!id) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        title,
        content,
        type,
        isPinned,
        isActive
      }
    });

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Failed to update announcement:', error);
    return NextResponse.json({ error: 'Failed to update announcement' }, { status: 500 });
  }
}

// 공지사항 삭제
export async function DELETE(request: NextRequest) {
  const admin = await checkAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Announcement ID is required' }, { status: 400 });
    }

    await prisma.announcement.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete announcement:', error);
    return NextResponse.json({ error: 'Failed to delete announcement' }, { status: 500 });
  }
}
