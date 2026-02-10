/**
 * P1 기능 테스트 스크립트
 *
 * 테스트 항목:
 * 1. 더미 데이터 생성 (유저, 작품, 캐릭터, 세션)
 * 2. 기억 강도 감소 (Memory Decay) 테스트
 * 3. 세션 요약 자동 생성 테스트
 * 4. SSE 스트리밍 테스트 (실제 API 호출)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// 1. 더미 데이터 생성
// ============================================
async function createTestData() {
  console.log('\n=== 1. 더미 데이터 생성 ===\n');

  // 테스트 유저 생성 (또는 기존 유저 사용)
  let testUser = await prisma.user.findFirst({ where: { email: 'test@synk.dev' } });
  if (!testUser) {
    testUser = await prisma.user.create({
      data: {
        id: 'test-user-001',
        name: '테스트유저',
        email: 'test@synk.dev',
        role: 'user',
      },
    });
    console.log('  [+] 테스트 유저 생성:', testUser.name);
  } else {
    console.log('  [=] 기존 테스트 유저 사용:', testUser.name);
  }

  // 테스트 작품 생성
  let testWork = await prisma.work.findFirst({ where: { title: '[테스트] 카페 알바 이야기' } });
  if (!testWork) {
    testWork = await prisma.work.create({
      data: {
        title: '[테스트] 카페 알바 이야기',
        description: '동네 카페에서 알바하며 만나는 다양한 사람들의 이야기',
        tags: JSON.stringify(['일상', '카페', '로맨스', '테스트']),
        targetAudience: 'all',
        visibility: 'public',
        isAdult: false,
        authorId: testUser.id,
        worldSetting: '서울 홍대입구역 근처의 아담한 카페 "문라이트". 오래된 2층 건물의 1층에 위치하며, 따뜻한 조명과 원목 인테리어가 특징이다.',
      },
    });
    console.log('  [+] 테스트 작품 생성:', testWork.title);
  } else {
    console.log('  [=] 기존 테스트 작품 사용:', testWork.title);
  }

  // 캐릭터 생성
  const existingChars = await prisma.character.findMany({ where: { workId: testWork.id } });
  let characters = existingChars;

  if (existingChars.length === 0) {
    characters = await Promise.all([
      prisma.character.create({
        data: {
          workId: testWork.id,
          name: '서윤아',
          prompt: `## 기본 정보
- 이름: 서윤아
- 나이: 22세
- 역할: 카페 문라이트 점장

## 성격
- 밝고 활발한 성격, 손님에게 항상 웃으며 대한다
- 약간 덜렁대지만 카페 운영엔 진심
- 유저(알바생)에게 친근하게 대하며 이것저것 가르쳐준다

## 말투
- 반말과 존댓말을 섞어 쓰며 친근한 언니/누나 같은 느낌
- "자, 이건 이렇게 하는 거야~", "수고했어!", "에이~ 괜찮아 괜찮아"`,
        },
      }),
      prisma.character.create({
        data: {
          workId: testWork.id,
          name: '한시우',
          prompt: `## 기본 정보
- 이름: 한시우
- 나이: 24세
- 역할: 카페 단골 손님, 소설가 지망생

## 성격
- 조용하고 관찰력이 뛰어남
- 항상 구석 자리에서 노트북으로 글을 씀
- 처음엔 무뚝뚝하지만 친해지면 의외로 수다스러움

## 말투
- 존댓말, 짧고 간결, 가끔 문학적 표현
- "아메리카노요.", "...괜찮은 날이네요.", "당신은 흥미로운 사람이에요."`,
        },
      }),
    ]);
    console.log('  [+] 캐릭터 생성:', characters.map(c => c.name).join(', '));
  } else {
    console.log('  [=] 기존 캐릭터 사용:', characters.map(c => c.name).join(', '));
  }

  // 오프닝 생성
  const existingOpenings = await prisma.opening.findMany({ where: { workId: testWork.id } });
  if (existingOpenings.length === 0) {
    await prisma.opening.create({
      data: {
        workId: testWork.id,
        title: '첫 출근',
        content: `*카페 문라이트, 오전 9시.*

*오래된 나무 문을 열자 커피 향이 코끝을 감싼다. 따뜻한 조명 아래 원목 테이블들이 정갈하게 놓여있다.*

"어, 왔어? 오늘이 첫날이지?"

*카운터 뒤에서 앞치마를 두르고 있던 여자가 환하게 웃으며 손을 흔든다.*

"나 서윤아, 여기 점장이야. 편하게 언니라고 불러~"

*구석 창가 자리에서 누군가가 조용히 노트북을 바라보고 있다. 긴 머리카락 사이로 날카로운 눈매가 언뜻 보인다.*`,
        isDefault: true,
        order: 0,
        initialLocation: '카페 문라이트',
        initialTime: '오전 9시',
        initialCharacters: JSON.stringify(['서윤아', '한시우']),
      },
    });
    console.log('  [+] 오프닝 생성 완료');
  }

  // 테스트용 채팅 세션 생성
  const testSession = await prisma.chatSession.create({
    data: {
      workId: testWork.id,
      userId: testUser.id,
      userName: '테스트유저',
      intimacy: 2.0,
      turnCount: 0,
      currentLocation: '카페 문라이트',
      currentTime: '오전 9시',
      presentCharacters: JSON.stringify(['서윤아', '한시우']),
      recentEvents: JSON.stringify([]),
      characterMemories: JSON.stringify({ lastUpdated: Date.now() }),
    },
  });
  console.log('  [+] 테스트 세션 생성:', testSession.id);

  return { testUser, testWork, characters, testSession };
}

// ============================================
// 2. 기억 강도 감소 테스트
// ============================================
async function testMemoryDecay(sessionId: string, characterId: string) {
  console.log('\n=== 2. 기억 강도 감소 테스트 ===\n');

  // 테스트 기억 생성 (타입별)
  const memories = await Promise.all([
    prisma.characterMemory.create({
      data: {
        sessionId,
        characterId,
        originalEvent: '유저가 커피 취향을 말했다',
        interpretation: '아메리카노를 좋아하는 사람이구나',
        memoryType: 'episodic',
        importance: 0.7,
        strength: 1.0,
        keywords: JSON.stringify(['커피', '아메리카노']),
      },
    }),
    prisma.characterMemory.create({
      data: {
        sessionId,
        characterId,
        originalEvent: '유저의 이름을 알게 됨',
        interpretation: '테스트유저라는 이름이다',
        memoryType: 'semantic',
        importance: 0.9,
        strength: 1.0,
        keywords: JSON.stringify(['이름', '유저']),
      },
    }),
    prisma.characterMemory.create({
      data: {
        sessionId,
        characterId,
        originalEvent: '유저가 웃으며 인사했다',
        interpretation: '따뜻한 사람이라는 느낌을 받았다',
        memoryType: 'emotional',
        importance: 0.6,
        strength: 1.0,
        emotionalResponse: JSON.stringify({ emotion: '호감', intensity: 0.5 }),
        keywords: JSON.stringify(['인사', '호감']),
      },
    }),
  ]);
  console.log(`  [+] 테스트 기억 ${memories.length}개 생성 (strength=1.0)`);

  // 감소 실행 (5회 반복 시뮬레이션)
  const { decayMemoryStrength } = await import('../src/lib/narrative-memory');

  for (let i = 1; i <= 5; i++) {
    await decayMemoryStrength(sessionId);

    const updated = await prisma.characterMemory.findMany({
      where: { sessionId },
      select: { memoryType: true, strength: true, originalEvent: true },
      orderBy: { memoryType: 'asc' },
    });

    console.log(`\n  [턴 ${i * 5}] 감소 후:`);
    for (const m of updated) {
      console.log(`    ${m.memoryType.padEnd(10)} strength=${m.strength.toFixed(4)} | ${m.originalEvent}`);
    }
  }

  // 기대값 확인
  const final = await prisma.characterMemory.findMany({
    where: { sessionId },
    select: { memoryType: true, strength: true },
  });

  const episodicStrength = final.find(m => m.memoryType === 'episodic')?.strength || 0;
  const semanticStrength = final.find(m => m.memoryType === 'semantic')?.strength || 0;
  const emotionalStrength = final.find(m => m.memoryType === 'emotional')?.strength || 0;

  // episodic: 1.0 * 0.95^5 ≈ 0.7738
  // semantic: 1.0 * 0.98^5 ≈ 0.9039
  // emotional: 1.0 * 0.97^5 ≈ 0.8587
  console.log('\n  [결과 검증]');
  console.log(`    episodic:  ${episodicStrength.toFixed(4)} (기대값 ≈ 0.7738) ${Math.abs(episodicStrength - 0.7738) < 0.01 ? '✅' : '❌'}`);
  console.log(`    semantic:  ${semanticStrength.toFixed(4)} (기대값 ≈ 0.9039) ${Math.abs(semanticStrength - 0.9039) < 0.01 ? '✅' : '❌'}`);
  console.log(`    emotional: ${emotionalStrength.toFixed(4)} (기대값 ≈ 0.8587) ${Math.abs(emotionalStrength - 0.8587) < 0.01 ? '✅' : '❌'}`);
}

// ============================================
// 3. 세션 요약 생성 테스트
// ============================================
async function testSessionSummary() {
  console.log('\n=== 3. 세션 요약 생성 테스트 ===\n');

  const { generateSessionSummary } = await import('../src/lib/gemini');

  const mockMessages = [
    { role: 'system', content: '카페 문라이트에 첫 출근하는 날이다.' },
    { role: 'user', content: '안녕하세요! 오늘부터 알바하게 된 학생입니다.' },
    { role: 'dialogue', content: '어머, 반가워~ 나는 서윤아, 여기 점장이야!', characterName: '서윤아' },
    { role: 'user', content: '잘 부탁드립니다, 윤아 언니!' },
    { role: 'dialogue', content: '에이~ 그렇게 딱딱하게 말하지 마~ 편하게 해!', characterName: '서윤아' },
    { role: 'user', content: '저기... 저쪽에 앉아계신 분은 누구에요?' },
    { role: 'narrator', content: '구석 자리에서 노트북을 바라보던 남자가 잠시 고개를 들었다.' },
    { role: 'dialogue', content: '...아메리카노 한 잔이요.', characterName: '한시우' },
    { role: 'dialogue', content: '아~ 시우 씨! 우리 단골이야. 소설 쓰시는 분이야~', characterName: '서윤아' },
    { role: 'user', content: '소설가시군요! 멋있다...' },
    { role: 'dialogue', content: '...아직 지망생이에요. 멋있을 것 없어요.', characterName: '한시우' },
    { role: 'user', content: '그래도 꿈이 있다는 건 대단한 거 아닐까요?' },
    { role: 'dialogue', content: '...흥미로운 관점이네요. 고마워요.', characterName: '한시우' },
  ];

  console.log('  [요청] 13개 메시지 요약 중...');

  try {
    const summary = await generateSessionSummary(mockMessages);
    console.log('\n  [결과] 생성된 요약:');
    console.log('  ─────────────────────────────────────');
    console.log(`  ${summary}`);
    console.log('  ─────────────────────────────────────');
    console.log(`\n  요약 길이: ${summary.length}자 ${summary.length > 0 ? '✅' : '❌'}`);
  } catch (error) {
    console.error('  [에러] 요약 생성 실패:', error);
    console.log('  (GEMINI_API_KEY가 설정되어 있는지 확인하세요)');
  }
}

// ============================================
// 4. SSE 스트리밍 테스트
// ============================================
async function testSSEStreaming(sessionId: string, userId: string) {
  console.log('\n=== 4. SSE 스트리밍 테스트 ===\n');
  console.log('  [정보] SSE 테스트는 dev 서버가 실행 중이어야 합니다.');
  console.log('  [정보] 테스트 세션 ID:', sessionId);
  console.log('  [정보] 테스트 유저 ID:', userId);
  console.log('\n  브라우저에서 http://localhost:3000 접속 후');
  console.log('  위 작품에서 채팅을 시작하면 SSE 스트리밍을 확인할 수 있습니다.');
  console.log('\n  또는 아래 curl 명령으로 테스트:');
  console.log(`  curl -N -X PUT http://localhost:3000/api/chat \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"sessionId":"${sessionId}","content":"안녕하세요!"}'`);
}

// ============================================
// 메인 실행
// ============================================
async function main() {
  console.log('╔══════════════════════════════════════╗');
  console.log('║    P1 기능 테스트 시작               ║');
  console.log('╚══════════════════════════════════════╝');

  try {
    // 1. 더미 데이터 생성
    const { testUser, characters, testSession } = await createTestData();

    // 2. 기억 강도 감소 테스트
    await testMemoryDecay(testSession.id, characters[0].id);

    // 3. 세션 요약 생성 테스트
    await testSessionSummary();

    // 4. SSE 스트리밍 안내
    await testSSEStreaming(testSession.id, testUser.id);

    console.log('\n╔══════════════════════════════════════╗');
    console.log('║    P1 기능 테스트 완료               ║');
    console.log('╚══════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n[FATAL] 테스트 실패:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
