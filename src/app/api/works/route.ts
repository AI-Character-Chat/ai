import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prismaErrorToResponse } from '@/lib/prismaErrorHandler';

// 작품 목록 조회
export async function GET() {
  try {
    const works = await prisma.work.findMany({
      include: {
        characters: true,
        openings: {
          where: { isDefault: true },
          take: 1,
        },
        _count: {
          select: { characters: true, openings: true, lorebook: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // tags JSON 파싱
    const worksWithParsedTags = works.map((work) => ({
      ...work,
      tags: JSON.parse(work.tags),
    }));

    return NextResponse.json(worksWithParsedTags);
  } catch (error) {
    console.error('Error fetching works:', error);
    // Prisma 에러 처리 (공식 문서 기반)
    if (error instanceof Error && error.constructor.name.includes('Prisma')) {
      return prismaErrorToResponse(error);
    }
    return NextResponse.json(
      { error: '작품 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      thumbnail,
      tags = [],
      targetAudience = 'all',
      visibility = 'private',
      isAdult = false,
    } = body;

    if (!title || !description) {
      return NextResponse.json(
        { error: '제목과 소개는 필수입니다.' },
        { status: 400 }
      );
    }

    const work = await prisma.work.create({
      data: {
        title,
        description,
        thumbnail,
        tags: JSON.stringify(tags),
        targetAudience,
        visibility,
        isAdult,
      },
    });

    return NextResponse.json({
      ...work,
      tags: JSON.parse(work.tags),
    });
  } catch (error) {
    console.error('Error creating work:', error);
    // Prisma 에러 처리 (공식 문서 기반)
    if (error instanceof Error && error.constructor.name.includes('Prisma')) {
      return prismaErrorToResponse(error);
    }
    return NextResponse.json(
      { error: '작품 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}
