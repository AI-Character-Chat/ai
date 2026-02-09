import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

// 팔로우 상태 조회
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // 팔로워/팔로잉 수 조회
    const [followersCount, followingCount] = await Promise.all([
      prisma.follow.count({ where: { followingId: targetUserId } }),
      prisma.follow.count({ where: { followerId: targetUserId } })
    ]);

    // 로그인한 유저가 해당 유저를 팔로우 중인지 확인
    let isFollowing = false;
    if (session?.user?.id) {
      const follow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: session.user.id,
            followingId: targetUserId
          }
        }
      });
      isFollowing = !!follow;
    }

    return NextResponse.json({
      followersCount,
      followingCount,
      isFollowing
    });
  } catch (error) {
    console.error('Failed to get follow status:', error);
    return NextResponse.json({ error: 'Failed to get follow status' }, { status: 500 });
  }
}

// 팔로우/언팔로우 토글
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json({ error: 'Target user ID is required' }, { status: 400 });
    }

    // 자기 자신을 팔로우할 수 없음
    if (session.user.id === targetUserId) {
      return NextResponse.json({ error: 'Cannot follow yourself' }, { status: 400 });
    }

    // 대상 유저 존재 확인
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // 기존 팔로우 관계 확인
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: session.user.id,
          followingId: targetUserId
        }
      }
    });

    let isFollowing: boolean;

    if (existingFollow) {
      // 언팔로우
      await prisma.follow.delete({
        where: { id: existingFollow.id }
      });
      isFollowing = false;
    } else {
      // 팔로우
      await prisma.follow.create({
        data: {
          followerId: session.user.id,
          followingId: targetUserId
        }
      });
      isFollowing = true;

      // 알림 생성
      await prisma.notification.create({
        data: {
          userId: targetUserId,
          type: 'follow',
          title: '새로운 팔로워',
          content: `${session.user.name || '누군가'}님이 회원님을 팔로우하기 시작했습니다.`,
          link: `/author/${session.user.id}`
        }
      });
    }

    // 업데이트된 팔로워 수 반환
    const followersCount = await prisma.follow.count({
      where: { followingId: targetUserId }
    });

    return NextResponse.json({
      isFollowing,
      followersCount
    });
  } catch (error) {
    console.error('Failed to toggle follow:', error);
    return NextResponse.json({ error: 'Failed to toggle follow' }, { status: 500 });
  }
}
