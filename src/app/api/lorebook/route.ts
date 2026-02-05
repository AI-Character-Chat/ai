import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// 로어북 항목 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      workId,
      name,
      keywords,
      content,
      priority = 0,
      minIntimacy,
      minTurns,
      requiredCharacter,
    } = body;

    if (!workId || !name || !keywords || !content) {
      return NextResponse.json(
        { error: '작품 ID, 이름, 키워드, 내용은 필수입니다.' },
        { status: 400 }
      );
    }

    const entry = await prisma.lorebookEntry.create({
      data: {
        workId,
        name,
        keywords: JSON.stringify(keywords),
        content,
        priority,
        minIntimacy,
        minTurns,
        requiredCharacter,
      },
    });

    return NextResponse.json({
      ...entry,
      keywords: JSON.parse(entry.keywords),
    });
  } catch (error) {
    console.error('Error creating lorebook entry:', error);
    return NextResponse.json(
      { error: '로어북 항목 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 작품별 로어북 목록 조회
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

    const entries = await prisma.lorebookEntry.findMany({
      where: { workId },
      orderBy: { priority: 'asc' },
    });

    const entriesWithParsedKeywords = entries.map((entry) => ({
      ...entry,
      keywords: JSON.parse(entry.keywords),
    }));

    return NextResponse.json(entriesWithParsedKeywords);
  } catch (error) {
    console.error('Error fetching lorebook:', error);
    return NextResponse.json(
      { error: '로어북을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
