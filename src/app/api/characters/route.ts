import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { prismaErrorToResponse } from '@/lib/prismaErrorHandler';

// 캐릭터 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workId, name, profileImage, prompt } = body;

    if (!workId || !name || !prompt) {
      return NextResponse.json(
        { error: '작품 ID, 이름, 프롬프트는 필수입니다.' },
        { status: 400 }
      );
    }

    // 작품 존재 확인
    const work = await prisma.work.findUnique({
      where: { id: workId },
    });

    if (!work) {
      return NextResponse.json(
        { error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const character = await prisma.character.create({
      data: {
        workId,
        name,
        profileImage,
        prompt,
      },
    });

    return NextResponse.json(character);
  } catch (error) {
    console.error('Error creating character:', error);
    // Prisma 에러 처리 (공식 문서 기반)
    if (error instanceof Error && error.constructor.name.includes('Prisma')) {
      return prismaErrorToResponse(error);
    }
    return NextResponse.json(
      { error: '캐릭터 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품별 캐릭터 목록 조회
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

    const characters = await prisma.character.findMany({
      where: { workId },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(characters);
  } catch (error) {
    console.error('Error fetching characters:', error);
    // Prisma 에러 처리 (공식 문서 기반)
    if (error instanceof Error && error.constructor.name.includes('Prisma')) {
      return prismaErrorToResponse(error);
    }
    return NextResponse.json(
      { error: '캐릭터 목록을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
