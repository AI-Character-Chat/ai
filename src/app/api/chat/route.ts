import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { generateStoryResponse } from '@/lib/gemini';

// 대화 히스토리 포맷팅 (3단계 시퀀스 구조 반영)
function formatConversationHistory(
  messages: Array<{
    content: string;
    messageType: string;
    character?: { name: string } | null;
  }>,
  userName: string,
  maxMessages: number = 30
): string {
  const recentMessages = messages.slice(-maxMessages);

  return recentMessages
    .map((msg) => {
      if (msg.messageType === 'narrator') {
        // Step 1의 결과물임을 명시
        return `[상황 묘사] ${msg.content}`;
      } else if (msg.messageType === 'user') {
        // 유저의 행동/대사
        return `${userName}의 행동: ${msg.content}`;
      } else if (msg.messageType === 'system') {
        return `[오프닝] ${msg.content}`;
      } else if (msg.character) {
        // Step 2 + Step 3의 결과물 (캐릭터 대사와 행동)
        return `${msg.character.name}의 반응: ${msg.content}`;
      }
      return `${userName}의 행동: ${msg.content}`;
    })
    .join('\n\n');
}

// 로어북 필터링
function filterActiveLorebookEntries(
  entries: Array<{
    keywords: string;
    content: string;
    minIntimacy: number | null;
    minTurns: number | null;
    requiredCharacter: string | null;
  }>,
  recentText: string,
  intimacy: number,
  turnCount: number,
  presentCharacters: string[]
): string {
  const activeContents: string[] = [];

  for (const entry of entries) {
    const keywords = JSON.parse(entry.keywords) as string[];

    // 키워드 매칭 확인
    const hasMatch = keywords.some((kw) =>
      recentText.toLowerCase().includes(kw.toLowerCase())
    );
    if (!hasMatch) continue;

    // 조건 확인
    if (entry.minIntimacy !== null && intimacy < entry.minIntimacy) continue;
    if (entry.minTurns !== null && turnCount < entry.minTurns) continue;
    if (
      entry.requiredCharacter !== null &&
      !presentCharacters.includes(entry.requiredCharacter)
    )
      continue;

    activeContents.push(entry.content);
  }

  return activeContents.slice(0, 5).join('\n\n');
}

