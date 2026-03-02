/**
 * 토큰 단위 스트리밍 단위 테스트
 * extractNewTurnsFromBuffer + extractPartialTurnInfo 로직 검증
 */

// extractNewTurnsFromBuffer만 export되어 있으므로 직접 사용
import { extractNewTurnsFromBuffer } from '../src/lib/gemini';

const characters = [
  { id: 'zero-id', name: 'ZERO' },
  { id: 'velvet-id', name: '벨벳 (Velvet)' },
];

// extractPartialTurnInfo는 모듈 내부 함수이므로, 버퍼 시뮬레이션으로 간접 테스트
// 대신 extractNewTurnsFromBuffer의 lastCompleteEndPos를 활용한 통합 테스트

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// ──── Test 1: lastCompleteEndPos 반환 ────
console.log('\n📋 Test 1: lastCompleteEndPos 정상 반환');
{
  const buffer = '{"turns":[{"type":"narrator","character":"","content":"Hello world.","emotion":"neutral","emotionIntensity":0.5}]}';
  const result = extractNewTurnsFromBuffer(buffer, 0, characters);
  assert(result.newTurns.length === 1, `완성 turn 1개 (got ${result.newTurns.length})`);
  assert(result.totalObjectCount === 1, `objectCount 1 (got ${result.totalObjectCount})`);
  assert(result.lastCompleteEndPos > 0, `lastCompleteEndPos > 0 (got ${result.lastCompleteEndPos})`);
  assert(result.newTurns[0]?.type === 'narrator', `turn type=narrator`);
}

// ──── Test 2: 불완전한 turn에서 lastCompleteEndPos ────
console.log('\n📋 Test 2: 불완전 turn → lastCompleteEndPos = 첫 turn 끝');
{
  const turn1 = '{"type":"narrator","character":"","content":"First turn.","emotion":"neutral","emotionIntensity":0.5}';
  const partialTurn2 = '{"type":"dialogue","character":"ZERO","content":"Partial conte';
  const buffer = `{"turns":[${turn1},${partialTurn2}`;

  const result = extractNewTurnsFromBuffer(buffer, 0, characters);
  assert(result.newTurns.length === 1, `완성 turn 1개 (got ${result.newTurns.length})`);
  assert(result.totalObjectCount === 1, `objectCount 1 (got ${result.totalObjectCount})`);

  // lastCompleteEndPos 이후에 부분 turn이 있어야 함
  const remaining = buffer.substring(result.lastCompleteEndPos);
  assert(remaining.includes('ZERO'), `나머지 버퍼에 ZERO 포함 (remaining: ${remaining.substring(0, 50)}...)`);
  assert(remaining.includes('Partial conte'), `나머지 버퍼에 부분 content 포함`);
}

// ──── Test 3: alreadyProcessed 스킵 동작 ────
console.log('\n📋 Test 3: alreadyProcessed로 이전 turn 스킵');
{
  const turn1 = '{"type":"narrator","character":"","content":"First.","emotion":"neutral","emotionIntensity":0.5}';
  const turn2 = '{"type":"dialogue","character":"ZERO","content":"Second.","emotion":"smirk","emotionIntensity":0.7}';
  const buffer = `{"turns":[${turn1},${turn2}]}`;

  const result1 = extractNewTurnsFromBuffer(buffer, 0, characters);
  assert(result1.newTurns.length === 2, `첫 호출: 2개 turn (got ${result1.newTurns.length})`);

  const result2 = extractNewTurnsFromBuffer(buffer, 1, characters);
  assert(result2.newTurns.length === 1, `두번째 호출 (skip 1): 1개 turn (got ${result2.newTurns.length})`);
  assert(result2.newTurns[0]?.characterName === 'ZERO', `스킵 후 ZERO turn`);

  const result3 = extractNewTurnsFromBuffer(buffer, 2, characters);
  assert(result3.newTurns.length === 0, `세번째 호출 (skip 2): 0개 turn (got ${result3.newTurns.length})`);
}

