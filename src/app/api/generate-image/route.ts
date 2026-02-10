import { NextRequest, NextResponse } from 'next/server';
import { generateSceneImage } from '@/lib/imageGeneration';
import { auth } from '@/lib/auth';

/**
 * 상황 이미지 생성 API
 * POST /api/generate-image
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { narratorText, characters, dialogues } = body;

    if (!narratorText) {
      return NextResponse.json(
        { error: '나레이션 텍스트가 필요합니다.' },
        { status: 400 }
      );
    }

    // Gemini로 이미지 생성 (프로필 없는 캐릭터는 실루엣으로)
    const result = await generateSceneImage(
      narratorText,
      characters || [],
      dialogues || []
    );

    if (!result.success || !result.imageUrl) {
      console.error('이미지 생성 실패:', result.error);
      return NextResponse.json(
        {
          error: '이미지 생성에 실패했습니다.',
          details: result.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      imageUrl: result.imageUrl,
    });

  } catch (error) {
    console.error('=== 이미지 생성 API 에러 ===');
    console.error(error);

    return NextResponse.json(
      {
        error: '이미지 생성 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
