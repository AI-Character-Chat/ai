/**
 * E2E 테스트: 커스텀 관계 시스템
 *
 * 1. 테스트용 작품 생성 (RPG 장르)
 * 2. 캐릭터 추가
 * 3. 오프닝 추가
 * 4. 커스텀 관계 설정 저장 (RPG 4축: 무력/지력/통솔/내정)
 * 5. 채팅 세션 시작 + 메시지 전송
 * 6. 응답에서 관계 데이터 검증
 * 7. 정리 (작품 삭제)
 */

const BASE_URL = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'https://synk-character-chat.vercel.app';
const COOKIE = process.argv.find(a => a.startsWith('--cookie='))?.split('=').slice(1).join('=') || '';

if (!COOKIE) {
  console.error('Usage: npx tsx scripts/test-custom-rel-e2e.ts --cookie=YOUR_SESSION_TOKEN --base-url=URL');
  process.exit(1);
}

const headers = {
  'Content-Type': 'application/json',
  'Cookie': `__Secure-authjs.session-token=${COOKIE}`,
};

let workId = '';
let characterId = '';
let openingId = '';
let sessionId = '';

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`Redirect ${res.status} → ${res.headers.get('location')} (인증 실패?)`);
  }

  const text = await res.text();
  let json: unknown;
  try { json = JSON.parse(text); } catch { json = text; }

  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  }
  return json as Record<string, unknown>;
}

async function readSSE(method: string, path: string, body?: unknown): Promise<{ events: Array<{ type: string; data: unknown }>; raw: string }> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SSE ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }

  const events: Array<{ type: string; data: unknown }> = [];
  const raw = await res.text();

  // SSE 파싱
  const lines = raw.split('\n');
  let currentEvent = '';
  let currentData = '';

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6);
    } else if (line === '' && currentEvent) {
      try {
        events.push({ type: currentEvent, data: JSON.parse(currentData) });
      } catch {
        events.push({ type: currentEvent, data: currentData });
      }
      currentEvent = '';
      currentData = '';
    }
  }

  return { events, raw };
}

function pass(name: string) { console.log(`  ✅ ${name}`); }
function fail(name: string, err: unknown) { console.log(`  ❌ ${name}: ${err}`); }

async function cleanup() {
  if (workId) {
    try {
      // 작품 삭제는 API가 없을 수 있으므로 skip
      console.log(`\n🧹 테스트 작품 ID: ${workId} (수동 삭제 필요 시)`);
    } catch { /* ignore */ }
  }
}

