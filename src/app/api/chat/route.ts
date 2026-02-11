import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import {
  buildSystemInstruction,
  buildContents,
  generateStoryResponse,
  generateSessionSummary,
} from '@/lib/gemini';
import {
  formatConversationHistory,
  filterActiveLorebookEntries,
  extractRecentText,
} from '@/lib/prompt-builder';
import {
  buildNarrativeContext,
  processConversationForMemory,
  decayMemoryStrength,
  pruneWeakMemories,
  getActiveScene,
} from '@/lib/narrative-memory';
import { auth } from '@/lib/auth';

// 요약 Race Condition 방지
const summarizingSessionIds = new Set<string>();

async function triggerSummary(
  sessionId: string,
  messages: Array<{ messageType: string; content: string; character?: { name: string } | null }>,
  existingSummary?: string
) {
  if (summarizingSessionIds.has(sessionId)) return;
  summarizingSessionIds.add(sessionId);

  try {
    const summaryMessages = messages.map(m => ({
      role: m.messageType,
      content: m.content,
      characterName: m.character?.name,
    }));
    const summary = await generateSessionSummary(summaryMessages, existingSummary);
    if (summary) {
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { sessionSummary: summary },
      });
    }
  } finally {
    summarizingSessionIds.delete(sessionId);
  }
}

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
    const { workId, userName = '유저', openingId, personaId } = body;

    if (!workId) {
      return NextResponse.json({ error: '작품 ID가 필요합니다.' }, { status: 400 });
    }

    const finalUserName = authSession.user.name || userName;

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

  // 세션 + 최근 30개 메시지만 로드 (성능 최적화)
  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: {
      work: { include: { characters: true, lorebook: true } },
      messages: {
        include: { character: true },
        orderBy: { createdAt: 'desc' },
        take: 30,
      },
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

  // 메시지를 시간순으로 정렬 (desc로 가져왔으므로 reverse)
  const recentMessages = session.messages.reverse();

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
        recentMessages.forEach(msg => {
          if (msg.character?.name) appearedCharactersInHistory.add(msg.character.name);
        });
        const previousPresentCharacters = Array.from(appearedCharactersInHistory);

        const conversationHistory = formatConversationHistory(recentMessages, session.userName);
        const recentText = extractRecentText(recentMessages, content);
        const lorebookContext = filterActiveLorebookEntries(
          session.work.lorebook, recentText, session.intimacy, session.turnCount, presentCharacters
        );

        // 유저 페르소나
        let userPersona: { name: string; age: number | null; gender: string; description: string | null } | undefined;
        try {
          const parsed = JSON.parse(session.userPersona || '{}');
          if (parsed.name) userPersona = parsed;
        } catch { /* ignore */ }

        // [3] narrative-memory: 캐릭터별 기억 수집 + 장면 정보 (병렬)
        send('status', { step: 'generating' });
        const t0 = Date.now();

        // presentCharacters에 해당하는 캐릭터만 기억 조회 (집중 + 성능)
        const presentChars = characters.filter(c =>
          presentCharacters.includes(c.name) ||
          presentCharacters.some(pc => c.name.includes(pc) || pc.includes(c.name.split(' ')[0]))
        );

        const [narrativeContexts, activeScene] = await Promise.all([
          Promise.all(
            presentChars.map(c =>
              buildNarrativeContext(sessionId, c.id, c.name)
                .catch(() => ({ narrativePrompt: '', relationship: null, recentMemories: [], sceneContext: null }))
            )
          ),
          getActiveScene(sessionId).catch(() => null),
        ]);
        const memoryPrompts = narrativeContexts
          .map(ctx => ctx.narrativePrompt)
          .filter(p => p.length > 0);
        const t1 = Date.now();
        console.log(`[PERF] narrative-memory: ${t1 - t0}ms (${memoryPrompts.length} contexts)`);

        // [4] systemInstruction 빌드 (작품별 고정 → 캐시됨)
        const systemInstruction = buildSystemInstruction({
          worldSetting: session.work.worldSetting || '',
          characters: characters.map(c => ({ name: c.name, prompt: c.prompt })),
          lorebookStatic: lorebookContext,
          userName: session.userName,
        });

        // [5] contents 빌드 (매 턴 변경)
        const contents = buildContents({
          userPersona,
          narrativeContexts: memoryPrompts,
          sessionSummary: session.sessionSummary || undefined,
          sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters, recentEvents },
          conversationHistory,
          userMessage: content,
          userName: session.userName,
          previousPresentCharacters,
        });

        // [6] AI 응답 생성 (systemInstruction + contents 2계층)
        const t2 = Date.now();
        console.log(`[PERF] prompt build: ${t2 - t1}ms (sysInstruction: ${systemInstruction.length} chars, contents: ${contents.length} parts)`);
        const storyResponse = await generateStoryResponse({
          systemInstruction,
          contents,
          characters: characters.map(c => ({ id: c.id, name: c.name })),
          sceneState: { location: session.currentLocation, time: session.currentTime, presentCharacters, recentEvents },
        });

        const t3 = Date.now();
        console.log(`[PERF] ★ Gemini API: ${t3 - t2}ms | turns: ${storyResponse.turns.length}`);
        console.log(`[PERF] total so far: ${t3 - t0}ms`);

        // [4] turns를 순서대로 저장 + 전송
        for (const turn of storyResponse.turns) {
          if (turn.type === 'narrator') {
            const narratorMsg = await prisma.message.create({
              data: { sessionId, characterId: null, content: turn.content, messageType: 'narrator' },
            });
            send('narrator', { id: narratorMsg.id, content: turn.content });
          } else {
            // dialogue
            const savedMsg = await prisma.message.create({
              data: { sessionId, characterId: turn.characterId, content: turn.content, messageType: 'dialogue' },
              include: { character: true },
            });
            send('character_response', savedMsg);
          }
        }

        // [5] 세션 업데이트
        const newEvents: string[] = [];
        newEvents.push(`${session.userName}: ${content.substring(0, 50)}`);
        const firstNarrator = storyResponse.turns.find(t => t.type === 'narrator');
        const firstDialogue = storyResponse.turns.find(t => t.type === 'dialogue');
        if (firstNarrator) {
          newEvents.push(`[상황] ${firstNarrator.content.substring(0, 60)}...`);
        }
        if (firstDialogue) {
          newEvents.push(`${firstDialogue.characterName}: ${firstDialogue.content.substring(0, 40)}...`);
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

        // 이미지 생성용 데이터
        const presentCharacterProfiles = characters
          .filter(c => storyResponse.updatedScene.presentCharacters.some(
            pn => pn === c.name || pn.includes(c.name) || c.name.includes(pn) ||
              c.name.split(' ')[0] === pn || pn.split(' ')[0] === c.name.split(' ')[0]
          ))
          .map(c => ({ name: c.name, profileImage: c.profileImage }));

        const characterDialogues = storyResponse.turns
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
          sceneUpdate: storyResponse.updatedScene,
        });

        send('done', {});
        controller.close();

        // ========== 스트림 종료 후 fire-and-forget 비동기 처리 ==========

        // [A] 캐릭터 기억 업데이트 (매 턴)
        const dialogueTurns = storyResponse.turns.filter(t => t.type === 'dialogue');
        processConversationForMemory({
          sessionId,
          sceneId: activeScene?.sceneId,
          userMessage: content,
          characterResponses: dialogueTurns.map(t => ({
            characterId: t.characterId,
            characterName: t.characterName,
            content: t.content,
            emotion: t.emotion ? { primary: t.emotion.primary, intensity: t.emotion.intensity } : undefined,
          })),
          emotionalMoment: dialogueTurns.some(t =>
            ['sad', 'angry', 'surprised', 'happy'].includes(t.emotion.primary) && t.emotion.intensity > 0.7
          ),
        }).catch(e => console.error('[NarrativeMemory] processConversation failed:', e));

        // [B] 5턴마다: 세션 요약 + 기억 감쇠 (비동기)
        const newTurnCount = session.turnCount + 1;
        if (newTurnCount % 5 === 0) {
          triggerSummary(sessionId, recentMessages, session.sessionSummary || undefined)
            .catch(() => {});
          decayMemoryStrength(sessionId)
            .catch(() => {});
        }

        // [C] 25턴마다: 약한 기억 정리 (비동기)
        if (newTurnCount % 25 === 0) {
          pruneWeakMemories(sessionId)
            .catch(() => {});
        }
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
