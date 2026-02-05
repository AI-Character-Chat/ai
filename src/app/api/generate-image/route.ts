import { NextRequest, NextResponse } from 'next/server';
import { generateSceneImage } from '@/lib/imageGeneration';

/**
 * 상황 이미지 생성 API
 * POST /api/generate-image
 *
 * 요청 본문:
 * - narratorText: 나레이션 텍스트 (상황 묘사)
 * - characters: 캐릭터 프로필 배열 (name, profileImage)
 * - dialogues: 캐릭터 대사 배열 (name, dialogue) - 감정/행동 힌트용
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { narratorText, characters, dialogues } = body;

    if (!narratorText) {
      return NextResponse.json(
        { error: '나레이션 텍스트가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('=== 상황 이미지 생성 API ===');
    console.log('나레이션:', narratorText.substring(0, 100) + '...');
    console.log('캐릭터 수:', characters?.length || 0);
    console.log('대사 수:', dialogues?.length || 0);

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

    console.log('=== 이미지 생성 완료 ===');
    console.log('URL:', result.imageUrl);

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
