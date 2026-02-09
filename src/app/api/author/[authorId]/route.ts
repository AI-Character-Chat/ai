import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 안전한 JSON 파싱 헬퍼
function safeJsonParse(str: string, defaultValue: unknown = []) {
  try {
    return JSON.parse(str);
  } catch {
    return defaultValue;
  }
}

// 작가 정보 조회
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ authorId: string }> }
) {
  try {
    const session = await auth();
    const { authorId } = await params;

    // 작가 정보 조회
    const author = await prisma.user.findUnique({
      where: { id: authorId },
      select: {
        id: true,
        name: true,
        image: true,
        bio: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            works: true
          }
        }
      }
    });

    if (!author) {
      return NextResponse.json({ error: 'Author not found' }, { status: 404 });
    }

    // 작가의 공개 작품들 조회
    const works = await prisma.work.findMany({
      where: {
        authorId: authorId,
        visibility: 'public'
      },
      include: {
        characters: {
          select: {
            id: true,
            name: true,
            profileImage: true
          }
        },
        _count: {
          select: {
            likes: true,
            chatSessions: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    // 총 대화량 계산
    const totalChatSessions = works.reduce((sum, work) => sum + work._count.chatSessions, 0);

    // 대화량 순위 계산 (모든 작가 중)
    const allAuthorsWithChats = await prisma.user.findMany({
      where: {
        works: {
          some: {
            visibility: 'public'
          }
        }
      },
      select: {
        id: true,
        works: {
          where: { visibility: 'public' },
          select: {
            _count: {
              select: { chatSessions: true }
            }
          }
        }
      }
    });

    // 각 작가의 총 대화량 계산 및 정렬
    const authorsWithTotalChats = allAuthorsWithChats.map(a => ({
      id: a.id,
      totalChats: a.works.reduce((sum, w) => sum + w._count.chatSessions, 0)
    })).sort((a, b) => b.totalChats - a.totalChats);

    const rank = authorsWithTotalChats.findIndex(a => a.id === authorId) + 1;
    const totalAuthors = authorsWithTotalChats.length;

    // 로그인한 유저가 팔로우 중인지 확인
    let isFollowing = false;
    if (session?.user?.id && session.user.id !== authorId) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: session.user.id,
            followingId: authorId
          }
        }
      });
      isFollowing = !!follow;
    }

    // 작품 데이터 정리
    const worksWithParsedTags = works.map(work => ({
      ...work,
      tags: safeJsonParse((work as { tags?: string }).tags || '[]', [])
    }));

    return NextResponse.json({
      author: {
        ...author,
        followersCount: author._count.followers,
        followingCount: author._count.following,
        worksCount: author._count.works
      },
      works: worksWithParsedTags,
      stats: {
        totalChatSessions,
        rank,
        totalAuthors
      },
      isFollowing
    });
  } catch (error) {
    console.error('Failed to fetch author:', error);
    return NextResponse.json({ error: 'Failed to fetch author' }, { status: 500 });
  }
}
