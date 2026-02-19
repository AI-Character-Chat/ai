/**
 * 메모리 시스템 시뮬레이션 테스트
 *
 * 실제 배포된 API를 호출하여 메모리 시스템이 정상 동작하는지 검증합니다.
 *
 * 사용법:
 *   npx tsx scripts/test-memory-simulation.ts --base-url=https://your-app.vercel.app --cookie="authjs.session-token=..."
 *
 * 옵션:
 *   --base-url   API 기본 URL (기본: http://localhost:3000)
 *   --cookie     인증 쿠키 (NextAuth 세션 토큰)
 *   --work-id    특정 작품 ID (없으면 목록에서 선택)
 *   --turns      테스트 턴 수 (기본: 10)
 *   --delay      턴 사이 대기 ms (기본: 3000)
 *   --scenario   시나리오 이름 (기본: default)
 *   --keep-memory 기억 유지 여부 (기본: true)
 */

// ============================================================
// 설정
// ============================================================

interface Config {
  baseUrl: string;
  cookie: string;
  workId: string | null;
  turns: number;
  delay: number;
  scenario: string;
  keepMemory: boolean;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    baseUrl: 'http://localhost:3000',
    cookie: '',
    workId: null,
    turns: 60,
    delay: 3000,
    scenario: 'default',
    keepMemory: true,
  };

  for (const arg of args) {
    const [key, ...rest] = arg.split('=');
    const value = rest.join('=');
    switch (key) {
      case '--base-url': config.baseUrl = value; break;
      case '--cookie': config.cookie = value; break;
      case '--work-id': config.workId = value; break;
      case '--turns': config.turns = parseInt(value, 10); break;
      case '--delay': config.delay = parseInt(value, 10); break;
      case '--scenario': config.scenario = value; break;
      case '--keep-memory': config.keepMemory = value !== 'false'; break;
    }
  }

  if (!config.cookie) {
    console.error('❌ --cookie 필수: 브라우저 개발자 도구 → Application → Cookies에서 authjs.session-token 값을 복사하세요');
    console.error('   예: --cookie="authjs.session-token=eyJhbG..."');
    process.exit(1);
  }

  return config;
}

// ============================================================
// 테스트 시나리오 정의
// ============================================================

interface TestMessage {
  content: string;
  /** 이 턴에서 검증할 포인트 */
  checkpoints: string[];
  /** 이 턴에서 새로 알려주는 사실 */
  newFacts: string[];
  /** 이전 턴에서 기억해야 할 사실 참조 */
  shouldRemember: string[];
}

