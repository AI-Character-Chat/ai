import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 공지사항 상세 조회
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: params.id },
    });

    if (!announcement) {
      return NextResponse.json(
        { error: '공지사항을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Error fetching announcement:', error);
    return NextResponse.json(
      { error: '공지사항을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
