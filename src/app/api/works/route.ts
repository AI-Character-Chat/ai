import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prismaErrorToResponse } from '@/lib/prismaErrorHandler';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 안전한 JSON 파싱 헬퍼
function safeJsonParse(str: string, defaultValue: unknown = []) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

// 작품 목록 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const url = new URL(request.url);
    const publicOnly = url.searchParams.get('public') === 'true';
    const authorId = url.searchParams.get('authorId');
    const searchQuery = url.searchParams.get('search');

    // 검색 요청 처리
    if (searchQuery) {
      const works = await prisma.work.findMany({
        where: {
          visibility: 'public',
          OR: [
            { title: { contains: searchQuery } },
            { description: { contains: searchQuery } },
            { tags: { contains: searchQuery } },
            {
              characters: {
                some: {
                  name: { contains: searchQuery },
                },
              },
            },
          ],
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              bio: true,
            },
          },
          characters: {
            select: {
              id: true,
              name: true,
              profileImage: true,
            },
          },
          _count: {
            select: { characters: true, openings: true, lorebook: true, chatSessions: true, likes: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20, // 검색 결과 최대 20개
      });

      const worksWithParsedTags = works.map((work) => ({
        ...work,
        tags: safeJsonParse(work.tags, []),
      }));

      return NextResponse.json({ works: worksWithParsedTags });
    }

    if (publicOnly) {
      // 공개 작품 전체 (메인 페이지용) 또는 특정 작가 작품
      const whereClause: { visibility: string; authorId?: string } = {
        visibility: 'public',
      };

      if (authorId) {
        whereClause.authorId = authorId;
      }

      const works = await prisma.work.findMany({
        where: whereClause,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              image: true,
              bio: true,
            },
          },
          characters: true,
          openings: {
            orderBy: { order: 'asc' },
          },
          _count: {
            select: { characters: true, openings: true, lorebook: true, chatSessions: true, likes: true },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      const worksWithParsedTags = works.map((work) => ({
        ...work,
        tags: safeJsonParse(work.tags, []),
      }));

      return NextResponse.json(worksWithParsedTags);
    }

    // 스튜디오용: 로그인한 사용자의 작품만
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const works = await prisma.work.findMany({
      where: {
        authorId: session.user.id,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            image: true,
            bio: true,
          },
        },
        characters: true,
        openings: {
          orderBy: { order: 'asc' },
        },
        _count: {
          select: { characters: true, openings: true, lorebook: true, chatSessions: true, likes: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // tags JSON 파싱 (안전하게)
    const worksWithParsedTags = works.map((work) => ({
      ...work,
      tags: safeJsonParse(work.tags, []),
    }));

    return NextResponse.json(worksWithParsedTags);
  } catch (error) {
    console.error('Error fetching works:', error);
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
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

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
        authorId: session.user.id,
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
