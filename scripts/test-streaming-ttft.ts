/**
 * 토큰 단위 스트리밍 TTFT 측정 테스트
 *
 * 사용법:
 *   npx tsx scripts/test-streaming-ttft.ts --base-url=https://your-app.vercel.app --cookie="__Secure-authjs.session-token=..."
 */

interface Config {
  baseUrl: string;
  cookie: string;
  workId: string | null;
  turns: number;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    baseUrl: 'http://localhost:3000',
    cookie: '',
    workId: null,
    turns: 3,
  };

  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    switch (key) {
      case '--base-url': config.baseUrl = value; break;
      case '--cookie': config.cookie = value; break;
      case '--work-id': config.workId = value; break;
      case '--turns': config.turns = parseInt(value, 10); break;
    }
  }

  if (!config.cookie) {
    console.error('❌ --cookie 필수');
    process.exit(1);
  }
  return config;
}

async function fetchWithAuth(config: Config, path: string, options: RequestInit = {}) {
  const url = `${config.baseUrl}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: config.cookie,
      ...(options.headers as Record<string, string> || {}),
    },
  });
}

interface StreamingMetrics {
  turnStartMs: number | null;    // 첫 turn_start 이벤트까지
  firstDeltaMs: number | null;   // 첫 turn_delta 이벤트까지 (실제 텍스트 시작)
  firstTurnMs: number | null;    // 첫 완성된 turn까지
  totalMs: number;               // 전체 응답 완료
  turnStartCount: number;
  turnDeltaCount: number;
  turnCompleteCount: number;
  narratorContent: string;
  dialogueContent: string;
  deltaChunks: string[];         // delta 청크 기록 (처음 5개)
}

async function measureStreamingResponse(
  config: Config,
  sessionId: string,
  message: string,
): Promise<StreamingMetrics> {
  const startTime = Date.now();
  const metrics: StreamingMetrics = {
    turnStartMs: null,
    firstDeltaMs: null,
    firstTurnMs: null,
    totalMs: 0,
    turnStartCount: 0,
    turnDeltaCount: 0,
    turnCompleteCount: 0,
    narratorContent: '',
    dialogueContent: '',
    deltaChunks: [],
  };

  const res = await fetchWithAuth(config, '/api/chat', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, content: message }),
  });

  if (!res.ok) {
    throw new Error(`메시지 전송 실패: ${res.status} ${await res.text()}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part.split('\n');
      let eventType = '';
      let data = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) eventType = line.substring(7).trim();
        else if (line.startsWith('data: ')) data = line.substring(6);
      }

      if (!eventType || !data) continue;

      try {
        const parsed = JSON.parse(data);
        const elapsed = Date.now() - startTime;

        switch (eventType) {
          case 'turn_start':
            metrics.turnStartCount++;
            if (metrics.turnStartMs === null) {
              metrics.turnStartMs = elapsed;
              console.log(`  ⚡ turn_start @ ${elapsed}ms — ${parsed.turnType} ${parsed.characterName || ''}`);
            }
            break;

          case 'turn_delta':
            metrics.turnDeltaCount++;
            if (metrics.firstDeltaMs === null) {
              metrics.firstDeltaMs = elapsed;
              console.log(`  ⚡ first delta @ ${elapsed}ms — "${parsed.content?.substring(0, 30)}..."`);
            }
            if (metrics.deltaChunks.length < 5) {
              metrics.deltaChunks.push(parsed.content || '');
            }
            break;

          case 'narrator':
            metrics.turnCompleteCount++;
            if (metrics.firstTurnMs === null) metrics.firstTurnMs = elapsed;
            metrics.narratorContent = parsed.content || '';
            console.log(`  ✅ narrator complete @ ${elapsed}ms (${metrics.narratorContent.length}자)`);
            break;

          case 'character_response':
            metrics.turnCompleteCount++;
            if (metrics.firstTurnMs === null) metrics.firstTurnMs = elapsed;
            metrics.dialogueContent = parsed.content || '';
            console.log(`  ✅ dialogue complete @ ${elapsed}ms — ${parsed.character?.name || '?'} (${metrics.dialogueContent.length}자)`);
            break;

          case 'done':
            metrics.totalMs = elapsed;
            break;
        }
      } catch { /* skip */ }
    }
  }

  if (metrics.totalMs === 0) metrics.totalMs = Date.now() - startTime;
  return metrics;
}

// ============================================================
// 메인
// ============================================================

const testMessages = [
  '...여기가 어디야? 넌 누구야?',
  '*ZERO의 팔을 잡고* 잠깐, 위에서 소리가 들린다.',
  '난 사실 기억이 조금 남아있어. 네온 불빛... 그리고 누군가의 얼굴.',
];

