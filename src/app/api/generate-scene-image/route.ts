import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { generateSceneImageAsync, checkPredictionStatus } from '@/lib/replicateImageGeneration';
import prisma from '@/lib/prisma';

/**
 * 장면 이미지 생성 API (Replicate)
 *
 * POST: 이미지 생성 요청 → predictionId 반환 (또는 캐시된 imageUrl)
 * GET:  prediction 상태 폴링 → 완료 시 imageUrl 반환
 */

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, messageId, narratorText, characterProfiles, characterDialogues, sceneState } = body;

    if (!narratorText || !sessionId) {
      return NextResponse.json({ error: 'narratorText와 sessionId가 필요합니다.' }, { status: 400 });
    }

    // 세션 소유권 확인 + workId 가져오기
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { userId: true, workId: true },
    });

    if (!chatSession || chatSession.userId !== session.user.id) {
      return NextResponse.json({ error: '접근 권한이 없습니다.' }, { status: 403 });
    }

    // 캐릭터 외모 정보를 DB에서 직접 조회 (SSE를 통해 보내지 않고)
    const characterNames = (characterProfiles || []).map((c: { name: string }) => c.name);
    const dbCharacters = await prisma.character.findMany({
      where: { workId: chatSession.workId, name: { in: characterNames } },
      select: { name: true, profileImage: true, prompt: true },
    });

    // DB 캐릭터 정보로 프로필 보강
    const enrichedProfiles = characterNames.map((name: string) => {
      const dbChar = dbCharacters.find(c => c.name === name);
      return {
        name,
        profileImage: dbChar?.profileImage || null,
        prompt: dbChar?.prompt || null,
      };
    });

    console.log('[generate-scene-image] 요청:', { sessionId, messageId, narratorTextLen: narratorText?.length, profilesCount: enrichedProfiles.length });

    const result = await generateSceneImageAsync({
      narratorText,
      characterProfiles: enrichedProfiles,
      characterDialogues: characterDialogues || [],
      sceneState,
    });

    console.log('[generate-scene-image] 결과:', JSON.stringify(result));

    if (!result.success) {
      return NextResponse.json({ error: result.error || '이미지 생성 실패' }, { status: 500 });
    }

    // 캐시 히트 → 즉시 Message.imageUrl 업데이트
    if (result.cached && result.imageUrl && messageId) {
      await prisma.message.update({
        where: { id: messageId },
        data: { imageUrl: result.imageUrl },
      }).catch(e => console.error('[SceneImage] Message 업데이트 실패:', e));
    }

    return NextResponse.json({
      success: true,
      predictionId: result.predictionId,
      imageUrl: result.imageUrl,
      cached: result.cached,
    });
  } catch (error) {
    console.error('[generate-scene-image POST]', error);
    return NextResponse.json(
      { error: '이미지 생성 중 오류', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const predictionId = request.nextUrl.searchParams.get('predictionId');
    const messageId = request.nextUrl.searchParams.get('messageId');

    if (!predictionId) {
      return NextResponse.json({ error: 'predictionId가 필요합니다.' }, { status: 400 });
    }

    const result = await checkPredictionStatus(predictionId, messageId || undefined);

    if (!result.success && result.error) {
      return NextResponse.json({
        status: 'failed',
        error: result.error,
      });
    }

    if (result.imageUrl) {
      return NextResponse.json({
        status: 'succeeded',
        imageUrl: result.imageUrl,
      });
    }

    // 아직 처리 중
    return NextResponse.json({
      status: 'processing',
    });
  } catch (error) {
    console.error('[generate-scene-image GET]', error);
    return NextResponse.json(
      { error: '상태 확인 중 오류', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