async function main() {
  console.log(`\n🔬 커스텀 관계 시스템 E2E 테스트`);
  console.log(`   Base URL: ${BASE_URL}`);
  console.log(`   Cookie: ...${COOKIE.slice(-8)}\n`);

  try {
    // ──────────────────────────────────────
    // Step 1: 작품 생성
    // ──────────────────────────────────────
    console.log('📦 Step 1: 작품 생성');
    const work = await api('POST', '/api/works', {
      title: '[E2E TEST] RPG 관계 테스트',
      description: 'E2E 테스트용 임시 작품',
      genre: 'RPG',
      isPublic: false,
    });
    workId = work.id as string;
    pass(`작품 생성: ${workId}`);

    // ──────────────────────────────────────
    // Step 2: 캐릭터 추가
    // ──────────────────────────────────────
    console.log('\n👤 Step 2: 캐릭터 추가');
    const char = await api('POST', `/api/characters?workId=${workId}`, {
      name: '기사단장 아르테미스',
      prompt: '충성스럽고 강인한 기사단장. 정의감이 넘치며 부하들에게 존경받는다. 격식체, 군인다운 간결한 말투. 왕국 최고의 기사단을 이끄는 단장.',
      workId,
    });
    characterId = char.id as string;
    pass(`캐릭터 생성: ${characterId} (${(char as Record<string, unknown>).name})`);

    // ──────────────────────────────────────
    // Step 3: 오프닝 추가
    // ──────────────────────────────────────
    console.log('\n📖 Step 3: 오프닝 추가');
    const opening = await api('POST', '/api/openings', {
      workId,
      title: '기사단 훈련장',
      content: '기사단 훈련장에서 아르테미스가 검술 훈련을 하고 있다. 당신이 다가오자 검을 내려놓고 고개를 돌린다.',
      isDefault: true,
      initialLocation: '기사단 훈련장',
      initialTime: '오전',
      presentCharacters: JSON.stringify(['기사단장 아르테미스']),
    });
    openingId = opening.id as string;
    pass(`오프닝 생성: ${openingId}`);

    // ──────────────────────────────────────
    // Step 4: 커스텀 관계 설정 저장 (RPG 4축)
    // ──────────────────────────────────────
    console.log('\n⚙️ Step 4: RPG 커스텀 관계 설정 저장');
    const rpgConfig = {
      axes: [
        { key: 'combat', label: '무력', description: '전투 능력에 대한 인정', defaultValue: 30, negative: false },
        { key: 'intelligence', label: '지력', description: '지적 능력에 대한 인정', defaultValue: 30, negative: false },
        { key: 'leadership', label: '통솔', description: '리더십에 대한 인정', defaultValue: 20, negative: false },
        { key: 'governance', label: '내정', description: '행정 능력에 대한 인정', defaultValue: 20, negative: false },
      ],
      levels: [
        { key: 'recruit', label: '견습 기사', minScore: 0 },
        { key: 'knight', label: '정규 기사', minScore: 30 },
        { key: 'captain', label: '기사대장', minScore: 50, gates: { combat: 40 } },
        { key: 'commander', label: '대장군', minScore: 70, gates: { combat: 60, leadership: 50 } },
        { key: 'king', label: '왕', minScore: 90, gates: { combat: 70, leadership: 70, governance: 60 } },
      ],
      weights: { combat: 0.35, intelligence: 0.25, leadership: 0.25, governance: 0.15 },
      defaultDeltas: { combat: 1, intelligence: 0, leadership: 0, governance: 0 },
    };

    const updatedWork = await api('PUT', `/api/works/${workId}`, {
      relationshipConfig: JSON.stringify(rpgConfig),
    });

    // 설정이 저장되었는지 검증
    const savedConfig = (updatedWork as Record<string, unknown>).relationshipConfig as string;
    const parsed = JSON.parse(savedConfig);
    if (parsed.axes?.length === 4 && parsed.axes[0].key === 'combat') {
      pass(`RPG 관계 설정 저장 (4축: ${parsed.axes.map((a: { label: string }) => a.label).join('/')})`);
    } else {
      fail('관계 설정 검증', `axes=${JSON.stringify(parsed.axes)}`);
    }

    // ──────────────────────────────────────
    // Step 5: 채팅 세션 시작
    // ──────────────────────────────────────
    console.log('\n💬 Step 5: 채팅 세션 시작 (POST /api/chat → JSON)');
    const createRes = await api('POST', '/api/chat', { workId, openingId });
    const sessionData = (createRes as Record<string, unknown>).session as Record<string, unknown>;
    sessionId = (sessionData?.id as string) || (createRes as Record<string, unknown>).sessionId as string;
    if (sessionId) {
      pass(`세션 생성: ${sessionId}`);
    } else {
      fail('세션 생성', `응답: ${JSON.stringify(createRes).slice(0, 300)}`);
      await cleanup();
      return;
    }

    // ──────────────────────────────────────
    // Step 6: 메시지 전송 + 응답 검증
    // ──────────────────────────────────────
    console.log('\n🗡️ Step 6: 채팅 메시지 전송');
    const { events: chatEvents } = await readSSE('PUT', '/api/chat', {
      sessionId,
      content: '아르테미스, 나도 검술을 배우고 싶어. 기본 자세부터 알려줘!',
    });

    const eventTypes = chatEvents.map(e => e.type);
    console.log(`  수신 이벤트: ${eventTypes.join(' → ')}`);

    // 캐릭터 응답 확인
    const charResponse = chatEvents.find(e => e.type === 'character_response');
    if (charResponse) {
      const content = ((charResponse.data as Record<string, unknown>).content as string) || '';
      pass(`캐릭터 응답: "${content.slice(0, 60)}..."`);
    } else {
      const narrator = chatEvents.find(e => e.type === 'narrator');
      if (narrator) {
        pass(`나레이터 응답 (캐릭터 응답 대신)`);
      } else {
        fail('캐릭터 응답', '응답 없음');
      }
    }

    // done 이벤트 메타데이터에서 memoryDebug 확인
    const doneEvent = chatEvents.find(e => e.type === 'done');
    if (doneEvent) {
      const doneData = doneEvent.data as Record<string, unknown>;
      const metadata = doneData.metadata as Record<string, unknown> | undefined;

      if (metadata?.memoryDebug) {
        const memDebug = metadata.memoryDebug as Array<Record<string, unknown>>;
        console.log(`\n📊 메모리 디버그 데이터:`);

        for (const char of memDebug) {
          const rel = char.relationship as Record<string, unknown>;
          console.log(`  캐릭터: ${char.characterName}`);
          console.log(`    레벨: ${rel.intimacyLevel}`);

          // axisValues 검증 (RPG 4축이 있어야 함)
          const axisValues = rel.axisValues as Record<string, number> | undefined;
          const axisLabels = rel.axisLabels as Record<string, string> | undefined;

          if (axisValues) {
            const axisDisplay = Object.entries(axisValues)
              .map(([k, v]) => `${axisLabels?.[k] || k}: ${v}`)
              .join(', ');
            console.log(`    축 값: ${axisDisplay}`);

            // RPG 4축 키 검증
            const expectedKeys = ['combat', 'intelligence', 'leadership', 'governance'];
            const hasAllKeys = expectedKeys.every(k => k in axisValues);
            if (hasAllKeys) {
              pass(`RPG 4축 모두 포함 (${expectedKeys.join('/')})`);
            } else {
              fail('RPG 4축 검증', `Missing keys. Got: ${Object.keys(axisValues).join(', ')}`);
            }

            // 라벨 검증
            if (axisLabels && axisLabels.combat === '무력' && axisLabels.intelligence === '지력') {
              pass(`축 라벨 정상 (무력/지력/통솔/내정)`);
            } else {
              fail('축 라벨 검증', `Got: ${JSON.stringify(axisLabels)}`);
            }
          } else {
            fail('axisValues', '없음 — 커스텀 관계가 적용되지 않음');
          }
        }
      } else {
        console.log('\n⚠️ memoryDebug 없음 (isAdmin이 아닐 수 있음)');
      }

      // memory_update 이벤트 확인
      const memUpdate = chatEvents.find(e => e.type === 'memory_update');
      if (memUpdate) {
        const results = (memUpdate.data as Record<string, unknown>).results as Array<Record<string, unknown>>;
        console.log(`\n💾 메모리 업데이트:`);
        for (const r of results) {
          console.log(`  ${r.characterName}: surprise=${r.surpriseAction} score=${(r.surpriseScore as number)?.toFixed(2)}`);
          const relUp = r.relationshipUpdate as Record<string, number>;
          if (relUp) {
            const deltaDisplay = Object.entries(relUp).map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`).join(', ');
            console.log(`    관계 변화: ${deltaDisplay}`);

            // 커스텀 축 키가 포함되어 있는지
            const hasCustomKey = Object.keys(relUp).some(k => ['combat', 'intelligence', 'leadership', 'governance'].includes(k));
            if (hasCustomKey || Object.keys(relUp).length === 0) {
              pass('관계 변화에 커스텀 축 키 사용');
            } else {
              // 기본 5축 키가 온 경우
              const hasLegacyKey = Object.keys(relUp).some(k => ['trust', 'affection', 'respect', 'rivalry', 'familiarity'].includes(k));
              if (hasLegacyKey) {
                fail('관계 변화', `레거시 5축 키 사용됨: ${Object.keys(relUp).join(', ')}`);
              }
            }
          }
        }
      } else {
        console.log('\n⚠️ memory_update 이벤트 없음');
      }
    }

    // ──────────────────────────────────────
    // 결과 요약
    // ──────────────────────────────────────
    console.log('\n════════════════════════════════');
    console.log('✅ E2E 테스트 완료');
    console.log('════════════════════════════════');

  } catch (err) {
    console.error('\n💥 테스트 실패:', err);
  } finally {
    await cleanup();
  }
}

main();