async function main() {
  const config = parseArgs();

  // 작품 목록
  const worksRes = await fetchWithAuth(config, '/api/works?public=true');
  const worksData: any = await worksRes.json();
  const works = Array.isArray(worksData) ? worksData : worksData.works || [];

  const targetWork = config.workId
    ? works.find((w: any) => w.id === config.workId)
    : works.find((w: any) => w.title?.includes('네온'));

  if (!targetWork) {
    console.error('❌ 작품을 찾을 수 없음');
    process.exit(1);
  }
  console.log(`📖 작품: ${targetWork.title} (${targetWork.id})`);

  // 세션 생성
  const sessionRes = await fetchWithAuth(config, '/api/chat', {
    method: 'POST',
    body: JSON.stringify({ workId: targetWork.id, userName: '정호', keepMemory: false }),
  });
  const sessionData: any = await sessionRes.json();
  if (!sessionData.session) {
    console.error('❌ 세션 생성 실패:', JSON.stringify(sessionData).substring(0, 200));
    process.exit(1);
  }
  const sessionId = sessionData.session.id;
  console.log(`🎬 세션: ${sessionId}\n`);

  // 테스트 메시지 실행
  const allMetrics: StreamingMetrics[] = [];
  const turns = Math.min(config.turns, testMessages.length);

  for (let i = 0; i < turns; i++) {
    console.log(`\n━━━ T${i + 1}: "${testMessages[i]}" ━━━`);
    const m = await measureStreamingResponse(config, sessionId, testMessages[i]);
    allMetrics.push(m);

    console.log(`  📊 요약:`);
    console.log(`     turn_start:  ${m.turnStartMs ?? 'N/A'}ms (UI 플레이스홀더 생성)`);
    console.log(`     first_delta: ${m.firstDeltaMs ?? 'N/A'}ms (첫 텍스트 표시)`);
    console.log(`     first_turn:  ${m.firstTurnMs ?? 'N/A'}ms (첫 턴 완성)`);
    console.log(`     total:       ${m.totalMs}ms`);
    console.log(`     deltas: ${m.turnDeltaCount}회 | starts: ${m.turnStartCount}회 | completes: ${m.turnCompleteCount}회`);
    if (m.deltaChunks.length > 0) {
      console.log(`     첫 5 delta 청크: ${JSON.stringify(m.deltaChunks)}`);
    }

    // 턴 간 딜레이
    if (i < turns - 1) await new Promise(r => setTimeout(r, 2000));
  }

  // 종합 리포트
  console.log('\n\n═══════════════════════════════════════');
  console.log('📊 토큰 단위 스트리밍 TTFT 테스트 결과');
  console.log('═══════════════════════════════════════');

  const valid = allMetrics.filter(m => m.firstDeltaMs !== null);
  if (valid.length > 0) {
    const avgTurnStart = Math.round(valid.reduce((s, m) => s + (m.turnStartMs || 0), 0) / valid.length);
    const avgFirstDelta = Math.round(valid.reduce((s, m) => s + (m.firstDeltaMs || 0), 0) / valid.length);
    const avgFirstTurn = Math.round(valid.reduce((s, m) => s + (m.firstTurnMs || 0), 0) / valid.length);
    const avgTotal = Math.round(valid.reduce((s, m) => s + m.totalMs, 0) / valid.length);
    const avgDeltas = Math.round(valid.reduce((s, m) => s + m.turnDeltaCount, 0) / valid.length);

    console.log(`  턴 수: ${valid.length}`);
    console.log(`  평균 turn_start:  ${avgTurnStart}ms (UI 즉시 반응)`);
    console.log(`  평균 first_delta: ${avgFirstDelta}ms (첫 텍스트 ★체감 TTFT★)`);
    console.log(`  평균 first_turn:  ${avgFirstTurn}ms (첫 턴 완성)`);
    console.log(`  평균 total:       ${avgTotal}ms`);
    console.log(`  평균 delta 횟수:  ${avgDeltas}회`);
    console.log(`\n  체감 개선: ${avgFirstTurn}ms → ${avgFirstDelta}ms (${Math.round((1 - avgFirstDelta / avgFirstTurn) * 100)}% 개선)`);
  } else {
    console.log('  ⚠️ 스트리밍 이벤트 없음 — turn_start/turn_delta 미수신');
    console.log('  기존 방식으로 동작 중:');
    for (const m of allMetrics) {
      console.log(`    first_turn: ${m.firstTurnMs}ms | total: ${m.totalMs}ms | deltas: ${m.turnDeltaCount}`);
    }
  }
}

main().catch(console.error);
