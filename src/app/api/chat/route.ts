import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { generateStoryResponse, generateSessionSummary } from '@/lib/gemini';
import {
  formatMemoriesForPrompt,
  searchMemoriesForMultipleCharacters,
  saveConversationsForMultipleCharacters,
  pruneMemories,
} from '@/lib/memory';
import {
  formatConversationHistory,
  filterActiveLorebookEntries,
  extractRecentText,
  extractKeywords,
} from '@/lib/prompt-builder';
import narrativeMemory, { decayMemoryStrength, pruneWeakMemories, cleanExpiredImageCache } from '@/lib/narrative-memory';
import { auth } from '@/lib/auth';

// 타임아웃 헬퍼 (Promise가 지정 시간 내 완료되지 않으면 fallback 반환)
const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 5000): Promise<T> =>
  Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

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
        // 다중 캐릭터 병렬 검색 함수 사용 (타임아웃 3초)
        const characterIds = initialChars.map(c => c.id);
        const memoriesMap = await withTimeout(
          searchMemoriesForMultipleCharacters(
            "유저에 대한 정보와 선호도",
            memUserId,
            characterIds,
            10
          ),
          new Map<string, string[]>(),
          3000
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

    // === 서사 기억 시스템 초기화 (타임아웃 5초) ===
    const initialCharacterIds = work.characters
      .filter(c => initialCharacters.includes(c.name))
      .map(c => c.id);

    try {
      await withTimeout(
        (async () => {
          const sceneId = await narrativeMemory.startScene({
            sessionId: session.id,
            location: opening.initialLocation || '알 수 없는 장소',
            time: opening.initialTime || '알 수 없는 시간',
            participants: initialCharacterIds,
          });

          // 초기 등장 캐릭터들과의 관계 초기화
          await Promise.all(
            work.characters
              .filter(c => initialCharacters.includes(c.name))
              .map(char => narrativeMemory.getOrCreateRelationship(session.id, char.id, char.name))
          );

          // 오프닝 내용을 원본 대화 로그에 저장
          await narrativeMemory.saveConversationLog({
            sessionId: session.id,
            speakerType: 'narrator',
            speakerName: '시스템',
            content: opening.content,
            sceneId,
          });

          console.log(`[NarrativeMemory] 세션 ${session.id} 초기화 완료`);
        })(),
        undefined,
        5000
      );
    } catch (error) {
      console.error(`[NarrativeMemory] 세션 ${session.id} 초기화 스킵:`, error);
    }

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

// 메시지 전송 (SSE 스트리밍 응답)
export async function PUT(request: NextRequest) {
  // 인증 확인 (스트림 시작 전 검증)
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  let body: { sessionId?: string; content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 });
  }

  const { sessionId, content } = body;

  if (!sessionId || !content) {
    return NextResponse.json({ error: '세션 ID와 메시지 내용이 필요합니다.' }, { status: 400 });
  }

  if (typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json({ error: '메시지 내용이 비어있습니다.' }, { status: 400 });
  }
  if (content.length > 5000) {
    return NextResponse.json({ error: '메시지는 5000자 이하여야 합니다.' }, { status: 400 });
  }

  // 세션 정보 조회 (스트림 시작 전)
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      work: { include: { characters: true, lorebook: true } },
      messages: { include: { character: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  if (!session) {
    return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (session.userId && session.userId !== authSession.user.id) {
    return NextResponse.json({ error: '이 세션에 대한 접근 권한이 없습니다.' }, { status: 403 });
  }

  const characters = session.work.characters;
  if (characters.length === 0) {
    return NextResponse.json({ error: '등록된 캐릭터가 없습니다.' }, { status: 400 });
  }

  // SSE 스트림 시작
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // [1] 유저 메시지 저장 → 즉시 전송
        const userMessage = await prisma.message.create({
          data: { sessionId, characterId: null, content, messageType: 'user' },
        });
        send('user_message', userMessage);

        // [2] 컨텍스트 수집
        const presentCharacters = JSON.parse(session.presentCharacters) as string[];
        const recentEvents = JSON.parse(session.recentEvents) as string[];

        const appearedCharactersInHistory = new Set<string>();
        session.messages.forEach(msg => {
          if (msg.character?.name) appearedCharactersInHistory.add(msg.character.name);
        });
        const previousPresentCharacters = Array.from(appearedCharactersInHistory);

        const conversationHistory = formatConversationHistory(session.messages, session.userName);
        const recentText = extractRecentText(session.messages, content);
        const lorebookContext = filterActiveLorebookEntries(
          session.work.lorebook, recentText, session.intimacy, session.turnCount, presentCharacters
        );
        const worldSetting = session.work.worldSetting || '';

        // 서사 기억
        let activeScene = await narrativeMemory.getActiveScene(sessionId);
        if (!activeScene) {
          const participantIds = characters.filter(c => presentCharacters.includes(c.name)).map(c => c.id);
          await narrativeMemory.startScene({ sessionId, location: session.currentLocation, time: session.currentTime, participants: participantIds });
          activeScene = await narrativeMemory.getActiveScene(sessionId);
        }

        await narrativeMemory.saveConversationLog({
          sessionId, speakerType: 'user', speakerName: session.userName, content, sceneId: activeScene?.sceneId,
        });

        // 활성 캐릭터 필터
        const presentCharacterSet = new Set(presentCharacters);
        const activeCharacters = characters.filter(c =>
          presentCharacterSet.has(c.name) ||
          presentCharacters.some(pc => c.name.includes(pc) || pc.includes(c.name.split(' ')[0]))
        );

        // 장기 기억 캐시
        const memUserId = `user_${session.userId}`;
        let memoryCache: Record<string, any> = {};
        try { memoryCache = JSON.parse(session.characterMemories || '{}'); } catch { memoryCache = { lastUpdated: Date.now() }; }
        const cacheLastUpdated = memoryCache.lastUpdated || 0;
        const shouldRefreshCache = session.turnCount > 0 &&
          (session.turnCount % 10 === 0 || Date.now() - cacheLastUpdated > 5 * 60 * 1000);

        const withTimeout = <T>(promise: Promise<T>, fallback: T, ms = 500): Promise<T> =>
          Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

        if (shouldRefreshCache && activeCharacters.length > 0) {
          try {
            const characterIds = activeCharacters.map(c => c.id);
            const memoriesMap = await withTimeout(
              searchMemoriesForMultipleCharacters(content, memUserId, characterIds, 5),
              new Map<string, string[]>(), 3000
            );
            memoriesMap.forEach((memories, charId) => { memoryCache[charId] = memories; });
            memoryCache.lastUpdated = Date.now();
            prisma.chatSession.update({ where: { id: sessionId }, data: { characterMemories: JSON.stringify(memoryCache) } }).catch(() => {});
          } catch { /* 기존 캐시 사용 */ }
        }

        // 서사 컨텍스트
        const narrativeResults = await Promise.all(
          activeCharacters.map(async (char) =>
            withTimeout(
              narrativeMemory.buildNarrativeContext(sessionId, char.id, char.name)
                .then(ctx => ({ charId: char.id, prompt: ctx.narrativePrompt || '' }))
                .catch(() => ({ charId: char.id, prompt: '' })),
              { charId: char.id, prompt: '' }, 1000
            )
          )
        );
        const narrativeContexts = new Map(narrativeResults.map(r => [r.charId, r.prompt]));

        const charactersWithMemory = activeCharacters.map((c) => {
          const narrativeContext = narrativeContexts.get(c.id) || '';
          const cachedMemories = memoryCache[c.id] || [];
          const mem0Context = formatMemoriesForPrompt(cachedMemories, c.name);
          let fullContext = '';
          if (narrativeContext) fullContext += '\n\n' + narrativeContext;
          if (mem0Context) fullContext += '\n\n' + mem0Context;
          return { id: c.id, name: c.name, prompt: c.prompt + fullContext };
        });

        // 유저 페르소나
        let userPersona: { name: string; age: number | null; gender: string; description: string | null } | undefined;
        try {
          const parsedPersona = JSON.parse(session.userPersona || '{}');
          if (parsedPersona.name) userPersona = parsedPersona;
        } catch { /* 무시 */ }

        // [3] AI 응답 생성
        send('status', { step: 'generating' });

        const storyResponse = await generateStoryResponse(
          charactersWithMemory, conversationHistory, content, session.userName,
          { location: session.currentLocation, time: session.currentTime, presentCharacters, recentEvents },
          lorebookContext, worldSetting, previousPresentCharacters, userPersona
        );

        // [4] 나레이션 → 즉시 전송
        if (storyResponse.narratorNote) {
          const narratorMsg = await prisma.message.create({
            data: { sessionId, characterId: null, content: storyResponse.narratorNote, messageType: 'narrator' },
          });
          send('narrator', { id: narratorMsg.id, content: storyResponse.narratorNote });
        }

        // [5] 캐릭터 응답 → 하나씩 전송
        const savedResponses = [];
        for (const response of storyResponse.responses) {
          const message = await prisma.message.create({
            data: { sessionId, characterId: response.characterId, content: response.content, messageType: 'dialogue' },
            include: { character: true },
          });
          savedResponses.push(message);
          send('character_response', message);
        }

        // [6] 서사 기억 저장 (비차단)
        try {
          if (storyResponse.narratorNote) {
            await narrativeMemory.saveConversationLog({
              sessionId, speakerType: 'narrator', speakerName: '나레이터',
              content: storyResponse.narratorNote, sceneId: activeScene?.sceneId,
            });
          }
          for (const response of storyResponse.responses) {
            await narrativeMemory.saveConversationLog({
              sessionId, speakerType: 'character', speakerId: response.characterId,
              speakerName: response.characterName, content: response.content,
              sceneId: activeScene?.sceneId, emotionTag: response.emotion,
            });
            await narrativeMemory.updateRelationship(sessionId, response.characterId, activeScene?.sceneId, { intimacyDelta: 0.5 });
          }
          if (activeScene) {
            const keywords = extractKeywords(content);
            if (keywords.length > 0) await narrativeMemory.updateScene(activeScene.sceneId, { topics: keywords });
          }
        } catch (narrativeError) {
          console.error('[NarrativeMemory] 저장 실패:', narrativeError);
        }

        // [7] 기억 강도 감소 (매 5턴마다)
        if (session.turnCount > 0 && session.turnCount % 5 === 0) {
          decayMemoryStrength(sessionId).catch(() => {});
        }

        // [7-1] 약한 기억 정리 (25턴마다)
        if (session.turnCount > 0 && session.turnCount % 25 === 0) {
          pruneWeakMemories(sessionId).catch(() => {});
          cleanExpiredImageCache().catch(() => {});
        }

        // [8] Mem0 장기 기억 저장 (10턴마다)
        if (session.turnCount > 0 && session.turnCount % 10 === 0 && storyResponse.responses.length > 0) {
          const conversations = storyResponse.responses.map(r => ({
            characterId: r.characterId,
            messages: [
              { role: 'user', content: `${session.userName}: ${content}` },
              { role: 'assistant', content: `${r.characterName}: ${r.content}` },
            ],
          }));
          saveConversationsForMultipleCharacters(conversations, memUserId).catch(() => {});

          // [8-1] Mem0 Pruning (50턴마다, 캐릭터당 최대 50개 유지)
          if (session.turnCount % 50 === 0) {
            const characterIds = storyResponse.responses.map(r => r.characterId);
            for (const charId of characterIds) {
              pruneMemories(memUserId, charId, 50).catch(() => {});
            }
          }
        }

        // [9] 세션 업데이트
        const newEvents: string[] = [];
        newEvents.push(`${session.userName}: ${content.substring(0, 50)}`);
        if (storyResponse.narratorNote) newEvents.push(`[상황] ${storyResponse.narratorNote.substring(0, 60)}...`);
        if (storyResponse.responses.length > 0) {
          newEvents.push(`${storyResponse.responses[0].characterName}: ${storyResponse.responses[0].content.substring(0, 40)}...`);
        }

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

        // [10] 세션 요약 자동 생성 (20턴마다)
        if (session.turnCount > 0 && (session.turnCount + 1) % 20 === 0) {
          const recentMsgs = session.messages.slice(-40).map(m => ({
            role: m.messageType,
            content: m.content,
            characterName: m.character?.name,
          }));
          generateSessionSummary(recentMsgs, session.sessionSummary || undefined)
            .then(summary => {
              if (summary) {
                prisma.chatSession.update({ where: { id: sessionId }, data: { sessionSummary: summary } }).catch(() => {});
              }
            })
            .catch(() => {});
        }

        // 이미지 생성용 데이터
        const presentCharacterProfiles = characters
          .filter(c => storyResponse.updatedScene.presentCharacters.some(
            pn => pn === c.name || pn.includes(c.name) || c.name.includes(pn) ||
              c.name.split(' ')[0] === pn || pn.split(' ')[0] === c.name.split(' ')[0]
          ))
          .map(c => ({ name: c.name, profileImage: c.profileImage }));

        const characterDialogues = storyResponse.responses.map(r => ({
          name: r.characterName, dialogue: r.content, emotion: r.emotion,
        }));

        // [11] 세션 상태 전송
        send('session_update', {
          session: {
            ...updatedSession,
            presentCharacters: JSON.parse(updatedSession.presentCharacters),
            recentEvents: JSON.parse(updatedSession.recentEvents),
          },
          presentCharacters: presentCharacterProfiles,
          characterDialogues,
          sceneUpdate: storyResponse.updatedScene,
        });

        send('done', {});
        controller.close();
      } catch (error) {
        console.error('메시지 전송 에러:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const userErrorMessage = errorMessage.includes('API') || errorMessage.includes('인증')
          ? 'AI 서비스 연결에 문제가 발생했습니다.'
          : '메시지 전송에 실패했습니다.';
        send('error', { error: userErrorMessage });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
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
