import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  buildSystemInstruction,
  buildContents,
  generateStoryResponseStream,
  generateEmbedding,
  type StoryTurn,
} from '@/lib/gemini';
import { auth } from '@/lib/auth';
import { buildChatContext, processImmediateMemory, processRemainingBackgroundTasks } from '@/lib/chat-service';

// 새 채팅 세션 생성
export async function POST(request: NextRequest) {
  try {
    // auth + body 파싱을 병렬로
    const [authSession, body] = await Promise.all([
      auth(),
      request.json(),
    ]);

    if (!authSession?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const userId = authSession.user.id;
    const { workId, userName = '유저', openingId, personaId, keepMemory = true } = body;

    if (!workId) {
      return NextResponse.json({ error: '작품 ID가 필요합니다.' }, { status: 400 });
    }

    const finalUserName = authSession.user.name || userName;

    // 기억 리셋 (keepMemory=false일 때)
    if (!keepMemory) {
      await Promise.all([
        prisma.userCharacterRelationship.deleteMany({ where: { userId, workId } }),
        prisma.characterMemory.deleteMany({ where: { userId, workId } }),
      ]);
    }

    // 페르소나 + 작품 조회를 병렬로 (2개 순차 → 1개 병렬)
    const [persona, work] = await Promise.all([
      personaId
        ? prisma.persona.findUnique({ where: { id: personaId } })
        : Promise.resolve(null),
      prisma.work.findUnique({
        where: { id: workId },
        include: {
          characters: true,
          openings: openingId
            ? { where: { id: openingId } }
            : { where: { isDefault: true } },
        },
      }),
    ]);

    if (!work) {
      return NextResponse.json({ error: '작품을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (work.openings.length === 0) {
      return NextResponse.json({ error: '오프닝이 설정되지 않았습니다.' }, { status: 400 });
    }

    // 페르소나 결정
    let userPersona = {
      name: finalUserName,
      age: null as number | null,
      gender: 'private',
      description: null as string | null,
    };
    if (persona && persona.userId === userId) {
      userPersona = { name: persona.name, age: persona.age, gender: persona.gender, description: persona.description };
    }

    const opening = work.openings[0];
    const allCharacterNames = work.characters.map(c => c.name);

    // 첫 캐릭터 1명으로 시작 (나머지는 AI가 스토리 흐름에 따라 유기적으로 등장시킴)
    const initialCharacters = allCharacterNames.slice(0, 1);

    // 세션 + 오프닝 메시지를 트랜잭션으로 (2번 DB 호출 → 1번)
    const [session] = await prisma.$transaction([
      prisma.chatSession.create({
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
          userPersona: JSON.stringify(userPersona),
        },
      }),
    ]);

    // 오프닝 메시지는 세션 ID가 필요하므로 별도 (하지만 응답 대기 안 함)
    prisma.message.create({
      data: { sessionId: session.id, characterId: null, content: opening.content, messageType: 'system' },
    }).catch(e => console.error('Opening message save error:', e));

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
    return NextResponse.json({ error: '채팅 세션 생성에 실패했습니다.' }, { status: 500 });
  }
}

// 메시지 전송 (SSE 스트리밍 응답)
export async function PUT(request: NextRequest) {
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

  // 세션 + 즉시 컨텍스트 (최근 30개) + 검색용 과거 메시지 (100개)
  const [session, olderMessages] = await Promise.all([
    prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        work: { include: { characters: true, lorebook: true } },
        messages: {
          include: { character: true },
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
      },
    }),
    // 검색용: 임베딩 있는 과거 유저 메시지 (최근 100개, 선별적 검색용)
    prisma.message.findMany({
      where: { sessionId, messageType: 'user', NOT: { embedding: '[]' } },
      include: { character: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

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

  // 메시지를 시간순으로 정렬 (desc로 가져왔으므로 reverse)
  const recentMessages = session.messages.reverse();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // [1] 유저 메시지 저장 + 임베딩 생성 (병렬)
        const [userMessage, queryEmbedding] = await Promise.all([
          prisma.message.create({
            data: { sessionId, characterId: null, content, messageType: 'user' },
          }),
          generateEmbedding(content).catch(() => [] as number[]),
        ]);
        send('user_message', userMessage);

        // 유저 메시지 임베딩 저장 (fire-and-forget, 다음 턴에서 검색 가능)
        if (queryEmbedding.length > 0) {
          prisma.message.update({
            where: { id: userMessage.id },
            data: { embedding: JSON.stringify(queryEmbedding) },
          }).catch(() => {});
        }

        const presentCharacters = JSON.parse(session.presentCharacters) as string[];
        const recentEvents = JSON.parse(session.recentEvents) as string[];

        // [2] 컨텍스트 수집 (chat-service)
        send('status', { step: 'generating' });
        const t0 = Date.now();

        const {
          conversationHistory,
          lorebookContext,
          memoryPrompts,
          presentChars,
          relevantHistory,
          preScene,
          effectiveUserName,
          userPersona,
          previousPresentCharacters,
          characterMemoryDebug,
        } = await buildChatContext({
          sessionId,
          content,
          session,
          olderMessages,
          recentMessages,
          presentCharacters,
          characters,
          queryEmbedding,
          authUserId: authSession.user!.id!,
          workId: session.workId,
        });

        const t1 = Date.now();
        console.log(`[PERF] narrative-memory: ${t1 - t0}ms (${memoryPrompts.length} contexts)`);

        // [3] systemInstruction + contents 빌드
        const systemInstruction = buildSystemInstruction({
          worldSetting: session.work.worldSetting || '',
          characters: characters.map(c => ({ name: c.name, prompt: c.prompt })),
          lorebookStatic: lorebookContext,
          userName: effectiveUserName,
        });

        const contents = buildContents({
          userPersona,
          narrativeContexts: memoryPrompts,
          sessionSummary: session.sessionSummary || undefined,
          proAnalysis: session.proAnalysis || undefined,
          sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters, recentEvents },
          conversationHistory,
          userMessage: content,
          userName: effectiveUserName,
          previousPresentCharacters,
        });

        // [6] AI 스트리밍 응답 생성
        const t2 = Date.now();
        console.log(`[PERF] prompt build: ${t2 - t1}ms (sysInstruction: ${systemInstruction.length} chars, contents: ${contents.length} parts)`);

        const allTurns: StoryTurn[] = [];
        let updatedScene = { location: session.currentLocation, time: session.currentTime, presentCharacters };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let responseMetadataFromAI: any = null;
        let lastAiMessageId = '';
        let extractedFacts: string[] = [];

        for await (const event of generateStoryResponseStream({
          systemInstruction,
          contents,
          characters: characters.map(c => ({ id: c.id, name: c.name })),
          sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters, recentEvents },
        })) {
          switch (event.type) {
            case 'turn': {
              allTurns.push(event.turn);
              // 턴이 완성되는 즉시 DB 저장 + SSE 전송
              if (event.turn.type === 'narrator') {
                const narratorMsg = await prisma.message.create({
                  data: { sessionId, characterId: null, content: event.turn.content, messageType: 'narrator' },
                });
                lastAiMessageId = narratorMsg.id;
                send('narrator', { id: narratorMsg.id, content: event.turn.content });
              } else {
                const savedMsg = await prisma.message.create({
                  data: { sessionId, characterId: event.turn.characterId, content: event.turn.content, messageType: 'dialogue' },
                  include: { character: true },
                });
                lastAiMessageId = savedMsg.id;
                send('character_response', savedMsg);
              }
              break;
            }
            case 'scene':
              updatedScene = event.scene;
              break;
            case 'extractedFacts':
              extractedFacts = event.facts;
              break;
            case 'metadata':
              responseMetadataFromAI = event.metadata;
              break;
          }
        }

        const t3 = Date.now();
        console.log(`[PERF] ★ Gemini 스트리밍: ${t3 - t2}ms | turns: ${allTurns.length}`);
        console.log(`[PERF] total so far: ${t3 - t0}ms`);

        // [5] 세션 업데이트
        const newEvents: string[] = [];
        newEvents.push(`${effectiveUserName}: ${content.substring(0, 50)}`);
        const firstNarrator = allTurns.find(t => t.type === 'narrator');
        const firstDialogue = allTurns.find(t => t.type === 'dialogue');
        if (firstNarrator) {
          newEvents.push(`[상황] ${firstNarrator.content.substring(0, 60)}...`);
        }
        if (firstDialogue) {
          newEvents.push(`${firstDialogue.characterName}: ${firstDialogue.content.substring(0, 40)}...`);
        }

        // dialogue 턴에 등장한 캐릭터를 presentCharacters에 자동 추가
        const dialogueCharNames = allTurns
          .filter(t => t.type === 'dialogue' && t.characterName)
          .map(t => t.characterName);
        const mergedPresent = Array.from(new Set([...updatedScene.presentCharacters, ...dialogueCharNames]));

        const updatedSession = await prisma.chatSession.update({
          where: { id: sessionId },
          data: {
            turnCount: session.turnCount + 1,
            intimacy: Math.min(session.intimacy + 0.1, 10),
            currentLocation: updatedScene.location,
            currentTime: updatedScene.time,
            presentCharacters: JSON.stringify(mergedPresent),
            recentEvents: JSON.stringify([...recentEvents, ...newEvents].slice(-10)),
          },
        });

        // 이미지 생성용 데이터
        const presentCharacterProfiles = characters
          .filter(c => updatedScene.presentCharacters.some(
            pn => pn === c.name || pn.includes(c.name) || c.name.includes(pn) ||
              c.name.split(' ')[0] === pn || pn.split(' ')[0] === c.name.split(' ')[0]
          ))
          .map(c => ({ name: c.name, profileImage: c.profileImage }));

        const characterDialogues = allTurns
          .filter(t => t.type === 'dialogue')
          .map(t => ({
            name: t.characterName, dialogue: t.content, emotion: t.emotion,
          }));

        // [8] 세션 상태 전송
        send('session_update', {
          session: {
            ...updatedSession,
            presentCharacters: JSON.parse(updatedSession.presentCharacters),
            recentEvents: JSON.parse(updatedSession.recentEvents),
          },
          presentCharacters: presentCharacterProfiles,
          characterDialogues,
          sceneUpdate: updatedScene,
        });

        // 메타데이터 빌드 (SSE 전송 + DB 저장 공용)
        const dialogueTurnsForMeta = allTurns.filter(t => t.type === 'dialogue');
        const fullMetadata = responseMetadataFromAI ? {
          ...responseMetadataFromAI,
          narrativeMemoryMs: t1 - t0,
          promptBuildMs: t2 - t1,
          totalMs: t3 - t0,
          turnsCount: allTurns.length,
          systemInstructionLength: systemInstruction.length,
          proAnalysis: session.proAnalysis || '',
          emotions: dialogueTurnsForMeta.map(t =>
            `${t.characterName}: ${t.emotion.primary}(${(t.emotion.intensity * 100).toFixed(0)}%)`
          ),
          lorebookActivated: lorebookContext ? lorebookContext.split('\n\n').length : 0,
          selectiveHistory: relevantHistory.length > 0,
          relevantHistoryCount: relevantHistory.length,
          turnNumber: session.turnCount + 1,
          extractedFactsCount: extractedFacts.length,
          memoryDebug: characterMemoryDebug,
        } : null;

        if (fullMetadata) {
          send('response_metadata', fullMetadata);
        }

        // DB 저장 (새로고침 시에도 유지, fire-and-forget)
        if (lastAiMessageId && fullMetadata) {
          prisma.message.update({
            where: { id: lastAiMessageId },
            data: { metadata: JSON.stringify(fullMetadata) },
          }).catch(e => console.error('[Metadata] save failed:', e));
        }

        // ========== 메모리 처리 (동기 — surprise 결과를 SSE로 전송) ==========
        const memoryResults = await processImmediateMemory({
          sessionId,
          preSceneId: preScene?.sceneId,
          content,
          allTurns,
          session: {
            workId: session.workId,
            proAnalysis: session.proAnalysis,
          },
          authUserId: authSession.user!.id!,
          workId: session.workId,
          extractedFacts: extractedFacts.length > 0 ? extractedFacts : undefined,
        }).catch(e => {
          console.error('[ImmediateMemory] process failed:', e);
          return [];
        });

        if (memoryResults.length > 0) {
          send('memory_update', { results: memoryResults });
        }

        // AI 응답 요약 (클라이언트가 Pro 분석 요청 시 전달용)
        const aiResponseSummary = allTurns.map(t =>
          t.type === 'narrator' ? `[나레이션] ${t.content.substring(0, 100)}`
            : `[${t.characterName}] ${t.content.substring(0, 100)}`
        ).join('\n');

        send('done', { aiResponseSummary });
        controller.close();

        // ========== 스트림 종료 후 fire-and-forget 비동기 처리 ==========

        processRemainingBackgroundTasks({
          sessionId,
          session: {
            workId: session.workId,
            turnCount: session.turnCount,
            sessionSummary: session.sessionSummary,
          },
          authUserId: authSession.user!.id!,
          workId: session.workId,
          recentMessages,
        }).catch(e => console.error('[BackgroundTasks] process failed:', e));

      } catch (error) {
        console.error('메시지 전송 에러:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        const userErrorMessage = errorMessage.includes('EMPTY_RESPONSE')
          ? 'AI 응답 생성에 실패했습니다. 다시 시도해주세요.'
          : errorMessage.includes('API') || errorMessage.includes('인증')
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
        work: { include: { characters: true } },
        messages: {
          include: { character: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다.' }, { status: 404 });
    }

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