// ──── Test 4: 점진적 버퍼 성장 시뮬레이션 ────
console.log('\n📋 Test 4: 점진적 버퍼 성장 (스트리밍 시뮬레이션)');
{
  const chunks = [
    '{"turns":[{"type":"narr',
    'ator","character":"","cont',
    'ent":"어둠이 ',
    '잠시 정적을 채운다.',
    '","emotion":"neutral","emotionIntensity":0.5}',
    ',{"type":"dialogue","character":"ZERO","conte',
    'nt":"깨어',
    '났군. 생각보다 빨리.',
    '","emotion":"smirk","emotionIntensity":0.7}],',
    '"scene":{"location":"지하기지","time":"밤","presentCharacters":["ZERO"]}}',
  ];

  let buffer = '';
  let processedCount = 0;
  const events: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    buffer += chunks[i];
    const result = extractNewTurnsFromBuffer(buffer, processedCount, characters);

    if (result.newTurns.length > 0) {
      for (const turn of result.newTurns) {
        events.push(`turn:${turn.type}:${turn.characterName || 'narrator'}:${turn.content.substring(0, 20)}`);
      }
      processedCount = result.totalObjectCount;
    }

    // 부분 turn 정보는 lastCompleteEndPos 이후로 확인
    const remaining = buffer.substring(result.lastCompleteEndPos);
    if (remaining.includes('"type"') && remaining.includes('"content"') && !remaining.includes(']}')) {
      // 부분 content 있음 — 실제 extractPartialTurnInfo가 할 일
      const contentMatch = remaining.match(/"content"\s*:\s*"([^"]*)$/);
      if (contentMatch) {
        events.push(`partial:${contentMatch[1].substring(0, 20)}`);
      }
    }
  }

  console.log(`  이벤트 시퀀스: ${events.join(' → ')}`);
  assert(events.some(e => e.startsWith('turn:narrator')), `narrator turn 감지됨`);
  assert(events.some(e => e.startsWith('turn:dialogue:ZERO')), `ZERO dialogue turn 감지됨`);
}

// ──── Test 5: 이스케이프 문자 처리 ────
console.log('\n📋 Test 5: JSON 이스케이프 문자 content');
{
  const buffer = '{"turns":[{"type":"narrator","character":"","content":"그가 말했다. \\"이건 진짜야.\\" 그리고\\n다음 줄.","emotion":"neutral","emotionIntensity":0.5}]}';
  const result = extractNewTurnsFromBuffer(buffer, 0, characters);
  assert(result.newTurns.length === 1, `이스케이프 포함 turn 파싱 성공`);
  assert(result.newTurns[0]?.content.includes('"이건 진짜야."'), `이스케이프된 따옴표 처리됨`);
  assert(result.newTurns[0]?.content.includes('\n'), `\\n 처리됨`);
}

// ──── Test 6: 캐릭터 매칭 ────
console.log('\n📋 Test 6: 캐릭터 이름 매칭');
{
  const buffer = '{"turns":[{"type":"dialogue","character":"ZERO","content":"test","emotion":"neutral","emotionIntensity":0.5},{"type":"dialogue","character":"벨벳 (Velvet)","content":"test2","emotion":"neutral","emotionIntensity":0.5}]}';
  const result = extractNewTurnsFromBuffer(buffer, 0, characters);
  assert(result.newTurns.length === 2, `2개 dialogue turn`);
  assert(result.newTurns[0]?.characterId === 'zero-id', `ZERO → zero-id`);
  assert(result.newTurns[1]?.characterId === 'velvet-id', `벨벳 → velvet-id`);
}

// ──── 결과 ────
console.log(`\n\n═══════════════════════════════════════`);
console.log(`📊 단위 테스트 결과: ${passed} passed, ${failed} failed`);
console.log(`═══════════════════════════════════════`);

if (failed > 0) process.exit(1);
