/**
 * 토큰 단위 스트리밍 직접 테스트 (인증 불필요)
 * gemini.ts의 generateStoryResponseStream을 직접 호출하여 turn-start/turn-delta 이벤트 측정
 */

import { generateStoryResponseStream, buildSystemInstruction, buildContents } from '../src/lib/gemini';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 네온 시티 작품 로드
  const work = await prisma.work.findFirst({
    where: { title: { contains: '네온' } },
    include: {
      characters: true,
      openings: { take: 1 },
    },
  });

  if (!work) {
    console.error('❌ 작품을 찾을 수 없음');
    process.exit(1);
  }

  console.log(`📖 작품: ${work.title}`);
  console.log(`👥 캐릭터: ${work.characters.map(c => c.name).join(', ')}`);

  // systemInstruction 빌드
  const systemInstruction = buildSystemInstruction({
    worldSetting: `${work.title}\n${work.description || ''}\n${work.setting || ''}`,
    characters: work.characters.map(c => ({
      name: c.name,
      prompt: c.systemPrompt || `${c.personality || ''}\n${c.speechStyle || ''}\n${c.background || ''}`,
    })),
    lorebookStatic: '',
    userName: '정호',
  });

  // contents 빌드
  const opening = work.openings[0];
  const historyStr = opening
    ? `[나레이션] ${opening.content}`
    : '';

  const contents = buildContents({
    narrativeContexts: [],
    sceneState: {
      location: '지하 기지',
      time: '밤',
      presentCharacters: work.characters.map(c => c.name).slice(0, 2),
      recentEvents: [],
    },
    conversationHistory: historyStr,
    userMessage: '...여기가 어디야? 넌 누구야?',
    userName: '정호',
  });

  console.log(`\n━━━ 스트리밍 테스트 시작 ━━━\n`);

  const startTime = Date.now();
  let turnStartMs: number | null = null;
  let firstDeltaMs: number | null = null;
  let firstTurnMs: number | null = null;
  let turnStartCount = 0;
  let turnDeltaCount = 0;
  let turnCompleteCount = 0;
  let totalDeltaChars = 0;
  const deltaChunks: string[] = [];

  const characters = work.characters.map(c => ({ id: c.id, name: c.name }));

  for await (const event of generateStoryResponseStream({
    systemInstruction,
    contents,
    characters,
    sceneState: {
      location: '지하 기지',
      time: '밤',
      presentCharacters: work.characters.map(c => c.name).slice(0, 2),
      recentEvents: [],
    },
  })) {
    const elapsed = Date.now() - startTime;

    switch (event.type) {
      case 'turn-start':
        turnStartCount++;
        if (turnStartMs === null) {
          turnStartMs = elapsed;
        }
        console.log(`  ⚡ turn-start @ ${elapsed}ms — ${event.turnType} ${event.characterName || ''}`);
        break;

      case 'turn-delta':
        turnDeltaCount++;
        totalDeltaChars += event.content.length;
        if (firstDeltaMs === null) {
          firstDeltaMs = elapsed;
        }
        if (deltaChunks.length < 10) {
          deltaChunks.push(event.content);
        }
        // 매 10번째 delta만 로그
        if (turnDeltaCount % 10 === 0 || turnDeltaCount <= 3) {
          console.log(`  📝 delta #${turnDeltaCount} @ ${elapsed}ms — +${event.content.length}자 (누적 ${totalDeltaChars}자)`);
        }
        break;

      case 'turn':
        turnCompleteCount++;
        if (firstTurnMs === null) {
          firstTurnMs = elapsed;
        }
        console.log(`  ✅ turn @ ${elapsed}ms — ${event.turn.type} ${event.turn.characterName || ''} (${event.turn.content.length}자)`);
        break;

      case 'scene':
        console.log(`  🎬 scene @ ${elapsed}ms — ${event.scene.location}`);
        break;

      case 'metadata': {
        const totalMs = Date.now() - startTime;
        console.log(`  📊 metadata @ ${elapsed}ms — ${event.metadata.promptTokens} prompt, ${event.metadata.outputTokens} output`);

        // 결과 출력
        console.log(`\n\n═══════════════════════════════════════`);
        console.log(`📊 토큰 단위 스트리밍 결과`);
        console.log(`═══════════════════════════════════════`);
        console.log(`  turn_start 수:  ${turnStartCount}회`);
        console.log(`  turn_delta 수:  ${turnDeltaCount}회 (총 ${totalDeltaChars}자)`);
        console.log(`  turn 완성 수:   ${turnCompleteCount}회`);
        console.log(``);
        console.log(`  ⚡ turn_start:  ${turnStartMs ?? 'N/A'}ms (UI 플레이스홀더)`);
        console.log(`  ⚡ first_delta: ${firstDeltaMs ?? 'N/A'}ms (★체감 TTFT★)`);
        console.log(`  ⏱️  first_turn:  ${firstTurnMs ?? 'N/A'}ms (기존 방식 TTFT)`);
        console.log(`  ⏱️  total:       ${totalMs}ms`);

        if (firstDeltaMs !== null && firstTurnMs !== null) {
          const improvement = Math.round((1 - firstDeltaMs / firstTurnMs) * 100);
          console.log(`\n  🚀 체감 TTFT 개선: ${firstTurnMs}ms → ${firstDeltaMs}ms (${improvement}% 빠름)`);
        } else if (firstDeltaMs === null) {
          console.log(`\n  ⚠️ turn_delta 이벤트 없음 — 토큰 단위 스트리밍 미작동`);
        }

        if (deltaChunks.length > 0) {
          console.log(`\n  첫 delta 청크들:`);
          deltaChunks.forEach((c, i) => console.log(`    [${i}] "${c.substring(0, 60)}${c.length > 60 ? '...' : ''}"`));
        }
        break;
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