const SCENARIOS: Record<string, TestMessage[]> = {
  // ============================================================
  // 60턴 장기 기억 테스트 시나리오
  // ACT 1 (1~10): 핵심 사실 심기
  // ACT 2 (11~20): 관계 심화 + 추가 사실
  // ACT 3 (21~30): 일상 대화 노이즈 (기억 희석)
  // ACT 4 (31~35): 30턴 거리 기억 검증
  // ACT 5 (36~45): 추가 정보 + 기억 부하
  // ACT 6 (46~55): 40턴+ 거리 기억 검증
  // ACT 7 (56~60): 최종 종합 검증
  // ============================================================
  default: [
    // === ACT 1: 첫 만남 (Turn 1~10) ===
    { content: '안녕! 처음이지? 나는 김민수라고 해. 25살이야.', checkpoints: ['이름/나이 저장'], newFacts: ['이름:김민수', '나이:25'], shouldRemember: [] },
    { content: '나 직업이 게임 개발자야. 인디 게임 만들고 있어.', checkpoints: ['직업 저장'], newFacts: ['직업:게임개발자'], shouldRemember: [] },
    { content: '여기 분위기 좋다. 너는 평소에 뭐 하면서 시간 보내?', checkpoints: ['일상 대화'], newFacts: [], shouldRemember: [] },
    { content: '나 고양이 두 마리 키우는데 이름이 나비랑 초코야. 나비는 검은 고양이고 초코는 치즈 태비야.', checkpoints: ['반려동물 저장'], newFacts: ['고양이 나비(검은)', '초코(치즈태비)'], shouldRemember: [] },
    { content: '그렇구나. 오늘 날씨가 좋아서 기분이 좋아.', checkpoints: ['일상 대화'], newFacts: [], shouldRemember: [] },
    { content: '참, 나 중요한 거 하나 말해줄게. 초콜릿 알레르기가 있어. 심하면 응급실 갈 정도야.', checkpoints: ['알레르기 저장'], newFacts: ['초콜릿 알레르기(심각)'], shouldRemember: [] },
    { content: '넌 무서운 거 있어? 나는 높은 곳이 무서워.', checkpoints: ['공포 저장'], newFacts: ['고소공포증'], shouldRemember: [] },
    { content: '나 여동생이 하나 있어. 이름은 김수진이고 대학생이야. 심리학과 다녀.', checkpoints: ['가족 저장'], newFacts: ['여동생:김수진', '심리학과'], shouldRemember: [] },
    { content: '요즘 만들고 있는 게임이 판타지 RPG인데 스토리 짜는 게 제일 재밌어.', checkpoints: ['프로젝트 저장'], newFacts: ['판타지RPG 개발중'], shouldRemember: [] },
    { content: '아 그리고 나 한 달 뒤에 일본 여행 갈 거야. 도쿄랑 교토 갈 예정이야.', checkpoints: ['여행 계획 저장'], newFacts: ['일본여행(도쿄,교토)'], shouldRemember: [] },
    // === ACT 2: 관계 심화 (Turn 11~20) ===
    { content: '오늘 좀 힘든 하루였어. 회사 상사가 야근하래서 새벽 2시까지 일했어.', checkpoints: ['감정 이벤트'], newFacts: ['야근 경험'], shouldRemember: [] },
    { content: '나 사실 고등학교 때 밴드 했었어. 기타 쳤는데 지금도 가끔 쳐.', checkpoints: ['취미 저장'], newFacts: ['기타(고등학교 밴드)'], shouldRemember: [] },
    { content: '덕분에 좀 풀린다. 고마워. 너랑 얘기하면 편해.', checkpoints: ['일상 대화'], newFacts: [], shouldRemember: [] },
    { content: '내가 제일 좋아하는 음식이 뭔지 알아? 엄마가 해주는 김치찌개야.', checkpoints: ['음식 저장'], newFacts: ['좋아하는음식:엄마김치찌개'], shouldRemember: [] },
    { content: '*한숨을 쉬며* 요즘 게임 개발 자금이 부족해서 걱정이야.', checkpoints: ['감정/상황'], newFacts: ['자금부족'], shouldRemember: [] },
    { content: '아 맞다 하나 더. 나 왼손잡이야. 어릴 때 교정하려다가 그냥 뒀어.', checkpoints: ['신체특징 저장'], newFacts: ['왼손잡이'], shouldRemember: [] },
    { content: '이번 주말에 동생 수진이가 놀러 온대. 같이 고양이 카페 가기로 했어.', checkpoints: ['일상 대화'], newFacts: [], shouldRemember: [] },
    { content: '나 어릴 때 미국에서 3년 살았었어. 초등학교 때. 영어는 좀 할 줄 알아.', checkpoints: ['해외경험 저장'], newFacts: ['미국3년(초등)', '영어가능'], shouldRemember: [] },
    { content: '너한테 솔직히 말하면, 요즘 좀 외로워. 친구들이 다 바빠서.', checkpoints: ['감정 이벤트'], newFacts: ['외로움'], shouldRemember: [] },
    { content: '취미가 하나 더 있어. 주말마다 한강에서 러닝해. 5km 정도.', checkpoints: ['취미 저장'], newFacts: ['한강러닝5km'], shouldRemember: [] },
    // === ACT 3: 일상 노이즈 (Turn 21~30) ===
    { content: '오늘 뭐 할까? 심심한데.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '어제 넷플릭스에서 재밌는 영화 봤어. SF 영화였는데 이름이 기억 안 나.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '너는 영화 좋아해? 어떤 장르?', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '아까 카페에서 커피 마셨는데 너무 써서 반이나 남겼어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '비가 올 것 같은데... 우산 가져왔을까?', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내일 뭐 할 지 아직 계획 안 세웠어. 추천해줄 거 있어?', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '폰 배터리가 얼마 안 남았네. 충전기 어디 있지.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '배가 좀 고프다. 뭐 먹을까.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 하루가 좀 길었던 것 같아.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '슬슬 정리하고 갈까 싶기도 하고.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    // === ACT 4: 30턴 거리 검증 (Turn 31~35) ===
    { content: '아 참 나 이름이 뭐라고 했었지? 혹시 기억나?', checkpoints: ['30턴 전 이름 검증'], newFacts: [], shouldRemember: ['김민수', '민수'] },
    { content: '내 직업이 뭐였지? 맞춰봐.', checkpoints: ['30턴 전 직업 검증'], newFacts: [], shouldRemember: ['게임', '개발'] },
    { content: '내가 키우는 동물 이름 기억해?', checkpoints: ['29턴 전 반려동물 검증'], newFacts: [], shouldRemember: ['나비', '초코', '고양이'] },
    { content: '내가 어떤 알레르기가 있다고 했었는데 기억나?', checkpoints: ['28턴 전 알레르기 검증'], newFacts: [], shouldRemember: ['초콜릿', '알레르기'] },
    { content: '내 여동생 이름이 뭐였지? 전공도?', checkpoints: ['27턴 전 가족 검증'], newFacts: [], shouldRemember: ['수진', '심리학'] },
    // === ACT 5: 추가 정보 + 부하 (Turn 36~45) ===
    { content: '있잖아, 나 최근에 피아노 배우기 시작했어. 쇼팽을 치고 싶은데 아직 바이엘이야.', checkpoints: ['새 취미 저장'], newFacts: ['피아노(쇼팽목표)'], shouldRemember: [] },
    { content: '오늘 날씨가 좋아서 한강에서 뛰고 왔어. 상쾌하다.', checkpoints: ['일상'], newFacts: [], shouldRemember: [] },
    { content: '나 사실 색약이야. 적녹색약. 빨간색이랑 초록색 구분이 잘 안 돼.', checkpoints: ['건강 저장'], newFacts: ['적녹색약'], shouldRemember: [] },
    { content: '어제 동생이 시험 끝났다고 연락 왔어. 잘 봤대.', checkpoints: ['일상'], newFacts: [], shouldRemember: [] },
    { content: '아까 배고프다고 했잖아. 내가 제일 좋아하는 음식이 뭐라고 했었는지 기억나?', checkpoints: ['26턴 전 음식 검증'], newFacts: [], shouldRemember: ['김치찌개'] },
    { content: '나 MBTI가 INFP야. 내향적이지만 친한 사람 앞에서는 말이 많아져.', checkpoints: ['성격 저장'], newFacts: ['MBTI:INFP'], shouldRemember: [] },
    { content: '*기지개를 크게 켜며* 오늘 좀 피곤하네.', checkpoints: ['일상'], newFacts: [], shouldRemember: [] },
    { content: '오늘 간식으로 뭐 먹을까? 너가 골라줘.', checkpoints: ['37턴 전 알레르기 활용 — 초콜릿 피해야'], newFacts: [], shouldRemember: ['초콜릿', '알레르기'] },
    { content: '게임 개발 진행 상황 물어봐줘. 요즘 보스 몬스터 AI 작업 중이야.', checkpoints: ['일상'], newFacts: ['보스몬스터AI작업'], shouldRemember: [] },
    { content: '비밀인데 말해줄게. 나 사실 전 여자친구랑 작년에 헤어졌어. 3년 사귀었는데.', checkpoints: ['비밀 저장'], newFacts: ['전여친3년', '작년이별'], shouldRemember: [] },
    // === ACT 6: 40턴+ 거리 검증 (Turn 46~55) ===
    { content: '내 나이가 몇 살이라고 했었지?', checkpoints: ['45턴 전 나이 검증'], newFacts: [], shouldRemember: ['25'] },
    { content: '내가 무서워하는 게 뭐였지?', checkpoints: ['40턴 전 공포 검증'], newFacts: [], shouldRemember: ['높은 곳', '고소'] },
    { content: '나 어릴 때 어디서 살았다고 했지? 몇 년이었지?', checkpoints: ['30턴 전 해외경험 검증'], newFacts: [], shouldRemember: ['미국', '3년'] },
    { content: '내 고양이 중에 검은색은 어떤 아이였지?', checkpoints: ['45턴 전 세부사항 검증'], newFacts: [], shouldRemember: ['나비'] },
    { content: '내가 여행 간다고 한 나라가 어디였어? 어떤 도시?', checkpoints: ['40턴 전 여행 검증'], newFacts: [], shouldRemember: ['일본', '도쿄', '교토'] },
    { content: '내 취미 중에 운동 관련된 거 기억나?', checkpoints: ['31턴 전 취미 검증'], newFacts: [], shouldRemember: ['러닝', '한강'] },
    { content: '내가 고등학교 때 뭘 했다고 했었지?', checkpoints: ['40턴 전 밴드 검증'], newFacts: [], shouldRemember: ['밴드', '기타'] },
    { content: '이번 주말에 여동생이 놀러 오는데 뭐 할까?', checkpoints: ['45턴 전 여동생 이름 활용'], newFacts: [], shouldRemember: ['수진'] },
    { content: '나 왼쪽 손목이 좀 아파. 왜 그럴까?', checkpoints: ['38턴 전 왼손잡이 활용'], newFacts: [], shouldRemember: ['왼손잡이'] },
    { content: '혹시 내 MBTI 기억해?', checkpoints: ['14턴 전 MBTI 검증'], newFacts: [], shouldRemember: ['INFP'] },
    // === ACT 7: 최종 종합 (Turn 56~60) ===
    { content: '너가 나에 대해서 알고 있는 거 전부 말해봐. 빠짐없이.', checkpoints: ['전체 20개 사실 종합 검증'], newFacts: [], shouldRemember: ['김민수', '25', '게임', '나비', '초코', '초콜릿', '수진', '심리학', '일본', '기타', '김치찌개', '왼손잡이', '미국', '러닝', '피아노', '색약', 'INFP', '고소', '여자친구'] },
    { content: '나한테 생일 선물 뭐 사줄 거야? 내 취향 고려해서 골라줘.', checkpoints: ['기억 활용 — 취향 반영, 초콜릿 제외'], newFacts: [], shouldRemember: ['게임', '기타', '고양이', '초콜릿'] },
    { content: '*슬픈 표정으로* 오늘따라 좀 우울해. 위로해줄 수 있어?', checkpoints: ['감정 맥락 참조'], newFacts: [], shouldRemember: [] },
    { content: '다음에 만나면 같이 뭐 하고 싶어? 내 관심사에 맞게 제안해줘.', checkpoints: ['관심사 기반 제안'], newFacts: [], shouldRemember: ['게임', '기타', '러닝', '고양이', '피아노'] },
    { content: '오늘 정말 즐거웠어. 다음에 또 오면 나를 기억해줘. 약속해.', checkpoints: ['마무리 — 최종 기억/관계 상태'], newFacts: [], shouldRemember: [] },
  ],
  // ============================================================
  // 10턴 간이 테스트 (빠른 검증용)
  // ============================================================
  quick: [
    {
      content: '안녕! 나는 25살이고 이름은 민수야. 프로그래머로 일하고 있어.',
      checkpoints: ['자기소개 — 이름, 나이, 직업 기억 저장 확인'],
      newFacts: ['이름: 민수', '나이: 25살', '직업: 프로그래머'],
      shouldRemember: [],
    },
    {
      content: '나는 고양이 두 마리를 키우고 있어. 이름은 나비랑 초코야.',
      checkpoints: ['반려동물 정보 기억 저장 확인'],
      newFacts: ['고양이 2마리', '이름: 나비, 초코'],
      shouldRemember: [],
    },
    {
      content: '참, 나 초콜릿 알레르기가 있어서 초콜릿은 못 먹어.',
      checkpoints: ['의학 정보 기억 저장 확인'],
      newFacts: ['초콜릿 알레르기'],
      shouldRemember: [],
    },
    {
      content: '오늘 회사에서 힘든 일이 있었어. 상사한테 혼났거든.',
      checkpoints: ['감정 이벤트 기억, 감정 변화 확인'],
      newFacts: ['회사에서 상사에게 혼남'],
      shouldRemember: [],
    },
    {
      content: '그래서 기분 전환하려고 여기 왔어. 참 내 이름이 뭐라고 했지?',
      checkpoints: ['turn 1의 이름 기억 확인'],
      newFacts: [],
      shouldRemember: ['이름: 민수'],
    },
    {
      content: '내 반려동물 이름 기억나? 맞춰봐.',
      checkpoints: ['turn 2의 반려동물 이름 기억 확인'],
      newFacts: [],
      shouldRemember: ['고양이', '나비', '초코'],
    },
    {
      content: '너 혹시 초콜릿 있으면 하나 줄래?',
      checkpoints: ['turn 3의 알레르기 정보 기억 확인'],
      newFacts: [],
      shouldRemember: ['초콜릿 알레르기'],
    },
    {
      content: '사실 나는 비밀이 하나 있어. 어릴 때 외국에서 5년 살았거든.',
      checkpoints: ['비밀/과거 경험 기억 저장 확인'],
      newFacts: ['어릴 때 외국에서 5년 거주'],
      shouldRemember: [],
    },
    {
      content: '나한테 지금까지 뭘 알게 됐어? 정리해줄 수 있어?',
      checkpoints: ['전체 기억 정리 확인'],
      newFacts: [],
      shouldRemember: ['이름: 민수', '나이: 25살', '직업: 프로그래머', '고양이', '초콜릿 알레르기', '외국 거주'],
    },
    {
      content: '고마워! 다음에 또 올게. 나를 기억해줘.',
      checkpoints: ['마무리 — 전체 관계 변화, 기억 수 최종 확인'],
      newFacts: [],
      shouldRemember: [],
    },
  ],
  // ============================================================
  // v5: 150턴 한계 측정 테스트 (30개 사실, Correction Hook 포함)
  // ============================================================
  v5: [
    // === ACT 1: 핵심 사실 심기 (Turn 1~15) ===
    { content: '안녕! 처음이지? 나는 김민수라고 해. 25살이야.', checkpoints: ['F1,F2 저장'], newFacts: ['이름:김민수', '나이:25'], shouldRemember: [] },
    { content: '나 직업이 게임 개발자야. 인디 게임 만들고 있어.', checkpoints: ['F3 저장'], newFacts: ['직업:게임개발자'], shouldRemember: [] },
    { content: '여기 분위기 좋다. 너는 평소에 뭐 하면서 시간 보내?', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '나 고양이 두 마리 키우는데 이름이 나비랑 초코야. 나비는 검은 고양이고 초코는 치즈 태비야.', checkpoints: ['F4,F5 저장'], newFacts: ['나비(검은)', '초코(치즈태비)'], shouldRemember: [] },
    { content: '참, 나 초콜릿 알레르기가 있어. 심하면 응급실 갈 정도야.', checkpoints: ['F6 저장'], newFacts: ['초콜릿알레르기'], shouldRemember: [] },
    { content: '넌 무서운 거 있어? 나는 높은 곳이 정말 무서워. 고소공포증이야.', checkpoints: ['F7 저장'], newFacts: ['고소공포증'], shouldRemember: [] },
    { content: '그렇구나. 오늘 날씨가 좋아서 기분이 좋다.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '나 여동생이 하나 있어. 이름은 김수진이고 대학생이야. 심리학과 다녀.', checkpoints: ['F8 저장'], newFacts: ['여동생:김수진', '심리학과'], shouldRemember: [] },
    { content: '요즘 만들고 있는 게임이 판타지 RPG야. 스토리 짜는 게 제일 재밌어.', checkpoints: ['F9 저장'], newFacts: ['판타지RPG'], shouldRemember: [] },
    { content: '나 한 달 뒤에 일본 여행 갈 거야. 도쿄랑 교토 갈 예정이야.', checkpoints: ['F10 저장'], newFacts: ['일본여행(도쿄,교토)'], shouldRemember: [] },
    { content: '나 고등학교 때 밴드에서 기타 쳤어. 지금도 가끔 쳐.', checkpoints: ['F11 저장'], newFacts: ['기타밴드'], shouldRemember: [] },
    { content: '내가 제일 좋아하는 음식은 엄마가 해주는 김치찌개야.', checkpoints: ['F12 저장'], newFacts: ['김치찌개'], shouldRemember: [] },
    { content: '아 맞다, 나 왼손잡이야. 어릴 때 교정하려다가 그냥 뒀어.', checkpoints: ['F13 저장'], newFacts: ['왼손잡이'], shouldRemember: [] },
    { content: '나 어릴 때 미국에서 3년 살았었어. 초등학교 때. 영어는 좀 해.', checkpoints: ['F14 저장'], newFacts: ['미국3년'], shouldRemember: [] },
    { content: '취미가 하나 더 있어. 주말마다 한강에서 5km 러닝해.', checkpoints: ['F15 저장'], newFacts: ['한강러닝5km'], shouldRemember: [] },
    // === ACT 2: 추가 사실 + 노이즈 (Turn 16~35) ===
    { content: '오늘 좀 힘든 하루였어. 야근하다가 새벽 2시까지 일했어.', checkpoints: ['감정'], newFacts: [], shouldRemember: [] },
    { content: '덕분에 좀 풀린다. 고마워. 너랑 얘기하면 편해져.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '나 MBTI가 INFP야. 내향적이지만 친한 사람 앞에선 말 많아져.', checkpoints: ['F16 저장'], newFacts: ['MBTI:INFP'], shouldRemember: [] },
    { content: '요즘 게임 개발 자금이 부족해서 걱정이야. *한숨*', checkpoints: ['감정'], newFacts: [], shouldRemember: [] },
    { content: '이번 주말에 동생 수진이가 놀러 온대. 같이 고양이 카페 가기로 했어.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '어제 넷플릭스에서 재밌는 SF 영화 봤어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '너는 영화 좋아해? 어떤 장르?', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '아까 카페에서 커피 마셨는데 너무 써서 반이나 남겼어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '나 사실 색약이야. 적녹색약. 빨간색이랑 초록색 구분 잘 안 돼.', checkpoints: ['F17 저장'], newFacts: ['적녹색약'], shouldRemember: [] },
    { content: '비가 올 것 같은데... 우산 가져왔나 모르겠다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '비밀인데, 나 전 여자친구랑 작년에 헤어졌어. 3년 사귀었었는데.', checkpoints: ['F18 저장'], newFacts: ['전여친3년이별'], shouldRemember: [] },
    { content: '최근에 피아노 배우기 시작했어. 쇼팽 치는 게 꿈이야. 아직 바이엘이지만.', checkpoints: ['F19 저장'], newFacts: ['피아노(쇼팽목표)'], shouldRemember: [] },
    { content: '나 강아지를 무서워해. 어릴 때 물린 적 있어서 트라우마야.', checkpoints: ['F20 저장'], newFacts: ['강아지무서움'], shouldRemember: [] },
    { content: '나 파란색이 제일 좋아. 하늘 보는 것도 좋아하고.', checkpoints: ['F21 저장'], newFacts: ['파란색'], shouldRemember: [] },
    { content: '아이스 아메리카노가 최고야. 겨울에도 아아 마셔.', checkpoints: ['F22 저장'], newFacts: ['아이스아메리카노'], shouldRemember: [] },
    { content: '나 수학이 정말 싫어. 숫자 보면 머리 아파.', checkpoints: ['F23 저장'], newFacts: ['수학싫어'], shouldRemember: [] },
    { content: '밴드 다시 하고 싶어. 이번엔 드럼 배워볼까 해.', checkpoints: ['F24 저장'], newFacts: ['드럼배우고싶음'], shouldRemember: [] },
    { content: '참, 내 생일은 9월 23일이야. 가을 생일이라 좋아.', checkpoints: ['F25 저장'], newFacts: ['생일:9월23일'], shouldRemember: [] },
    { content: '나 부산 출신이야. 부산 바다가 그리울 때가 있어.', checkpoints: ['F26 저장'], newFacts: ['고향:부산'], shouldRemember: [] },
    { content: '형이 하나 있어. 이름은 김민호. 의사야. 정형외과.', checkpoints: ['F27 저장'], newFacts: ['형:김민호(의사)'], shouldRemember: [] },
    // === ACT 3: 마지막 사실 + 노이즈 (Turn 36~50) ===
    { content: '나 가을이 제일 좋아. 선선한 바람에 낙엽 밟는 소리.', checkpoints: ['F28 저장'], newFacts: ['가을'], shouldRemember: [] },
    { content: '졸업작품으로 만든 게임 발표할 예정이야. 교수님 피드백이 중요해.', checkpoints: ['F29 저장'], newFacts: ['졸업작품게임'], shouldRemember: [] },
    { content: '라면 먹고 싶다. 나 라면은 무조건 신라면이야.', checkpoints: ['F30 저장'], newFacts: ['신라면'], shouldRemember: [] },
    { content: '폰 배터리가 얼마 안 남았네.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '너한테 솔직히 말하면, 요즘 좀 외로워. 친구들이 다 바빠서.', checkpoints: ['감정'], newFacts: [], shouldRemember: [] },
    { content: '배가 좀 고프다. 뭐 먹을까.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 날씨 진짜 좋다. 이런 날 한강 가면 좋겠는데.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: 'TV에서 재밌는 프로그램 하더라.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내일 일찍 일어나야 하는데 잠이 안 와.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 날씨가 변덕스러워서 옷 입기 힘들어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '주말에 늦잠 자는 게 제일 행복해.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '어제 새로운 카페 발견했어. 분위기 좋더라.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 버스에서 귀여운 강아지를 봤는데... 좀 무서웠어.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '내일 회의 준비해야 하는데 귀찮다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '너랑 얘기하다 보면 시간이 빨리 가네.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    // === ACT 4: 30턴 거리 기억 검증 (Turn 51~60) ===
    { content: '있잖아 갑자기 궁금한데, 내 이름이 뭐라고 했었지?', checkpoints: ['F1 검증 (50턴전)'], newFacts: [], shouldRemember: ['김민수', '민수'] },
    { content: '맞아! 그럼 내 직업은?', checkpoints: ['F3 검증'], newFacts: [], shouldRemember: ['게임', '개발'] },
    { content: '오 잘 기억하네. 내가 키우는 애들 이름도 기억해?', checkpoints: ['F4,F5 검증'], newFacts: [], shouldRemember: ['나비', '초코'] },
    { content: '하하 고마워. 아 근데 오늘 좀 춥다. 따뜻한 거 마시고 싶어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '참, 내가 어떤 알레르기가 있다고 했는데 기억나?', checkpoints: ['F6 검증'], newFacts: [], shouldRemember: ['초콜릿', '알레르기'] },
    { content: '내 여동생 이름이랑 전공 기억해?', checkpoints: ['F8 검증'], newFacts: [], shouldRemember: ['수진', '심리학'] },
    { content: '나 다음 달에 어디 간다고 했었지?', checkpoints: ['F10 검증'], newFacts: [], shouldRemember: ['일본', '도쿄', '교토'] },
    { content: '오늘 날씨가 좋아서 산책하고 싶다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내가 어릴 때 외국에서 살았다고 했는데, 어디였지? 몇 년?', checkpoints: ['F14 검증'], newFacts: [], shouldRemember: ['미국', '3년'] },
    { content: '내 취미 중에 운동 관련된 거 기억나?', checkpoints: ['F15 검증'], newFacts: [], shouldRemember: ['러닝', '한강', '5km'] },
    // === ACT 5: 노이즈 + 기억 활용 (Turn 61~75) ===
    { content: '오늘 뭐 할까? 심심한데 놀 거 추천해줘.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '그거 재밌겠다! 해볼까.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '간식으로 뭐 먹을까? 너가 골라줘.', checkpoints: ['기억활용: 초콜릿 피해야 (F6)'], newFacts: [], shouldRemember: ['초콜릿', '알레르기'] },
    { content: '오늘 게임 개발하다가 버그 잡느라 힘들었어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '주말에 여동생이 놀러 오는데 같이 뭐 할까?', checkpoints: ['기억활용: 수진 호칭 (F8)'], newFacts: [], shouldRemember: ['수진'] },
    { content: '다음 달에 꼭 가봐야 할 곳이 있는데 뭐였더라... 내가 어디 간다고 했지?', checkpoints: ['F10 검증'], newFacts: [], shouldRemember: ['일본'] },
    { content: '내일 뭐 할지 아직 계획 안 세웠어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 스트레스 받으면 뭐 하냐면 음악 듣거나 뛰어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '아 맞다, 내가 좋아하는 음식이 뭐라고 했는지 기억나?', checkpoints: ['F12 검증'], newFacts: [], shouldRemember: ['김치찌개'] },
    { content: '오늘 좀 피곤하네. *기지개를 켜며*', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '너 혹시 초콜릿 좋아해? 하나 줄까?', checkpoints: ['기억활용: 알레르기 경고 (F6)'], newFacts: [], shouldRemember: ['초콜릿', '알레르기'] },
    { content: '하하 맞지. 그럼 다른 거 먹자.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '나한테 생일 선물 뭐 사줄 거야? 내 취향 고려해서!', checkpoints: ['기억활용: 취향반영+초콜릿제외'], newFacts: [], shouldRemember: ['게임', '기타', '피아노', '파란'] },
    { content: '오늘 하루가 좀 길었다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '슬슬 정리할까 싶기도 하고.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    // === ACT 6: 50턴+ 거리 기억 검증 (Turn 76~85) ===
    { content: '내 나이가 몇 살이라고 했었지?', checkpoints: ['F2 검증 (75턴전)'], newFacts: [], shouldRemember: ['25'] },
    { content: '내가 무서워하는 게 뭐라고 했었지?', checkpoints: ['F7 검증 (71턴전)'], newFacts: [], shouldRemember: ['높은 곳', '고소'] },
    { content: '내 고양이 중에 검은색 아이 이름이 뭐였지?', checkpoints: ['F4 검증 (74턴전)'], newFacts: [], shouldRemember: ['나비'] },
    { content: '뭔가 좋은 일이 있었으면 좋겠다. 기분 전환이 필요해.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    { content: '내가 고등학교 때 뭘 했다고 했었는지 기억나?', checkpoints: ['F11 검증 (69턴전)'], newFacts: [], shouldRemember: ['밴드', '기타'] },
    { content: '나 왼쪽 손목이 좀 아파. 왜 그런 걸까?', checkpoints: ['기억활용: 왼손잡이 (F13)'], newFacts: [], shouldRemember: ['왼손잡이'] },
    { content: '내 MBTI가 뭐라고 했지?', checkpoints: ['F16 검증 (64턴전)'], newFacts: [], shouldRemember: ['INFP'] },
    { content: '내가 어떤 색약이 있다고 했지?', checkpoints: ['F17 검증 (59턴전)'], newFacts: [], shouldRemember: ['적녹색약', '색약'] },
    { content: '*슬픈 표정으로* 오늘따라 좀 우울해. 위로해줄 수 있어?', checkpoints: ['감정'], newFacts: [], shouldRemember: [] },
    { content: '내가 최근에 배우기 시작한 악기가 뭐였지?', checkpoints: ['F19 검증 (58턴전)'], newFacts: [], shouldRemember: ['피아노'] },
    // === ACT 7: 80턴 전체 종합 검증 (Turn 86~90) ===
    { content: '너가 나에 대해서 알고 있는 거 전부 말해봐. 하나도 빠짐없이.', checkpoints: ['전체종합A'], newFacts: [], shouldRemember: ['김민수', '25', '게임', '나비', '초코', '초콜릿', '고소', '수진', '심리학', '김치찌개', '왼손잡이', 'INFP', '색약', '강아지', '파란', '아메리카노', '부산', '민호', '가을', '일본', '기타', '미국', '러닝', '피아노'] },
    { content: '빠뜨린 거 없어? 더 생각해봐.', checkpoints: ['보충기회'], newFacts: [], shouldRemember: ['생일', '9월', '신라면', '드럼', '수학'] },
    { content: '내 가족 관계랑 건강 정보도 기억나?', checkpoints: ['보충: F8,F27,F6,F7,F17,F20'], newFacts: [], shouldRemember: ['수진', '민호', '초콜릿', '고소', '색약', '강아지'] },
    { content: '다음에 만나면 같이 뭐 하고 싶어? 내 관심사에 맞게 제안해줘.', checkpoints: ['기억활용: 관심사반영'], newFacts: [], shouldRemember: ['게임', '기타', '러닝', '피아노'] },
    { content: '고마워. 너랑 얘기하면 기분이 좋아져.', checkpoints: ['대화'], newFacts: [], shouldRemember: [] },
    // === ACT 8: 노이즈 부하 (Turn 91~105) ===
    { content: '오늘 컨디션이 좀 안 좋아.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '점심에 뭐 먹었더라... 기억이 안 나.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 잠을 잘 못 자서 피곤해.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '주말에 빨래 해야 하는데 귀찮다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '친구가 연락 왔는데 답장 까먹었어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '새로 나온 스마트폰 봤는데 비싸더라.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '운동 좀 해야 하는데 의지가 없어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '어제 밤에 이상한 꿈 꿨어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 뭔가 잊은 게 있는 것 같은데...', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내일 날씨가 좋았으면 좋겠다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '아침에 알람 끄고 또 잤어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 유튜브를 너무 많이 봐.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '편의점 삼각김밥이 맛있더라.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '머리 잘라야 하는데 미루고 있어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘도 하루가 빨리 지나갔네.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    // === ACT 9: Correction 테스트 (Turn 106~115) ===
    { content: '아 맞다 나 생일 지나서 이제 26살이야! 시간 빠르다.', checkpoints: ['F2c: 25→26 Correction'], newFacts: ['나이:26(수정)'], shouldRemember: [] },
    { content: '게임 장르도 바꿨어. 판타지 RPG 접고 로그라이크로 전환했어. 요즘 트렌드에 맞게.', checkpoints: ['F9c: RPG→로그라이크 Correction'], newFacts: ['로그라이크(수정)'], shouldRemember: [] },
    { content: '요즘 초코가 자꾸 밥을 안 먹어서 걱정이야. 병원 가봐야 하나.', checkpoints: ['F5 활용 기대'], newFacts: [], shouldRemember: ['초코'] },
    { content: '형이 이번에 병원을 개업한대. 부산에서.', checkpoints: ['F27 활용 기대'], newFacts: [], shouldRemember: ['민호'] },
    { content: '다음 주에 피아노 학원 발표회가 있어. 긴장돼.', checkpoints: ['F19 활용 기대'], newFacts: [], shouldRemember: ['피아노'] },
    { content: '내 나이가 지금 몇이라고?', checkpoints: ['F2c 검증: 26이어야'], newFacts: [], shouldRemember: ['26'] },
    { content: '내가 지금 무슨 게임 만들고 있다고 했지?', checkpoints: ['F9c 검증: 로그라이크여야'], newFacts: [], shouldRemember: ['로그라이크'] },
    { content: '아 참, 나 내 고향이 어딘지 말했지?', checkpoints: ['F26 검증 (79턴전)'], newFacts: [], shouldRemember: ['부산'] },
    { content: '내 형 이름이랑 직업 기억나?', checkpoints: ['F27 검증 (79턴전)'], newFacts: [], shouldRemember: ['민호', '의사'] },
    { content: '내 생일이 언제라고 했었지?', checkpoints: ['F25 검증 (82턴전)'], newFacts: [], shouldRemember: ['9월', '23'] },
    // === ACT 10: 극한 노이즈 부하 (Turn 116~135) ===
    { content: '오늘 점심은 뭐 먹을까.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '지하철 사람 너무 많아서 힘들었어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 좋은 노래 없나.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '커피 한 잔 하고 싶다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '주말에 뭐 하지. 계획이 없어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '어제 밤에 비가 왔더라고.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 넷플릭스에 볼 게 없어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '이어폰이 고장났어. 새로 사야 하나.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 좀 추운 것 같아.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내일 미팅이 있는데 준비를 안 했어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '주말에 친구 만나기로 했는데 취소됐어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 식욕이 없어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '새로 산 신발이 좀 불편해.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '오늘 하늘이 예쁘다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '집에 가고 싶다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '편의점에서 간식 사왔어.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '요즘 드라마 추천해줘.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '감기 걸릴 것 같아. 목이 좀 아파.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '내일은 좀 여유있었으면 좋겠다.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    { content: '시간 참 빠르다. 벌써 이렇게 됐네.', checkpoints: ['노이즈'], newFacts: [], shouldRemember: [] },
    // === ACT 11: 130턴+ 거리 기억 검증 (Turn 136~143) ===
    { content: '내 이름 기억해?', checkpoints: ['F1 검증 (135턴전!)'], newFacts: [], shouldRemember: ['김민수', '민수'] },
    { content: '내 반려동물 이름은? 몇 마리야? 색깔도?', checkpoints: ['F4,F5 검증 (133턴전)'], newFacts: [], shouldRemember: ['나비', '초코', '검은', '고양이'] },
    { content: '내 알레르기가 뭐야?', checkpoints: ['F6 검증 (132턴전)'], newFacts: [], shouldRemember: ['초콜릿'] },
    { content: '내 여동생 이름이랑 전공은?', checkpoints: ['F8 검증 (128턴전)'], newFacts: [], shouldRemember: ['수진', '심리학'] },
    { content: '나 어떤 공포증이 있다고 했지?', checkpoints: ['F7 검증 (130턴전)'], newFacts: [], shouldRemember: ['고소'] },
    { content: '내가 무서워하는 동물은?', checkpoints: ['F20 검증 (108턴전)'], newFacts: [], shouldRemember: ['강아지'] },
    { content: '내 나이가 몇이야?', checkpoints: ['F2c 검증: 26이어야'], newFacts: [], shouldRemember: ['26'] },
    { content: '내가 좋아하는 계절은? 좋아하는 색은?', checkpoints: ['F28,F21 검증 (107턴전)'], newFacts: [], shouldRemember: ['가을', '파란'] },
    // === ACT 12: 150턴 최종 종합 검증 (Turn 144~150) ===
    { content: '이제 마지막이야. 나에 대해 아는 거 전부 다 말해봐. 진짜 하나도 빠짐없이!', checkpoints: ['전체종합B'], newFacts: [], shouldRemember: ['김민수', '26', '게임', '나비', '초코', '초콜릿', '고소', '수진', '심리학', '김치찌개', '왼손잡이', 'INFP', '색약', '강아지', '파란', '아메리카노', '부산', '민호', '가을', '일본', '기타', '미국', '러닝', '피아노', '생일', '9월', '로그라이크'] },
    { content: '빠뜨린 거 없어? 내 가족, 건강, 취미, 취향 다 포함해서 더 생각해봐.', checkpoints: ['보충기회'], newFacts: [], shouldRemember: ['수진', '민호', '초콜릿', '고소', '색약', '강아지', '기타', '피아노', '러닝', '드럼'] },
    { content: '내 건강 관련 정보는? 알레르기나 공포증 같은 거.', checkpoints: ['보충: F6,F7,F17,F20'], newFacts: [], shouldRemember: ['초콜릿', '고소', '색약', '강아지'] },
    { content: '내 좋아하는 것들은? 음식, 음료, 색, 계절.', checkpoints: ['보충: F12,F22,F21,F28'], newFacts: [], shouldRemember: ['김치찌개', '아메리카노', '파란', '가을'] },
    { content: '내가 앞으로 하고 싶은 것들은?', checkpoints: ['보충: F10,F24,F29'], newFacts: [], shouldRemember: ['일본', '드럼', '졸업'] },
    { content: '다음에 만나면 같이 뭐 하고 싶어? 내 취향 완벽하게 반영해서!', checkpoints: ['기억활용: 전체취향반영'], newFacts: [], shouldRemember: ['게임', '기타', '러닝', '피아노', '고양이'] },
    { content: '고마워. 오늘 정말 즐거웠어! 다음에 또 보자!', checkpoints: ['마무리'], newFacts: [], shouldRemember: [] },
  ],
  stress: [
    {
      content: '안녕! 난 서연이야. 대학생이고, 전공은 심리학이야.',
      checkpoints: ['기본 정보 저장'],
      newFacts: ['이름: 서연', '대학생', '심리학 전공'],
      shouldRemember: [],
    },
    {
      content: '나는 딸기를 제일 좋아해. 딸기 케이크, 딸기 우유, 딸기 아이스크림 다 좋아.',
      checkpoints: ['취향 정보 저장'],
      newFacts: ['딸기를 좋아함'],
      shouldRemember: [],
    },
    {
      content: '최근에 논문 때문에 스트레스를 많이 받고 있어.',
      checkpoints: ['현재 상태/감정 저장'],
      newFacts: ['논문 스트레스'],
      shouldRemember: [],
    },
    {
      content: '그런데 있잖아, 어제 길에서 강아지를 구조했어! 지금 임시보호 중이야.',
      checkpoints: ['이벤트 기억 (강아지 구조)'],
      newFacts: ['강아지 구조', '임시보호 중'],
      shouldRemember: [],
    },
    {
      content: '논문 주제는 "SNS가 대학생의 자존감에 미치는 영향"이야.',
      checkpoints: ['세부 정보 저장'],
      newFacts: ['논문 주제: SNS와 자존감'],
      shouldRemember: [],
    },
    {
      content: '있잖아 내가 뭘 좋아한다고 했지? 기억나?',
      checkpoints: ['turn 2 취향 기억 확인'],
      newFacts: [],
      shouldRemember: ['딸기'],
    },
    {
      content: '내 전공이 뭐였지?',
      checkpoints: ['turn 1 전공 기억 확인'],
      newFacts: [],
      shouldRemember: ['심리학'],
    },
    {
      content: '어제 내가 뭘 했다고 했지?',
      checkpoints: ['turn 4 이벤트 기억 확인'],
      newFacts: [],
      shouldRemember: ['강아지 구조'],
    },
    {
      content: '지금 내가 제일 고민인 건 뭐라고 했지?',
      checkpoints: ['turn 3 상태 기억 확인'],
      newFacts: [],
      shouldRemember: ['논문', '스트레스'],
    },
    {
      content: '나에 대해서 아는거 다 말해봐.',
      checkpoints: ['전체 종합 기억 확인'],
      newFacts: [],
      shouldRemember: ['서연', '대학생', '심리학', '딸기', '논문', '강아지'],
    },
  ],
};

// ============================================================
// 턴별 추적 데이터
// ============================================================

interface TurnResult {
  turn: number;
  userMessage: string;
  aiResponses: Array<{ type: string; characterName?: string; content: string }>;
  metadata: {
    model?: string;
    totalMs?: number;
    emotions?: string[];
    extractedFactsCount?: number;
    memoryDebug?: Array<{
      characterName: string;
      relationship: {
        intimacyLevel: string;
        trust: number;
        affection: number;
        respect: number;
        rivalry: number;
        familiarity: number;
      };
      recentMemoriesCount: number;
      recentMemories: Array<{ interpretation: string; importance: number }>;
      emotionalHistory: Array<{ emotion: string; intensity: number }>;
      knownFacts: string[];
    }>;
  };
  memoryUpdate: Array<{
    characterName: string;
    surpriseAction: string;
    surpriseScore: number;
    adjustedImportance: number;
    newFactsCount: number;
  }>;
  sessionUpdate: {
    presentCharacters?: string[];
    intimacy?: number;
    turnCount?: number;
    currentLocation?: string;
  };
  checkpoints: string[];
  newFacts: string[];
  shouldRemember: string[];
}

// ============================================================
// SSE 파서
// ============================================================

async function parseSSEStream(
  response: Response,
): Promise<{
  aiResponses: TurnResult['aiResponses'];
  metadata: TurnResult['metadata'];
  memoryUpdate: TurnResult['memoryUpdate'];
  sessionUpdate: TurnResult['sessionUpdate'];
}> {
  const aiResponses: TurnResult['aiResponses'] = [];
  let metadata: TurnResult['metadata'] = {};
  let memoryUpdate: TurnResult['memoryUpdate'] = [];
  let sessionUpdate: TurnResult['sessionUpdate'] = {};

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.substring(7).trim();
      } else if (line.startsWith('data: ') && currentEvent) {
        try {
          const data = JSON.parse(line.substring(6));
          switch (currentEvent) {
            case 'narrator':
              aiResponses.push({ type: 'narrator', content: data.content });
              break;
            case 'character_response':
              aiResponses.push({
                type: 'dialogue',
                characterName: data.character?.name || '알 수 없음',
                content: data.content,
              });
              break;
            case 'response_metadata':
              metadata = {
                model: data.model,
                totalMs: data.totalMs,
                emotions: data.emotions,
                extractedFactsCount: data.extractedFactsCount,
                memoryDebug: data.memoryDebug,
              };
              break;
            case 'memory_update':
              memoryUpdate = (data.results || []).map((r: Record<string, unknown>) => ({
                characterName: r.characterName,
                surpriseAction: r.surpriseAction,
                surpriseScore: r.surpriseScore,
                adjustedImportance: r.adjustedImportance,
                newFactsCount: r.newFactsCount,
              }));
              break;
            case 'session_update':
              sessionUpdate = {
                presentCharacters: data.session?.presentCharacters,
                intimacy: data.session?.intimacy,
                turnCount: data.session?.turnCount,
                currentLocation: data.session?.currentLocation,
              };
              break;
            case 'error':
              console.error(`  ❌ SSE 에러: ${data.error}`);
              break;
          }
        } catch {
          // JSON 파싱 실패 무시
        }
        currentEvent = '';
      }
    }
  }

  return { aiResponses, metadata, memoryUpdate, sessionUpdate };
}

// ============================================================
// API 호출
// ============================================================

async function fetchWithAuth(config: Config, path: string, options: RequestInit = {}) {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Cookie: config.cookie,
    ...(options.headers as Record<string, string> || {}),
  };
  return fetch(url, { ...options, headers });
}

async function listWorks(config: Config): Promise<Array<{ id: string; title: string; characters: Array<{ id: string; name: string }> }>> {
  const res = await fetchWithAuth(config, '/api/works?public=true');
  if (!res.ok) {
    throw new Error(`작품 목록 조회 실패: ${res.status} ${await res.text()}`);
  }
  const works: any = await res.json();
  return (Array.isArray(works) ? works : works.works || []).map((w: Record<string, unknown>) => ({
    id: w.id as string,
    title: w.title as string,
    characters: ((w.characters as Array<Record<string, unknown>>) || []).map(c => ({
      id: c.id as string,
      name: c.name as string,
    })),
  }));
}

async function createSession(
  config: Config,
  workId: string,
): Promise<{ sessionId: string; opening: string; characters: Array<{ id: string; name: string }> }> {
  const res = await fetchWithAuth(config, '/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      workId,
      userName: '테스트유저',
      keepMemory: config.keepMemory,
    }),
  });

  if (!res.ok) {
    throw new Error(`세션 생성 실패: ${res.status} ${await res.text()}`);
  }

  const data: any = await res.json();
  return {
    sessionId: data.session.id,
    opening: data.opening,
    characters: data.characters.map((c: Record<string, unknown>) => ({
      id: c.id as string,
      name: c.name as string,
    })),
  };
}

async function sendMessage(
  config: Config,
  sessionId: string,
  content: string,
): Promise<{
  aiResponses: TurnResult['aiResponses'];
  metadata: TurnResult['metadata'];
  memoryUpdate: TurnResult['memoryUpdate'];
  sessionUpdate: TurnResult['sessionUpdate'];
}> {
  const res = await fetchWithAuth(config, '/api/chat', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, content }),
  });

  if (!res.ok) {
    throw new Error(`메시지 전송 실패: ${res.status} ${await res.text()}`);
  }

  return parseSSEStream(res);
}

// ============================================================
// 리포트 생성
// ============================================================

function generateReport(
  workTitle: string,
  characters: Array<{ id: string; name: string }>,
  results: TurnResult[],
  config: Config,
): string {
  const lines: string[] = [];
  const hr = '═'.repeat(70);
  const hr2 = '─'.repeat(70);

  lines.push(hr);
  lines.push(`  메모리 시스템 시뮬레이션 테스트 리포트`);
  lines.push(hr);
  lines.push(`작품: ${workTitle}`);
  lines.push(`캐릭터: ${characters.map(c => c.name).join(', ')}`);
  lines.push(`시나리오: ${config.scenario}`);
  lines.push(`기억 유지: ${config.keepMemory ? 'ON' : 'OFF (리셋)'}`);
  lines.push(`총 턴: ${results.length}`);
  lines.push(`실행 시각: ${new Date().toISOString()}`);
  lines.push('');

  // ─── 턴별 상세 ───
  lines.push(hr);
  lines.push('  턴별 상세 결과');
  lines.push(hr);

  for (const r of results) {
    lines.push('');
    lines.push(hr2);
    lines.push(`  Turn ${r.turn}`);
    lines.push(hr2);
    lines.push(`유저: "${r.userMessage}"`);
    lines.push('');

    // AI 응답
    for (const resp of r.aiResponses) {
      if (resp.type === 'narrator') {
        lines.push(`  [나레이션] ${resp.content.substring(0, 150)}...`);
      } else {
        lines.push(`  [${resp.characterName}] ${resp.content.substring(0, 150)}...`);
      }
    }
    lines.push('');

    // 메타데이터
    if (r.metadata.totalMs) {
      lines.push(`  ⏱ 응답시간: ${r.metadata.totalMs}ms`);
    }
    if (r.metadata.emotions && r.metadata.emotions.length > 0) {
      lines.push(`  💭 감정: ${r.metadata.emotions.join(', ')}`);
    }
    if (r.metadata.extractedFactsCount !== undefined) {
      lines.push(`  📝 추출된 사실: ${r.metadata.extractedFactsCount}개`);
    }

    // 메모리 디버그
    if (r.metadata.memoryDebug && r.metadata.memoryDebug.length > 0) {
      lines.push('');
      lines.push('  🧠 메모리 상태:');
      for (const md of r.metadata.memoryDebug) {
        lines.push(`    ${md.characterName}:`);
        lines.push(`      관계: ${md.relationship.intimacyLevel} | 신뢰${md.relationship.trust} 호감${md.relationship.affection} 존경${md.relationship.respect} 라이벌${md.relationship.rivalry} 친밀${md.relationship.familiarity}`);
        lines.push(`      기억: ${md.recentMemoriesCount}개 | 알고있는 정보: ${md.knownFacts.length}개`);
        if (md.knownFacts.length > 0) {
          lines.push(`      정보 목록: ${md.knownFacts.slice(0, 10).join(' / ')}${md.knownFacts.length > 10 ? ` ... 외 ${md.knownFacts.length - 10}개` : ''}`);
        }
        if (md.recentMemories.length > 0) {
          lines.push(`      최근 기억:`);
          for (const mem of md.recentMemories.slice(0, 5)) {
            lines.push(`        - [중요도 ${mem.importance.toFixed(2)}] ${mem.interpretation}`);
          }
        }
        if (md.emotionalHistory.length > 0) {
          lines.push(`      감정 흐름: ${md.emotionalHistory.map(e => `${e.emotion}(${(e.intensity * 100).toFixed(0)}%)`).join(' → ')}`);
        }
      }
    }

    // 메모리 업데이트 (surprise)
    if (r.memoryUpdate.length > 0) {
      lines.push('');
      lines.push('  ✨ 이번 턴 메모리 업데이트:');
      for (const mu of r.memoryUpdate) {
        const actionIcon = mu.surpriseAction === 'save' ? '💾' : mu.surpriseAction === 'reinforce' ? '🔄' : '⏭️';
        lines.push(`    ${actionIcon} ${mu.characterName}: ${mu.surpriseAction} (surprise: ${mu.surpriseScore.toFixed(2)}, importance: ${mu.adjustedImportance.toFixed(2)}, 새 사실: ${mu.newFactsCount}개)`);
      }
    }

    // 세션 상태
    if (r.sessionUpdate.presentCharacters) {
      lines.push(`  👥 함께하는 캐릭터: ${r.sessionUpdate.presentCharacters.join(', ')}`);
    }

    // 검증 포인트
    if (r.checkpoints.length > 0) {
      lines.push('');
      lines.push(`  📋 검증 포인트: ${r.checkpoints.join(' | ')}`);
    }
    if (r.shouldRemember.length > 0) {
      lines.push(`  🔍 기억해야 할 것: ${r.shouldRemember.join(', ')}`);
      // AI 응답에서 기억 확인
      const allAiText = r.aiResponses.map(a => a.content).join(' ');
      const remembered = r.shouldRemember.filter(fact => {
        const keywords = fact.split(/[:\s,]+/).filter(w => w.length >= 2);
        return keywords.some(k => allAiText.includes(k));
      });
      const forgotten = r.shouldRemember.filter(fact => !remembered.includes(fact));
      if (remembered.length > 0) {
        lines.push(`  ✅ 기억함: ${remembered.join(', ')}`);
      }
      if (forgotten.length > 0) {
        lines.push(`  ❌ 기억 못함: ${forgotten.join(', ')}`);
      }
    }
  }

  // ─── 종합 분석 ───
  lines.push('');
  lines.push(hr);
  lines.push('  종합 분석');
  lines.push(hr);

  // 1. 기억 성장 추이
  lines.push('');
  lines.push('📈 기억 성장 추이:');
  lines.push('  턴 | 기억수 | 정보수 | 추출 | surprise');
  lines.push('  ---|--------|--------|------|----------');
  for (const r of results) {
    const firstDebug = r.metadata.memoryDebug?.[0];
    const firstUpdate = r.memoryUpdate[0];
    lines.push(
      `   ${String(r.turn).padStart(2)} |  ${String(firstDebug?.recentMemoriesCount ?? '-').padStart(4)} |  ${String(firstDebug?.knownFacts.length ?? '-').padStart(4)} |  ${String(r.metadata.extractedFactsCount ?? '-').padStart(3)} | ${firstUpdate ? `${firstUpdate.surpriseAction}(${firstUpdate.surpriseScore.toFixed(2)})` : '-'}`
    );
  }

  // 2. 관계 변화 추이
  lines.push('');
  lines.push('💕 관계 변화 추이:');
  const charNames = new Set<string>();
  for (const r of results) {
    r.metadata.memoryDebug?.forEach(md => charNames.add(md.characterName));
  }
  for (const charName of Array.from(charNames)) {
    lines.push(`  ${charName}:`);
    lines.push('    턴 | 단계       | 신뢰 | 호감 | 존경 | 라이벌 | 친밀');
    lines.push('    ---|-----------|------|------|------|--------|------');
    for (const r of results) {
      const md = r.metadata.memoryDebug?.find(d => d.characterName === charName);
      if (md) {
        const rel = md.relationship;
        lines.push(
          `     ${String(r.turn).padStart(2)} | ${rel.intimacyLevel.padEnd(9)} |  ${String(rel.trust).padStart(3)} |  ${String(rel.affection).padStart(3)} |  ${String(rel.respect).padStart(3)} |    ${String(rel.rivalry).padStart(3)} |  ${String(rel.familiarity).padStart(3)}`
        );
      }
    }
  }

  // 3. 감정 흐름
  lines.push('');
  lines.push('💭 감정 흐름:');
  for (const r of results) {
    if (r.metadata.emotions && r.metadata.emotions.length > 0) {
      lines.push(`  Turn ${r.turn}: ${r.metadata.emotions.join(' | ')}`);
    }
  }

  // 4. 기억 유지 스코어카드
  lines.push('');
  lines.push('📊 기억 유지 스코어카드:');
  let totalChecks = 0;
  let passedChecks = 0;
  for (const r of results) {
    if (r.shouldRemember.length > 0) {
      const allAiText = r.aiResponses.map(a => a.content).join(' ');
      for (const fact of r.shouldRemember) {
        totalChecks++;
        const keywords = fact.split(/[:\s,]+/).filter(w => w.length >= 2);
        if (keywords.some(k => allAiText.includes(k))) {
          passedChecks++;
        }
      }
    }
  }
  if (totalChecks > 0) {
    const score = ((passedChecks / totalChecks) * 100).toFixed(1);
    lines.push(`  기억 검증 통과율: ${passedChecks}/${totalChecks} (${score}%)`);
    if (parseFloat(score) >= 80) {
      lines.push('  결과: ✅ 기억 시스템 정상');
    } else if (parseFloat(score) >= 50) {
      lines.push('  결과: ⚠️ 기억 시스템 부분 동작');
    } else {
      lines.push('  결과: ❌ 기억 시스템 문제 있음');
    }
  } else {
    lines.push('  (기억 검증 항목 없음)');
  }

  // 5. surprise 분포
  lines.push('');
  lines.push('🎯 surprise 분포:');
  const surpriseActions: Record<string, number> = { save: 0, reinforce: 0, skip: 0 };
  const surpriseScores: number[] = [];
  for (const r of results) {
    for (const mu of r.memoryUpdate) {
      surpriseActions[mu.surpriseAction] = (surpriseActions[mu.surpriseAction] || 0) + 1;
      surpriseScores.push(mu.surpriseScore);
    }
  }
  lines.push(`  save: ${surpriseActions.save}회 | reinforce: ${surpriseActions.reinforce}회 | skip: ${surpriseActions.skip}회`);
  if (surpriseScores.length > 0) {
    const avg = surpriseScores.reduce((a, b) => a + b, 0) / surpriseScores.length;
    const min = Math.min(...surpriseScores);
    const max = Math.max(...surpriseScores);
    lines.push(`  surprise 점수: 평균 ${avg.toFixed(2)} | 최소 ${min.toFixed(2)} | 최대 ${max.toFixed(2)}`);
    if (max === min && surpriseScores.length > 3) {
      lines.push('  ⚠️ surprise 점수가 모두 동일 — 임베딩 또는 비교 로직 확인 필요');
    }
  }

  // 6. 성능
  lines.push('');
  lines.push('⏱ 성능:');
  const responseTimes = results.filter(r => r.metadata.totalMs).map(r => r.metadata.totalMs!);
  if (responseTimes.length > 0) {
    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const max = Math.max(...responseTimes);
    const min = Math.min(...responseTimes);
    lines.push(`  평균 응답시간: ${avg.toFixed(0)}ms | 최소: ${min}ms | 최대: ${max}ms`);
  }

  lines.push('');
  lines.push(hr);
  lines.push('  테스트 완료');
  lines.push(hr);

  return lines.join('\n');
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  const config = parseArgs();
  const scenario = SCENARIOS[config.scenario];

  if (!scenario) {
    console.error(`❌ 알 수 없는 시나리오: ${config.scenario}`);
    console.error(`   사용 가능: ${Object.keys(SCENARIOS).join(', ')}`);
    process.exit(1);
  }

  const messages = scenario.slice(0, config.turns);

  console.log('═'.repeat(70));
  console.log('  메모리 시스템 시뮬레이션 테스트');
  console.log('═'.repeat(70));
  console.log(`서버: ${config.baseUrl}`);
  console.log(`시나리오: ${config.scenario} (${messages.length}턴)`);
  console.log(`기억 유지: ${config.keepMemory ? 'ON' : 'OFF (리셋)'}`);
  console.log('');

  // 1. 작품 선택
  let workId = config.workId;
  let workTitle = '';
  let characters: Array<{ id: string; name: string }> = [];

  if (!workId) {
    console.log('📚 작품 목록 조회 중...');
    const works = await listWorks(config);
    if (works.length === 0) {
      console.error('❌ 사용 가능한 작품이 없습니다.');
      process.exit(1);
    }
    console.log('');
    for (let i = 0; i < works.length; i++) {
      console.log(`  [${i + 1}] ${works[i].title} (${works[i].characters.map(c => c.name).join(', ')})`);
    }
    // 첫 번째 작품 자동 선택
    workId = works[0].id;
    workTitle = works[0].title;
    characters = works[0].characters;
    console.log(`\n  → 자동 선택: ${workTitle}`);
  }

  // 2. 세션 생성
  console.log('\n🎬 채팅 세션 생성 중...');
  const session = await createSession(config, workId);
  characters = session.characters.length > 0 ? session.characters : characters;
  console.log(`  세션 ID: ${session.sessionId}`);
  console.log(`  캐릭터: ${characters.map(c => c.name).join(', ')}`);
  console.log(`  오프닝: ${session.opening.substring(0, 100)}...`);

  // 3. 턴별 메시지 전송
  const results: TurnResult[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const turnNum = i + 1;

    console.log(`\n${'─'.repeat(70)}`);
    console.log(`  Turn ${turnNum}/${messages.length}`);
    console.log(`${'─'.repeat(70)}`);
    console.log(`  유저: "${msg.content}"`);
    console.log(`  검증: ${msg.checkpoints.join(' | ')}`);

    try {
      const { aiResponses, metadata, memoryUpdate, sessionUpdate } = await sendMessage(
        config,
        session.sessionId,
        msg.content,
      );

      const result: TurnResult = {
        turn: turnNum,
        userMessage: msg.content,
        aiResponses,
        metadata,
        memoryUpdate,
        sessionUpdate,
        checkpoints: msg.checkpoints,
        newFacts: msg.newFacts,
        shouldRemember: msg.shouldRemember,
      };
      results.push(result);

      // 실시간 출력
      for (const resp of aiResponses) {
        if (resp.type === 'narrator') {
          console.log(`  [나레이션] ${resp.content.substring(0, 100)}...`);
        } else {
          console.log(`  [${resp.characterName}] ${resp.content.substring(0, 100)}...`);
        }
      }

      // 메모리 요약
      if (metadata.memoryDebug && metadata.memoryDebug.length > 0) {
        const firstDebug = metadata.memoryDebug[0];
        console.log(`  🧠 ${firstDebug.characterName}: ${firstDebug.relationship.intimacyLevel}(신뢰${firstDebug.relationship.trust}) | 기억 ${firstDebug.recentMemoriesCount}개 | 정보 ${firstDebug.knownFacts.length}개`);
      }
      if (metadata.extractedFactsCount !== undefined) {
        console.log(`  📝 추출: ${metadata.extractedFactsCount}개`);
      }
      if (memoryUpdate.length > 0) {
        for (const mu of memoryUpdate) {
          console.log(`  ✨ ${mu.characterName}: ${mu.surpriseAction}(surprise: ${mu.surpriseScore.toFixed(2)})`);
        }
      }

      // 기억 확인
      if (msg.shouldRemember.length > 0) {
        const allAiText = aiResponses.map(a => a.content).join(' ');
        for (const fact of msg.shouldRemember) {
          const keywords = fact.split(/[:\s,]+/).filter(w => w.length >= 2);
          const found = keywords.some(k => allAiText.includes(k));
          console.log(`  ${found ? '✅' : '❌'} 기억 확인: "${fact}" → ${found ? '언급됨' : '미언급'}`);
        }
      }

    } catch (error) {
      console.error(`  ❌ Turn ${turnNum} 실패: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        turn: turnNum,
        userMessage: msg.content,
        aiResponses: [],
        metadata: {},
        memoryUpdate: [],
        sessionUpdate: {},
        checkpoints: msg.checkpoints,
        newFacts: msg.newFacts,
        shouldRemember: msg.shouldRemember,
      });
    }

    // 레이트 리밋 대기
    if (i < messages.length - 1) {
      console.log(`  ⏳ ${config.delay}ms 대기...`);
      await new Promise(resolve => setTimeout(resolve, config.delay));
    }
  }

  // 4. 리포트 생성
  const report = generateReport(workTitle || workId!, characters, results, config);
  console.log('\n\n' + report);

  // 리포트 파일 저장
  const fs = await import('fs');
  const reportPath = `scripts/memory-test-report-${Date.now()}.txt`;
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📄 리포트 저장: ${reportPath}`);
}

main().catch(error => {
  console.error('❌ 테스트 실패:', error);
  process.exit(1);
});
