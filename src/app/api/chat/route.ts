import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { generateStoryResponse } from '@/lib/gemini';
import {
  formatMemoriesForPrompt,
  searchMemoriesForMultipleCharacters,
  saveConversationsForMultipleCharacters,
} from '@/lib/memory';
import {
  formatConversationHistory,
  filterActiveLorebookEntries,
  extractRecentText,
  extractKeywords,
} from '@/lib/prompt-builder';
import narrativeMemory from '@/lib/narrative-memory';
import { auth } from '@/lib/auth';

// 새 채팅 세션 생성
export async function POST(request: NextRequest) {
  try {
    // 인증 세션 확인 (로그인 필수)
    const authSession = await auth();

    if (!authSession?.user?.id) {
      return NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      );
    }

    const userId = authSession.user.id;
    const body = await request.json();
    const { workId, userName = '유저', openingId, personaId } = body;

    // 유저 이름 설정
    const finalUserName = authSession.user.name || userName;

    // 페르소나 정보 조회 (선택된 경우)
    let userPersona: {
      name: string;
      age: number | null;
      gender: string;
      description: string | null;
    } = {
      name: finalUserName,
      age: null,
      gender: 'private',
      description: null,
    };

    if (personaId && userId) {
      const persona = await prisma.persona.findUnique({
        where: { id: personaId },
      });
      if (persona && persona.userId === userId) {
        userPersona = {
          name: persona.name,
          age: persona.age,
          gender: persona.gender,
          description: persona.description,
        };
      }
    }

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
      let parsedInitialChars: string[] = [];
      if (Array.isArray(opening.initialCharacters)) {
        parsedInitialChars = opening.initialCharacters;
      } else if (typeof opening.initialCharacters === 'string' && opening.initialCharacters) {
        parsedInitialChars = JSON.parse(opening.initialCharacters);
      }

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

    // 초기 캐릭터가 설정되지 않았으면 모든 캐릭터 사용
    if (initialCharacters.length === 0) {
      initialCharacters = allCharacterNames;
    }

    console.log(`[Session] 생성: ${opening.title} (캐릭터: ${initialCharacters.length}명)`);

    // === 세션 생성 시 장기 기억 초기 로드 (캐싱) ===
    const memUserId = `user_${userId}`;
    let initialMemoryCache: Record<string, any> = { lastUpdated: Date.now() };

    // 초기 등장 캐릭터 전체의 기억 로드 (병렬 처리로 429 방지)
    const initialChars = work.characters.filter(c => initialCharacters.includes(c.name));

    if (initialChars.length > 0) {
      try {
        // 다중 캐릭터 병렬 검색 함수 사용 (공식 문서 패턴)
        const characterIds = initialChars.map(c => c.id);
        const memoriesMap = await searchMemoriesForMultipleCharacters(
          "유저에 대한 정보와 선호도",
          memUserId,
          characterIds,
          10
        );

        // Map을 캐시 객체로 변환
        memoriesMap.forEach((memories, charId) => {
          initialMemoryCache[charId] = memories;
        });

        const totalMemories = Array.from(memoriesMap.values()).reduce((sum, m) => sum + m.length, 0);
        console.log(`[Memory] 초기 기억 로드: ${characterIds.length}개 캐릭터, 총 ${totalMemories}개 기억`);
      } catch (error) {
        console.log('[Memory] 초기 장기 기억 로드 스킵 (오류 발생)');
      }
    }

    // 새 세션 생성 (캐시된 기억 + 페르소나 정보 포함)
    const session = await prisma.chatSession.create({
      data: {
        workId,
        userId,
        userName: userPersona.name,
        intimacy: 0,
        turnCount: 0,
        currentLocation: opening.initialLocation || '알 수 없는 장소',
        currentTime: opening.initialTime || '알 수 없는 시간',
        presentCharacters: JSON.stringify(initialCharacters),
        recentEvents: JSON.stringify([]),
        characterMemories: JSON.stringify(initialMemoryCache), // 캐시된 장기 기억
        userPersona: JSON.stringify(userPersona), // 유저 페르소나 정보
      },
    });

    // 오프닝 메시지 저장
    await prisma.message.create({
      data: {
        sessionId: session.id,
        characterId: null,
        content: opening.content,
        messageType: 'system',
      },
    });

    // === 서사 기억 시스템 초기화 ===
    const initialCharacterIds = work.characters
      .filter(c => initialCharacters.includes(c.name))
      .map(c => c.id);

    const sceneId = await narrativeMemory.startScene({
      sessionId: session.id,
      location: opening.initialLocation || '알 수 없는 장소',
      time: opening.initialTime || '알 수 없는 시간',
      participants: initialCharacterIds,
    });

    // 초기 등장 캐릭터들과의 관계 초기화
    for (const char of work.characters.filter(c => initialCharacters.includes(c.name))) {
      await narrativeMemory.getOrCreateRelationship(session.id, char.id, char.name);
    }

    // 오프닝 내용을 원본 대화 로그에 저장
    await narrativeMemory.saveConversationLog({
      sessionId: session.id,
      speakerType: 'narrator',
      speakerName: '시스템',
      content: opening.content,
      sceneId,
    });

    console.log(`[NarrativeMemory] 세션 ${session.id} 초기화 완료`);

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
    // 인증 확인
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionId, content } = body;

    if (!sessionId || !content) {
      return NextResponse.json(
        { error: '세션 ID와 메시지 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    // 메시지 길이 검증
    if (typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: '메시지 내용이 비어있습니다.' }, { status: 400 });
    }
    if (content.length > 5000) {
      return NextResponse.json({ error: '메시지는 5000자 이하여야 합니다.' }, { status: 400 });
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

    // 세션 소유자 확인
    if (session.userId && session.userId !== authSession.user.id) {
      return NextResponse.json({ error: '이 세션에 대한 접근 권한이 없습니다.' }, { status: 403 });
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

    // 대화 히스토리 포맷팅 (prompt-builder 사용)
    const conversationHistory = formatConversationHistory(
      session.messages,
      session.userName
    );

    // 로어북 컨텍스트 구성 (prompt-builder 사용)
    const recentText = extractRecentText(session.messages, content);
    const lorebookContext = filterActiveLorebookEntries(
      session.work.lorebook,
      recentText,
      session.intimacy,
      session.turnCount,
      presentCharacters
    );

    // 세계관 설정
    const worldSetting = session.work.worldSetting || '';

    // === 서사 기억 시스템 ===
    let activeScene = await narrativeMemory.getActiveScene(sessionId);

    // 장면이 없으면 새로 생성
    if (!activeScene) {
      const participantIds = characters
        .filter(c => presentCharacters.includes(c.name))
        .map(c => c.id);

      const sceneId = await narrativeMemory.startScene({
        sessionId,
        location: session.currentLocation,
        time: session.currentTime,
        participants: participantIds,
      });

      activeScene = await narrativeMemory.getActiveScene(sessionId);
    }

    // 유저 메시지를 원본 대화 로그에 저장
    await narrativeMemory.saveConversationLog({
      sessionId,
      speakerType: 'user',
      speakerName: session.userName,
      content,
      sceneId: activeScene?.sceneId,
    });

    // === 현재 장면 캐릭터만 처리 (최적화) ===
    // 모든 캐릭터가 아닌, 현재 장면에 있는 캐릭터만 처리
    const presentCharacterSet = new Set(presentCharacters);
    const activeCharacters = characters.filter(c =>
      presentCharacterSet.has(c.name) ||
      presentCharacters.some(pc => c.name.includes(pc) || pc.includes(c.name.split(' ')[0]))
    );

    // 활성 캐릭터 로그 (개발환경에서만)
    if (process.env.NODE_ENV === 'development') {
      console.log(`🎭 활성 캐릭터: ${activeCharacters.length}/${characters.length}명`);
    }

    // === 장기 기억 시스템 (캐시 기반 최적화) ===
    // 1. 세션 생성 시 Mem0에서 장기 기억 로드하여 캐시
    // 2. 매 턴마다 캐시된 기억 사용 (API 호출 없음)
    // 3. 10턴마다 캐시 갱신 (새로운 기억 반영)
    const memUserId = `user_${session.userId}`;

    // 캐시된 장기 기억 로드
    let memoryCache: Record<string, any> = {};
    try {
      memoryCache = JSON.parse(session.characterMemories || '{}');
    } catch {
      memoryCache = { lastUpdated: Date.now() };
    }
    const cacheLastUpdated = memoryCache.lastUpdated || 0;

    // 10턴마다 또는 5분마다 캐시 갱신
    const shouldRefreshCache =
      session.turnCount > 0 &&
      (session.turnCount % 10 === 0 || Date.now() - cacheLastUpdated > 5 * 60 * 1000);

    // 메모리 상태 로그 (개발환경에서만)
    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 턴 ${session.turnCount}: 메모리 캐시 ${shouldRefreshCache ? '갱신' : '사용'}`);
    }

    // 타임아웃 헬퍼 (500ms 제한)
    const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 500): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))
      ]);

    // 캐시 갱신이 필요한 경우에만 API 호출 (현재 장면 캐릭터 전체)
    if (shouldRefreshCache && activeCharacters.length > 0) {
      try {
        // 현재 장면의 모든 캐릭터 기억 병렬 로드 (공식 문서 패턴)
        const characterIds = activeCharacters.map(c => c.id);
        const memoriesMap = await withTimeout(
          searchMemoriesForMultipleCharacters(content, memUserId, characterIds, 5),
          new Map<string, string[]>(),
          3000  // 다중 캐릭터는 타임아웃 늘림
        );

        // Map을 캐시 객체로 변환
        memoriesMap.forEach((memories, charId) => {
          memoryCache[charId] = memories;
        });

        memoryCache.lastUpdated = Date.now();
        const totalMemories = Array.from(memoriesMap.values()).reduce((sum, m) => sum + m.length, 0);
        console.log(`[Memory] 캐시 갱신: ${characterIds.length}개 캐릭터, 총 ${totalMemories}개 기억`);

        // 비동기로 세션 업데이트 (응답 지연 방지)
        prisma.chatSession.update({
          where: { id: sessionId },
          data: { characterMemories: JSON.stringify(memoryCache) }
        }).catch(() => {});
      } catch (error) {
        console.log('[Memory] 캐시 갱신 실패 - 기존 캐시 사용');
      }
    }

    // 서사 컨텍스트 로드 (현재 장면 모든 캐릭터)
    const narrativeResults = await Promise.all(
      activeCharacters.map(async (char) => {
        return withTimeout(
          narrativeMemory.buildNarrativeContext(sessionId, char.id, char.name)
            .then(ctx => ({ charId: char.id, prompt: ctx.narrativePrompt || '' }))
            .catch(() => ({ charId: char.id, prompt: '' })),
          { charId: char.id, prompt: '' },
          1000  // 캐릭터당 1초 타임아웃
        );
      })
    );

    // 결과를 Map으로 변환
    const narrativeContexts = new Map(
      narrativeResults.map(r => [r.charId, r.prompt])
    );

    // 서사 컨텍스트 + 캐시된 Mem0 기억을 캐릭터 프롬프트에 주입
    const charactersWithMemory = activeCharacters.map((c) => {
      const narrativeContext = narrativeContexts.get(c.id) || '';
      // 캐시된 기억 사용 (API 호출 없음)
      const cachedMemories = memoryCache[c.id] || [];
      const mem0Context = formatMemoriesForPrompt(cachedMemories, c.name);

      let fullContext = '';
      if (narrativeContext) fullContext += '\n\n' + narrativeContext;
      if (mem0Context) fullContext += '\n\n' + mem0Context;

      return {
        id: c.id,
        name: c.name,
        prompt: c.prompt + fullContext,
      };
    });

    // 유저 페르소나 파싱
    let userPersona: {
      name: string;
      age: number | null;
      gender: string;
      description: string | null;
    } | undefined;

    try {
      const parsedPersona = JSON.parse(session.userPersona || '{}');
      if (parsedPersona.name) {
        userPersona = parsedPersona;
      }
    } catch {
      // 페르소나 파싱 실패 시 무시
    }

    // AI 응답 생성 (페르소나 포함)
    let storyResponse;
    try {
      storyResponse = await generateStoryResponse(
        charactersWithMemory,
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
        previousPresentCharacters,
        userPersona
      );
    } catch (aiError) {
      console.error('AI 응답 생성 실패:', aiError);
      throw new Error(`AI 응답 생성 오류: ${aiError instanceof Error ? aiError.message : String(aiError)}`);
    }

    // 나레이션 저장
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

    // === 서사 기억 저장 ===
    try {
      // 나레이션 저장
      if (storyResponse.narratorNote) {
        await narrativeMemory.saveConversationLog({
          sessionId,
          speakerType: 'narrator',
          speakerName: '나레이터',
          content: storyResponse.narratorNote,
          sceneId: activeScene?.sceneId,
        });
      }

      // 캐릭터 응답 저장 + 관계 업데이트
      for (const response of storyResponse.responses) {
        await narrativeMemory.saveConversationLog({
          sessionId,
          speakerType: 'character',
          speakerId: response.characterId,
          speakerName: response.characterName,
          content: response.content,
          sceneId: activeScene?.sceneId,
          emotionTag: response.emotion,
        });

        await narrativeMemory.updateRelationship(
          sessionId,
          response.characterId,
          activeScene?.sceneId,
          { intimacyDelta: 0.5 }
        );
      }

      // 장면 토픽 업데이트
      if (activeScene) {
        const keywords = extractKeywords(content);
        if (keywords.length > 0) {
          await narrativeMemory.updateScene(activeScene.sceneId, { topics: keywords });
        }
      }
    } catch (narrativeError) {
      console.error('[NarrativeMemory] 저장 실패:', narrativeError);
    }

    // === Mem0 장기 기억 저장 (10턴마다만 - API 호출 최소화) ===
    // 단기 기억은 대화 히스토리로 처리됨
    const shouldSaveMemory = session.turnCount > 0 && session.turnCount % 10 === 0;

    if (shouldSaveMemory && storyResponse.responses.length > 0) {
      try {
        // 응답한 모든 캐릭터의 대화를 병렬 저장 (공식 문서 패턴)
        const conversations = storyResponse.responses.map(response => ({
          characterId: response.characterId,
          messages: [
            { role: 'user', content: `${session.userName}: ${content}` },
            { role: 'assistant', content: `${response.characterName}: ${response.content}` },
          ],
        }));

        if (process.env.NODE_ENV === 'development') {
          console.log(`📝 턴 ${session.turnCount}: ${conversations.length}개 캐릭터 장기 기억 저장`);
        }

        // 비동기 병렬 저장 (응답 지연 방지)
        saveConversationsForMultipleCharacters(conversations, memUserId)
          .catch(err => console.error('[Mem0] 다중 저장 실패:', err));
      } catch (memSaveError) {
        console.error('[Mem0] 대화 저장 실패:', memSaveError);
      }
    }

    // 최근 사건 구성
    const newEvents: string[] = [];
    newEvents.push(`${session.userName}: ${content.substring(0, 50)}`);

    if (storyResponse.narratorNote) {
      newEvents.push(`[상황] ${storyResponse.narratorNote.substring(0, 60)}...`);
    }

    if (storyResponse.responses.length > 0) {
      const firstResponse = storyResponse.responses[0];
      newEvents.push(`${firstResponse.characterName}: ${firstResponse.content.substring(0, 40)}...`);
    }

    // 세션 업데이트
    const updatedSession = await prisma.chatSession.update({
      where: { id: sessionId },
      data: {
        turnCount: session.turnCount + 1,
        intimacy: Math.min(session.intimacy + 0.1, 10),
        currentLocation: storyResponse.updatedScene.location,
        currentTime: storyResponse.updatedScene.time,
        presentCharacters: JSON.stringify(storyResponse.updatedScene.presentCharacters),
        recentEvents: JSON.stringify([...recentEvents, ...newEvents].slice(-10)),
      },
    });

    // 현재 장면에 등장하는 캐릭터 정보 (이미지 생성용)
    const presentCharacterProfiles = characters
      .filter(c => {
        return storyResponse.updatedScene.presentCharacters.some(
          presentName =>
            presentName === c.name ||
            presentName.includes(c.name) ||
            c.name.includes(presentName) ||
            c.name.split(' ')[0] === presentName ||
            presentName.split(' ')[0] === c.name.split(' ')[0]
        );
      })
      .map(c => ({ name: c.name, profileImage: c.profileImage }));

    // 캐릭터별 대사 및 감정 정보
    const characterDialogues = storyResponse.responses.map(r => ({
      name: r.characterName,
      dialogue: r.content,
      emotion: r.emotion,
    }));

    return NextResponse.json({
      userMessage,
      narratorNote: storyResponse.narratorNote,
      presentCharacters: presentCharacterProfiles,
      characterDialogues,
      characterResponses: savedResponses,
      session: {
        ...updatedSession,
        presentCharacters: JSON.parse(updatedSession.presentCharacters),
        recentEvents: JSON.parse(updatedSession.recentEvents),
      },
      sceneUpdate: storyResponse.updatedScene,
    });
  } catch (error) {
    console.error('메시지 전송 에러:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ error: '중복된 데이터가 있습니다.' }, { status: 409 });
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ error: '데이터를 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ error: '데이터베이스 오류가 발생했습니다.' }, { status: 500 });
    }

    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: '데이터베이스 연결에 실패했습니다.' }, { status: 503 });
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const userErrorMessage = errorMessage.includes('API') || errorMessage.includes('인증')
      ? 'AI 서비스 연결에 문제가 발생했습니다.'
      : '메시지 전송에 실패했습니다.';

    return NextResponse.json(
      {
        error: userErrorMessage,
        details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
      },
      { status: 500 }
    );
  }
}

// 세션 메시지 조회
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const authSession = await auth();
    if (!authSession?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: '세션 ID가 필요합니다.' }, { status: 400 });
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
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 세션 소유자 확인
    if (session.userId && session.userId !== authSession.user.id) {
      return NextResponse.json({ error: '이 세션에 대한 접근 권한이 없습니다.' }, { status: 403 });
    }

    return NextResponse.json({
      ...session,
      presentCharacters: JSON.parse(session.presentCharacters),
      recentEvents: JSON.parse(session.recentEvents),
    });
  } catch (error) {
    console.error('Error fetching session:', error);

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ error: '세션을 불러오는데 실패했습니다.' }, { status: 500 });
  }
}
