import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 로그인한 유저의 작품 목록 조회
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const works = await prisma.work.findMany({
      where: {
        authorId: session.user.id,
      },
      include: {
        characters: {
          select: {
            id: true,
            name: true,
            profileImage: true,
          },
        },
        _count: {
          select: {
            chatSessions: true,
            likes: true,
            characters: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ works });
  } catch (error) {
    console.error('Error fetching user works:', error);
    return NextResponse.json(
      { error: '작품 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
