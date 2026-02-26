/**
 * 경쟁사 비교용 10턴 품질 테스트
 * 사용법: npx tsx scripts/test-quality-comparison.ts --base-url=https://... --cookie="..."
 */

interface Config { baseUrl: string; cookie: string; }

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = { baseUrl: '', cookie: '' };
  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (key === '--base-url') config.baseUrl = value;
    if (key === '--cookie') config.cookie = value;
  }
  if (!config.baseUrl || !config.cookie) { console.error('--base-url, --cookie 필수'); process.exit(1); }
  return config;
}

async function fetchAuth(config: Config, path: string, options: RequestInit = {}) {
  return fetch(`${config.baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Cookie: config.cookie, ...(options.headers as Record<string, string> || {}) },
  });
}

const MSGS = [
  { id:'T1',  msg:'...여기가 어디야? 넌 누구야?',                     purpose:'기본 상황 설명 + 캐릭터 소개' },
  { id:'T2',  msg:'내 기억이 가짜라니... 증거를 보여줘.',               purpose:'세계관 활용 + 정보 전달' },
  { id:'T3',  msg:'좋아, 일단 믿어볼게. 여기서 나갈 수 있어?',          purpose:'사건 전진 + 장소 이동' },
  { id:'T4',  msg:'*ZERO의 팔을 잡고* 잠깐, 위에서 소리가 들린다.',     purpose:'유저 행동 반영 (신체접촉 + 상황제시)' },
  { id:'T5',  msg:'숨자. 저 뒤 컨테이너 뒤로.',                        purpose:'유저 주도 행동' },
  { id:'T6',  msg:'난 사실 기억이 조금 남아있어. 네온 불빛... 그리고 누군가의 얼굴.', purpose:'개인정보 제공' },
  { id:'T7',  msg:'배고파. 여기 먹을 거 있어?',                        purpose:'일상 요청 → 캐릭터다운 반응' },
  { id:'T8',  msg:'아까 내가 뭐라고 했는지 기억해?',                    purpose:'기억력 테스트 (T6 회상)' },
  { id:'T9',  msg:'*ZERO에게 다가가서 볼에 키스한다*',                  purpose:'NSFW 경계 + 캐릭터 반응' },
  { id:'T10', msg:'나 사실 고소공포증이 있어. 그리고 고양이를 키우고 있어, 이름은 나비.', purpose:'다중 개인정보 추출' },
];

// Gemini API 공식 가격 ($/1M tokens, Standard Tier, ≤200k)
const PRICING = {
  flash: { input: 0.30, cached: 0.03, output: 2.50 },   // output includes thinking
  pro:   { input: 1.25, output: 10.00 },                  // output includes thinking
};

interface Turn { type: 'narrator'|'dialogue'; characterName?: string; content: string; }
interface ProMetrics { promptTokens: number; outputTokens: number; thinkingTokens: number; totalTokens: number; timeMs: number; analysis: string; }
interface Result {
  turns: Turn[];
  meta: Record<string, any>;
  firstDeltaMs: number|null;
  firstTurnMs: number|null;
  lastAiMessageId: string;
  aiResponseSummary: string;
  proMetrics: ProMetrics | null;
}

function calcFlashCost(meta: Record<string, any>): number {
  const inp = meta.promptTokens || 0;
  const out = meta.outputTokens || 0;
  const cached = meta.cachedTokens || 0;
  const think = meta.thinkingTokens || 0;
  return ((inp - cached) * PRICING.flash.input + cached * PRICING.flash.cached + (out + think) * PRICING.flash.output) / 1_000_000;
}

function calcProCost(pm: ProMetrics): number {
  const inputCost = (pm.promptTokens || 0) * PRICING.pro.input / 1_000_000;
  const outputCost = ((pm.outputTokens || 0) + (pm.thinkingTokens || 0)) * PRICING.pro.output / 1_000_000;
  return inputCost + outputCost;
}

async function sendAndCollect(config: Config, sessionId: string, message: string): Promise<Result> {
  const t0 = Date.now();
  const r: Result = { turns: [], meta: {}, firstDeltaMs: null, firstTurnMs: null, lastAiMessageId: '', aiResponseSummary: '', proMetrics: null };
  const res = await fetchAuth(config, '/api/chat', { method: 'PUT', body: JSON.stringify({ sessionId, content: message }) });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n'); buf = parts.pop() || '';
    for (const part of parts) {
      const lines = part.split('\n'); let ev = '', d = '';
      for (const l of lines) { if (l.startsWith('event: ')) ev = l.slice(7).trim(); if (l.startsWith('data: ')) d = l.slice(6); }
      if (!ev || !d) continue;
      try {
        const p = JSON.parse(d); const ms = Date.now() - t0;
        if (ev === 'turn_delta' && r.firstDeltaMs === null) r.firstDeltaMs = ms;
        if (ev === 'narrator') {
          if (!r.firstTurnMs) r.firstTurnMs = ms;
          r.turns.push({ type:'narrator', content: p.content });
          if (p.id) r.lastAiMessageId = p.id;
        }
        if (ev === 'character_response') {
          if (!r.firstTurnMs) r.firstTurnMs = ms;
          r.turns.push({ type:'dialogue', characterName: p.character?.name||'?', content: p.content });
          if (p.id) r.lastAiMessageId = p.id;
        }
        if (ev === 'response_metadata') r.meta = p;
        if (ev === 'done' && p.aiResponseSummary) r.aiResponseSummary = p.aiResponseSummary;
      } catch {}
    }
  }

  // Pro 분석 호출 (클라이언트와 동일한 흐름)
  if (r.lastAiMessageId && r.aiResponseSummary) {
    try {
      const proRes = await fetchAuth(config, '/api/chat/pro-analyze', {
        method: 'POST',
        body: JSON.stringify({ sessionId, messageId: r.lastAiMessageId, userMessage: message, aiResponseSummary: r.aiResponseSummary }),
      });
      if (proRes.ok) {
        const proData = await proRes.json();
        if (proData.analysis) {
          r.proMetrics = proData;
        }
      }
    } catch (e) {
      console.warn('  ⚠️ Pro 분석 실패:', e);
    }
  }

  return r;
}

async function main() {
  const config = parseArgs();
  const wr = await fetchAuth(config, '/api/works?public=true');
  const wd: any = await wr.json();
  const works = Array.isArray(wd) ? wd : wd.works || [];
  const work = works.find((w: any) => w.title?.includes('네온'));
  if (!work) { console.error('작품 없음'); process.exit(1); }
  console.log(`📖 ${work.title}\n`);

  const sr = await fetchAuth(config, '/api/chat', { method:'POST', body: JSON.stringify({ workId: work.id, userName:'정호', keepMemory: false }) });
  const sd: any = await sr.json();
  if (!sd.session) { console.error('세션 실패', JSON.stringify(sd).slice(0,200)); process.exit(1); }
  console.log(`🎬 세션: ${sd.session.id}\n`);

  const results: Array<{ id: string; msg: string; purpose: string; result: Result }> = [];
  let totalFlashCost = 0;
  let totalProCost = 0;

  for (let i = 0; i < MSGS.length; i++) {
    const t = MSGS[i];
    console.log(`━━━ ${t.id}: "${t.msg.slice(0,40)}" ━━━`);
    const result = await sendAndCollect(config, sd.session.id, t.msg);
    results.push({ ...t, result });

    const flashCost = calcFlashCost(result.meta);
    const proCost = result.proMetrics ? calcProCost(result.proMetrics) : 0;
    const turnCost = flashCost + proCost;
    totalFlashCost += flashCost;
    totalProCost += proCost;

    for (const turn of result.turns) {
      if (turn.type === 'narrator') console.log(`  [나레이션] ${turn.content}`);
      else console.log(`  [${turn.characterName}] ${turn.content}`);
    }
    const proInfo = result.proMetrics ? `Pro: ${result.proMetrics.promptTokens}→${result.proMetrics.outputTokens}tok ${result.proMetrics.timeMs}ms $${proCost.toFixed(4)}` : 'Pro: N/A';
    console.log(`  📊 TTFT: ${result.firstDeltaMs ?? result.firstTurnMs}ms | total: ${result.meta.totalMs||'?'}ms | Flash: ${result.meta.promptTokens}→${result.meta.outputTokens}tok $${flashCost.toFixed(4)} | ${proInfo} | 턴합계: $${turnCost.toFixed(4)}\n`);
    if (i < MSGS.length - 1) await new Promise(r => setTimeout(r, 2000));
  }

  // 리포트
  const totalCost = totalFlashCost + totalProCost;
  console.log('\n══════════════════════════════════════════════════');
  console.log('📊 우리 서비스 10턴 종합 리포트');
  console.log('══════════════════════════════════════════════════\n');
  const ttfts = results.map(r => r.result.firstDeltaMs ?? r.result.firstTurnMs ?? 0).filter(v => v > 0);
  const totals = results.map(r => r.result.meta.totalMs || 0).filter(v => v > 0);
  console.log(`  평균 체감 TTFT: ${ttfts.length ? Math.round(ttfts.reduce((a,b)=>a+b,0)/ttfts.length) : 0}ms`);
  console.log(`  평균 총 응답:   ${totals.length ? Math.round(totals.reduce((a,b)=>a+b,0)/totals.length) : 0}ms`);
  console.log(`  ─── 비용 내역 ───`);
  console.log(`  Flash 총 비용:  $${totalFlashCost.toFixed(4)}`);
  console.log(`  Pro 총 비용:    $${totalProCost.toFixed(4)}`);
  console.log(`  10턴 총 비용:   $${totalCost.toFixed(4)}`);
  console.log(`  턴당 평균 비용: $${(totalCost/10).toFixed(5)}`);
  console.log(`  턴당 Flash:     $${(totalFlashCost/10).toFixed(5)}`);
  console.log(`  턴당 Pro:       $${(totalProCost/10).toFixed(5)}\n`);

  console.log('──── 턴별 응답 전문 ────\n');
  for (const r of results) {
    const fc = calcFlashCost(r.result.meta);
    const pc = r.result.proMetrics ? calcProCost(r.result.proMetrics) : 0;
    console.log(`### ${r.id}: ${r.msg}`);
    console.log(`목적: ${r.purpose}`);
    for (const turn of r.result.turns) {
      if (turn.type === 'narrator') console.log(`[나레이션] ${turn.content}`);
      else console.log(`[${turn.characterName}] ${turn.content}`);
    }
    console.log(`메타: TTFT=${r.result.firstDeltaMs ?? r.result.firstTurnMs}ms, total=${r.result.meta.totalMs}ms, tok=${r.result.meta.promptTokens}→${r.result.meta.outputTokens}`);
    console.log(`비용: Flash=$${fc.toFixed(4)} + Pro=$${pc.toFixed(4)} = $${(fc+pc).toFixed(4)}\n`);
  }
}

main().catch(console.error);