// 새 채팅 세션 생성
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workId, userName = '유저', openingId } = body;

    if (!workId) {
      return NextResponse.json(
        { error: '작품 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // 작품과 오프닝 조회
    const work = await prisma.work.findUnique({
      where: { id: workId },
      include: {
        characters: true,
        openings: openingId
          ? { where: { id: openingId } }
          : { where: { isDefault: true } },
      },
    });

    if (!work) {
      return NextResponse.json(
        { error: '작품을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    if (work.openings.length === 0) {
      return NextResponse.json(
        { error: '오프닝이 설정되지 않았습니다.' },
        { status: 400 }
      );
    }

    const opening = work.openings[0];
    const allCharacterNames = work.characters.map((c) => c.name);

    // 오프닝에 설정된 초기 캐릭터 사용, 없으면 모든 캐릭터
    let initialCharacters: string[] = [];
    try {
      // initialCharacters가 이미 배열이면 그대로 사용, 문자열이면 파싱
      let parsedInitialChars: string[] = [];
      if (Array.isArray(opening.initialCharacters)) {
        parsedInitialChars = opening.initialCharacters;
      } else if (typeof opening.initialCharacters === 'string' && opening.initialCharacters) {
        parsedInitialChars = JSON.parse(opening.initialCharacters);
      }

      console.log('오프닝 initialCharacters 원본:', opening.initialCharacters);
      console.log('파싱된 initialCharacters:', parsedInitialChars);

      if (Array.isArray(parsedInitialChars) && parsedInitialChars.length > 0) {
        // 오프닝에 설정된 캐릭터만 사용 (실제 존재하는 캐릭터만 필터링)
        initialCharacters = parsedInitialChars.filter((name: string) =>
          allCharacterNames.some(charName =>
            charName === name ||
            charName.includes(name) ||
            name.includes(charName.split(' ')[0])
          )
        );
      }
    } catch (e) {
      console.log('initialCharacters 파싱 실패:', e);
    }

    // 초기 캐릭터가 설정되지 않았으면 모든 캐릭터 사용 (기존 동작 유지)
    if (initialCharacters.length === 0) {
      initialCharacters = allCharacterNames;
      console.log('초기 캐릭터 미설정 → 모든 캐릭터 사용');
    }

    console.log('=== 채팅 세션 생성 ===');
    console.log('오프닝:', opening.title);
    console.log('전체 캐릭터:', allCharacterNames);
    console.log('초기 등장 캐릭터:', initialCharacters);

    // 새 세션 생성 (장면 상태 포함)
    const session = await prisma.chatSession.create({
      data: {
        workId,
        userName,
        intimacy: 0,
        turnCount: 0,
        currentLocation: opening.initialLocation || '알 수 없는 장소',
        currentTime: opening.initialTime || '알 수 없는 시간',
        presentCharacters: JSON.stringify(initialCharacters), // 오프닝에 설정된 캐릭터만 등장
        recentEvents: JSON.stringify([]),
      },
    });

    // 오프닝 메시지 저장 (시스템 메시지)
    await prisma.message.create({
      data: {
        sessionId: session.id,
        characterId: null,
        content: opening.content,
        messageType: 'system',
      },
    });

    return NextResponse.json({
      session: {
        ...session,
        presentCharacters: JSON.parse(session.presentCharacters),
        recentEvents: JSON.parse(session.recentEvents),
      },
      opening: opening.content,
      characters: work.characters,
    });
  } catch (error) {
    console.error('Error creating chat session:', error);
    return NextResponse.json(
      { error: '채팅 세션 생성에 실패했습니다.' },
      { status: 500 }
    );
  }
}

// 메시지 전송 (통합 스토리 응답)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, content } = body;

    if (!sessionId || !content) {
      return NextResponse.json(
        { error: '세션 ID와 메시지 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    // 세션 정보 조회
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        work: {
          include: {
            characters: true,
            lorebook: true,
          },
        },
        messages: {
          include: {
            character: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const characters = session.work.characters;
    if (characters.length === 0) {
      return NextResponse.json(
        { error: '등록된 캐릭터가 없습니다.' },
        { status: 400 }
      );
    }

    // 유저 메시지 저장
    const userMessage = await prisma.message.create({
      data: {
        sessionId,
        characterId: null,
        content,
        messageType: 'user',
      },
    });

    // 현재 장면 상태
    const presentCharacters = JSON.parse(session.presentCharacters) as string[];
    const recentEvents = JSON.parse(session.recentEvents) as string[];

    // 메시지 히스토리에서 등장한 캐릭터 추출 (첫 등장 감지용)
    const appearedCharactersInHistory = new Set<string>();
    session.messages.forEach(msg => {
      if (msg.character?.name) {
        appearedCharactersInHistory.add(msg.character.name);
      }
    });
    const previousPresentCharacters = Array.from(appearedCharactersInHistory);

    // 대화 히스토리 포맷팅
    const conversationHistory = formatConversationHistory(
      session.messages,
      session.userName,
      30
    );

    // 로어북 컨텍스트 구성
    const recentText = session.messages
      .slice(-6)
      .map((m) => m.content)
      .join(' ') + ' ' + content;

    const lorebookContext = filterActiveLorebookEntries(
      session.work.lorebook,
      recentText,
      session.intimacy,
      session.turnCount,
      presentCharacters
    );

    // 세계관 설정
    const worldSetting = session.work.worldSetting || '';

    // AI 응답 생성
    let storyResponse;
    try {
      storyResponse = await generateStoryResponse(
        characters.map((c) => ({ id: c.id, name: c.name, prompt: c.prompt })),
        conversationHistory,
        content,
        session.userName,
        {
          location: session.currentLocation,
          time: session.currentTime,
          presentCharacters,
          recentEvents,
        },
        lorebookContext,
        worldSetting,
        previousPresentCharacters
      );
    } catch (aiError) {
      console.error('=== AI 응답 생성 실패 ===');
      console.error('에러:', aiError);
      console.error('세션 ID:', sessionId);
      console.error('유저 메시지:', content);
      console.error('캐릭터 수:', characters.length);

      // AI 에러는 generateStoryResponse 내부에서 처리되므로 여기까지 오면 심각한 에러
      throw new Error(`AI 응답 생성 중 예상치 못한 오류: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
    }

    // 나레이션 저장 (있는 경우)
    if (storyResponse.narratorNote) {
      await prisma.message.create({
        data: {
          sessionId,
          characterId: null,
          content: storyResponse.narratorNote,
          messageType: 'narrator',
        },
      });
    }

    // 캐릭터 응답들 저장
    const savedResponses = await Promise.all(
      storyResponse.responses.map(async (response) => {
        const message = await prisma.message.create({
          data: {
            sessionId,
            characterId: response.characterId,
            content: response.content,
            messageType: 'dialogue',
          },
          include: {
            character: true,
          },
        });

        return message;
      })
    );

    // 최근 사건 구성 (3단계 시퀀스 요약)
    const newEvents: string[] = [];

    // 유저의 행동
    newEvents.push(`${session.userName}: ${content.substring(0, 50)}`);

    // 나레이션 요약 (있는 경우)
    if (storyResponse.narratorNote) {
      const narratorSummary = storyResponse.narratorNote.substring(0, 60);
      newEvents.push(`[상황] ${narratorSummary}...`);
    }

    // 캐릭터 반응 요약
    if (storyResponse.responses.length > 0) {
      const firstResponse = storyResponse.responses[0];
      const responseSummary = firstResponse.content.substring(0, 40);
      newEvents.push(`${firstResponse.characterName}: ${responseSummary}...`);
    }

    // 세션 업데이트 (장면 상태 포함)
    const updatedSession = await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        turnCount: session.turnCount + 1,
        intimacy: Math.min(session.intimacy + 0.1, 10),
        currentLocation: storyResponse.updatedScene.location,
        currentTime: storyResponse.updatedScene.time,
        presentCharacters: JSON.stringify(storyResponse.updatedScene.presentCharacters),
        // 최근 사건 업데이트 (최대 10개 유지) - 3단계 시퀀스 요약 포함
        recentEvents: JSON.stringify(
          [...recentEvents, ...newEvents].slice(-10)
        ),
      },
    });

    // 현재 장면에 등장하는 캐릭터 정보 (이미지 생성용)
    // 디버깅: 캐릭터 이름 매칭 확인
    console.log('=== 이미지 생성용 캐릭터 정보 ===');
    console.log('DB 캐릭터들:', characters.map(c => ({ name: c.name, hasProfile: !!c.profileImage })));
    console.log('장면 캐릭터들:', storyResponse.updatedScene.presentCharacters);

    const presentCharacterProfiles = characters
      .filter(c => {
        // 정확한 매칭 또는 부분 매칭 시도
        const isPresent = storyResponse.updatedScene.presentCharacters.some(
          presentName =>
            presentName === c.name ||
            presentName.includes(c.name) ||
            c.name.includes(presentName) ||
            // 괄호 안의 이름으로도 매칭 (예: "아셀 (Acel)" -> "아셀")
            c.name.split(' ')[0] === presentName ||
            presentName.split(' ')[0] === c.name.split(' ')[0]
        );
        return isPresent;
      })
      .map(c => ({ name: c.name, profileImage: c.profileImage }));

    console.log('매칭된 캐릭터:', presentCharacterProfiles.map(c => ({ name: c.name, hasProfile: !!c.profileImage })));

    // 캐릭터별 대사 및 감정 정보 (이미지 생성시 사용)
    const characterDialogues = storyResponse.responses.map(r => ({
      name: r.characterName,
      dialogue: r.content,
      emotion: r.emotion,  // AI가 분석한 감정 태그 포함
    }));

    console.log('📤 이미지 생성용 감정 정보:');
    characterDialogues.forEach(d => {
      console.log(`   - ${d.name}: ${d.emotion.primary} (강도: ${d.emotion.intensity})`);
    });

    return NextResponse.json({
      userMessage,
      narratorNote: storyResponse.narratorNote,
      presentCharacters: presentCharacterProfiles,  // 이미지 생성용 캐릭터 프로필
      characterDialogues,  // 이미지 생성용 캐릭터 대사 + 감정
      characterResponses: savedResponses,
      session: {
        ...updatedSession,
        presentCharacters: JSON.parse(updatedSession.presentCharacters),
        recentEvents: JSON.parse(updatedSession.recentEvents),
      },
      sceneUpdate: storyResponse.updatedScene,
    });
  } catch (error) {
    console.error('=== 메시지 전송 에러 ===');
    console.error('에러 타입:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('에러 메시지:', error instanceof Error ? error.message : String(error));

    // Prisma 에러 처리 (공식 문서 기반)
    // 참고: https://www.prisma.io/docs/orm/prisma-client/debugging-and-troubleshooting/handling-exceptions-and-errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error('Prisma 에러 코드:', error.code);

      // P2002: Unique constraint violation
      if (error.code === 'P2002') {
        return NextResponse.json(
          { error: '중복된 데이터가 있습니다. 다시 시도해주세요.' },
          { status: 409 }
        );
      }

      // P2025: Record not found
      if (error.code === 'P2025') {
        return NextResponse.json(
          { error: '요청한 데이터를 찾을 수 없습니다.' },
          { status: 404 }
        );
      }

      // 기타 Prisma 에러
      return NextResponse.json(
        { error: '데이터베이스 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // Prisma 연결 에러
    if (error instanceof Prisma.PrismaClientInitializationError) {
      console.error('Prisma 초기화 에러:', error.message);
      return NextResponse.json(
        { error: '데이터베이스 연결에 실패했습니다.' },
        { status: 503 }
      );
    }

    // 일반 에러 처리
    const errorMessage = error instanceof Error ? error.message : String(error);
    const userMessage = errorMessage.includes('API') || errorMessage.includes('인증')
      ? 'AI 서비스 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
      : '메시지 전송에 실패했습니다. 잠시 후 다시 시도해주세요.';

    return NextResponse.json(
      {
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

// 세션 메시지 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: '세션 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        work: {
          include: {
            characters: true,
          },
        },
        messages: {
          include: {
            character: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: '세션을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...session,
      presentCharacters: JSON.parse(session.presentCharacters),
      recentEvents: JSON.parse(session.recentEvents),
    });
  } catch (error) {
    console.error('Error fetching session:', error);

    // Prisma 에러 처리 (공식 문서 기반)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return NextResponse.json(
          { error: '세션을 찾을 수 없습니다.' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: '세션을 불러오는데 실패했습니다.' },
      { status: 500 }
    );
  }
}
