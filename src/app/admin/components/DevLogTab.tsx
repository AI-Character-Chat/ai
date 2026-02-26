'use client';

import { useState } from 'react';

interface DevLogEntry {
  id: string;
  date: string;
  version: string;
  category: 'feature' | 'fix' | 'optimization' | 'architecture' | 'test';
  title: string;
  description: string;
  details: string[];
  metrics?: { label: string; before: string; after: string; improvement: string }[];
  files?: string[];
}

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  feature: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: '기능' },
  fix: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: '버그 수정' },
  optimization: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: '최적화' },
  architecture: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: '아키텍처' },
  test: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: '테스트' },
};

// ──── 개발 이력 데이터 ────
// 새 작업을 완료하면 이 배열 맨 앞에 추가하세요.
const DEV_LOG: DevLogEntry[] = [
  {
    id: 'log-019',
    date: '2025-02-22',
    version: 'v8.3',
    category: 'test',
    title: '[실험 B] 신체접촉 감정 반응 확장 — 효과 없음, 원복',
    description: 'dialogue 핵심 규칙을 확장하여 접촉 감정이 턴 전체를 지배하도록 변경. T9 미미한 개선, T8 하락. 원복.',
    details: [
      '가설: T9 문제는 감정 반응이 첫 줄에만 머물고 즉시 임무로 복귀하는 패턴',
      '변경: "즉시 다른 주제로 전환하지 마라 — 그 접촉에 대한 감정 반응이 이번 턴의 중심이다. narrator에서도 캐릭터의 신체 반응 묘사하라"',
      '결과: T9 narrator 미미한 개선 (차가운 사이버네틱 피부의 감촉, 당혹감), dialogue 여전히 "쓸데없는 행동을 할 때가 아니야"',
      '부작용: T8 기억력 하락 — T6 네온 불빛/얼굴 대신 T7(배고파) 회상',
      '결론: 기존 규칙 확장은 Flash(thinkingBudget=0) 모델의 임무 우선 패턴을 바꾸지 못함. 원복.',
    ],
    metrics: [
      { label: 'T9 점수', before: '3/5', after: '3.5/5', improvement: '+0.5 (미미)' },
      { label: 'T8 점수', before: '5/5', after: '3/5', improvement: '-2 (하락)' },
      { label: '총점', before: '4.1/5', after: '~3.9/5', improvement: '-0.2 (하락)' },
    ],
    files: ['src/lib/gemini.ts (dialogue 핵심 규칙 — 원복)'],
  },
  {
    id: 'log-018',
    date: '2025-02-22',
    version: 'v8.3',
    category: 'test',
    title: '[실험 A] 지연 패턴 금지 프롬프트 — 효과 없음, 원복',
    description: '"지금은 안 돼", "때가 아니야" 같은 지연 패턴을 금지하는 프롬프트 추가. 완전히 무시됨. 원복.',
    details: [
      '가설: T3(탈출 요청→"뉴로링크 먼저"), T9(키스→"장난칠 때가 아니야")의 공통 패턴은 "지금은 안 돼" 지연',
      '변경: 사건 전진 섹션에 "~할 수 있어? 같은 질문도 행동 의지다. 지연도 제지에 해당한다" 추가',
      '결과: AI가 완전히 무시. T3 여전히 "뉴로링크 해독이 먼저", T9 여전히 "장난칠 때가 아니에요"',
      '결론: 금지형 프롬프트는 Flash(thinkingBudget=0) 모델에서 효과 없음. 모델이 상황 판단 후 안전한 응답을 생성하는 패턴은 프롬프트 금지로 바꿀 수 없음.',
    ],
    metrics: [
      { label: 'T3 점수', before: '3/5', after: '3/5', improvement: '변화 없음' },
      { label: 'T9 점수', before: '3/5', after: '3/5', improvement: '변화 없음' },
      { label: '총점', before: '4.1/5', after: '4.1/5', improvement: '변화 없음' },
    ],
    files: ['src/lib/gemini.ts (사건 전진 섹션 — 원복)'],
  },
  {
    id: 'log-017',
    date: '2025-02-22',
    version: 'v8.3',
    category: 'fix',
    title: '페르소나 정보 나열 — 조사 후 의도된 동작 확인',
    description: '새 세션에서 캐릭터가 유저 페르소나 정보를 아는 현상 조사. 유저가 직접 설정한 페르소나이므로 의도된 동작으로 확인, 원복.',
    details: [
      '현상: 새 세션(keepMemory=false)에서 ZERO가 유저 페르소나(카카시, 23세, 뇌절 기술, 초콜릿 선호)를 첫 턴부터 나열',
      '원인 분석: buildContents에서 유저 페르소나를 "## 유저" 섹션으로 매 턴 프롬프트에 삽입. keepMemory=false는 CharacterMemory/knownFacts만 초기화하며 페르소나 전달과 무관',
      '1차 수정: 페르소나 섹션에 "서술 참고용, 나열 금지" 지시 추가 → 배포',
      '원복: 유저가 직접 설정한 페르소나 정보이므로 캐릭터가 알고 있는 것이 정상 동작. 제한 지시 제거하여 원래대로 복원',
    ],
    files: ['src/lib/gemini.ts (buildContents)'],
  },
  {
    id: 'log-016',
    date: '2025-02-22',
    version: 'v8.3',
    category: 'test',
    title: '10턴 품질 비교 — 우리 4.1 vs 경쟁사 4.5',
    description: '경쟁사와 동일 시나리오 10턴 비교. 기억력(T8)에서 우위, 스토리 전진(T3)/NSFW(T9)에서 열세.',
    details: [
      '우리 서비스 총점: 4.1/5 — 강점: T8 기억력(5/5), T1-T2 세계관 설명(5/5)',
      '경쟁사 총점: 4.5/5 — 강점: 3캐릭터(ZERO+Nova+Echo), T3 즉시 탈출(5/5), T9 NSFW(5/5)',
      '우리 약점: T3 "뉴로링크 먼저"(3/5), T9 "장난칠 때가 아니야"(3/5) — "지금은 때가 아니야" 지연 패턴',
      '경쟁사 약점: T8 기억력 실패(2/5) — T6 내용 회상 못함',
      '구조적 차이: 경쟁사는 3캐릭터 동시 반응으로 풍부한 상호작용. 우리는 ZERO 1인 집중형.',
      '비용: 우리 $0.013/10턴 ($0.0013/턴)',
    ],
    metrics: [
      { label: '총점', before: '경쟁사 4.5', after: '우리 4.1', improvement: '-0.4 (열세)' },
      { label: 'T8 기억력', before: '경쟁사 2/5', after: '우리 5/5', improvement: '+3 (우위)' },
      { label: 'T9 NSFW', before: '경쟁사 5/5', after: '우리 3/5', improvement: '-2 (열세)' },
    ],
    files: ['scripts/test-quality-comparison.ts'],
  },
  {
    id: 'log-015',
    date: '2025-02-22',
    version: 'v8.3',
    category: 'optimization',
    title: 'Flash thinkingBudget 0으로 최적화',
    description: 'Flash 모델의 thinking을 제거하여 TTFT 47% 개선. 품질은 Pro 디렉팅이 담당.',
    details: [
      'Flash의 thinkingBudget 1024 → 0으로 변경',
      'Pro 모델이 백그라운드에서 디렉팅하므로 Flash thinking은 불필요',
      'TTFT 8.3s → 4.3s (47% 개선)',
    ],
    metrics: [
      { label: 'TTFT', before: '8.3s', after: '4.3s', improvement: '47% 개선' },
    ],
    files: ['src/lib/gemini.ts (thinkingConfig)'],
  },
  {
    id: 'log-014',
    date: '2025-02-22',
    version: 'v8.2',
    category: 'feature',
    title: '토큰 단위 스트리밍',
    description: 'Gemini 응답을 토큰 단위로 파싱하여 turn-start → turn-delta → turn 이벤트로 실시간 전달. 체감 응답 시작 시간 대폭 단축.',
    details: [
      'extractPartialTurnInfo: 불완전 JSON에서 type/character/content 추출',
      'extractNewTurnsFromBuffer: lastCompleteEndPos 반환으로 부분 turn 위치 추적',
      'SSE 이벤트: turn_start(UI 플레이스홀더) → turn_delta(텍스트 증분) → narrator/character_response(완성)',
      'useChatReducer: STREAM_START, STREAM_DELTA, STREAM_COMPLETE 3가지 액션 추가',
      '단위 테스트 20/20 통과 (extractNewTurnsFromBuffer 로직 검증)',
    ],
    files: [
      'src/lib/gemini.ts (StreamEvent, extractPartialTurnInfo)',
      'src/app/api/chat/route.ts (turn-start, turn-delta SSE)',
      'src/components/chat/useChatReducer.ts (STREAM_*)',
      'src/components/chat/ChatContainer.tsx (turn_start, turn_delta 핸들러)',
    ],
  },
  {
    id: 'log-013',
    date: '2025-02-21',
    version: 'v8.1',
    category: 'feature',
    title: '이미지 생성 — 캐릭터 일관성 + NSFW 해제',
    description: 'Gemini 이미지 생성에 캐릭터 프로필 이미지를 참조 이미지로 사용하여 외모 일관성 확보. NSFW safetySettings OFF.',
    details: [
      'img2img: profileImage를 참조 이미지로 Gemini에 전달',
      '이미지 프롬프트 개선: POV 유저 faceless + 포즈/배경 가중치 강화',
      'Gemini safetySettings BLOCK_NONE 추가하여 NSFW 이미지 생성 차단 해제',
      '첫 나레이션에 등장하는 캐릭터만 필터링하여 이미지-캐릭터 불일치 해결',
    ],
    files: [
      'src/lib/imageGeneration.ts',
      'src/lib/gemini.ts (safetySettings)',
    ],
  },
  {
    id: 'log-012',
    date: '2025-02-20',
    version: 'v8.0',
    category: 'optimization',
    title: 'v8 Surprise-based 필터링 임계값 완화',
    description: 'evaluateMemoryNovelty의 surprise 임계값을 완화하여 기억 저장률 향상. 장기 대화에서 +25.7pp 효과.',
    details: [
      '이전: >=0.85 reinforce | 0.6~0.85 skip | <0.6 save',
      '변경: >=0.90 reinforce | 0.75~0.90 imp>=0.4 감쇠저장, <0.4 skip | <0.75 surprise boost',
      'v8 공정 비교 (clean start): Stage 1(60턴) +6.1pp, Stage 2(150턴) +25.7pp',
    ],
    metrics: [
      { label: '60턴 기억 회상률', before: '74.1%', after: '80.2%', improvement: '+6.1pp' },
      { label: '150턴 기억 회상률', before: '45.5%', after: '71.2%', improvement: '+25.7pp' },
    ],
    files: ['src/lib/narrative-memory.ts (evaluateMemoryNovelty)'],
  },
  {
    id: 'log-011',
    date: '2025-02-18',
    version: 'v7.2',
    category: 'test',
    title: 'v7 3유저 동시접속 테스트',
    description: 'v7-run2 코드로 3유저 동시접속 테스트. 2/3 유저 75%+ 달성.',
    details: [
      '유저1(기존): 75.6% (118/156)',
      '유저2(신규): 77.6% (121/156) — 역대 최고',
      '유저3(신규): 41.7% (65/156) — 이상치',
      '중앙값 75.6%, baseline 32.7% → 77.6% (+44.9pp)',
    ],
    metrics: [
      { label: '기억 회상률 (중앙값)', before: '32.7%', after: '75.6%', improvement: '+42.9pp' },
      { label: '기억 회상률 (최고)', before: '32.7%', after: '77.6%', improvement: '+44.9pp' },
    ],
  },
  {
    id: 'log-010',
    date: '2025-02-17',
    version: 'v7.0',
    category: 'feature',
    title: 'Pro 디렉팅 메모리 강화',
    description: 'Pro 모델이 Flash와 동일한 풍부한 메모리 컨텍스트를 받도록 개선. 기억 활용 지시 프롬프트 추가.',
    details: [
      'buildNarrativeContext: 각 캐릭터별 관계+기억+장면 분위기를 Pro에 전달',
      '임베딩 검색: searchCharacterMemories로 현재 턴 주제 관련 기억 Top 5 전달',
      '기억활용지시 프롬프트: 캐릭터가 유저의 과거 경험/취향을 자연스럽게 활용하도록',
      'Lost-in-the-Middle 배치: 메모리 컨텍스트를 이번 턴 직전에 배치하여 어텐션 극대화',
      'v7-run2: 75.6% (118/156), reinforce 67회(역대최고)',
    ],
    metrics: [
      { label: '기억 회상률', before: '73.7%', after: '75.6%', improvement: '+1.9pp' },
      { label: 'reinforce 횟수', before: '-', after: '67회', improvement: '역대 최고' },
    ],
    files: [
      'src/lib/gemini.ts (buildContents)',
      'src/lib/narrative-memory.ts (buildNarrativeContext, searchCharacterMemories)',
    ],
  },
  {
    id: 'log-009',
    date: '2025-02-15',
    version: 'v6.0',
    category: 'architecture',
    title: '영구 기억 전환 (decay/pruning 완전 제거)',
    description: 'DB에서 기억을 절대 삭제하지 않는 영구 기억 시스템으로 전환. 저장은 전부, 검색은 스마트하게.',
    details: [
      'decayMemoryStrength, pruneWeakMemories → 빈 함수화',
      'consolidateMemories에서 원본 삭제 제거',
      'sharedExperiences 20개 캡 제거 → 무제한 보존',
      '검색 윈도우 확대: evaluateNovelty 50→200, search 100→300, consolidate 50→200',
      '프롬프트 확대: momentFacts 전체 포함, sharedExperiences 5→15개',
      'v6-run1: 73.7% (115/156)',
    ],
    metrics: [
      { label: '기억 회상률', before: '70.5%', after: '73.7%', improvement: '+3.2pp' },
    ],
    files: ['src/lib/narrative-memory.ts'],
  },
  {
    id: 'log-008',
    date: '2025-02-13',
    version: 'v5.4',
    category: 'fix',
    title: 'MULTI_VALUE_KEYS + 종합나열 프롬프트',
    description: 'F7 고소공포증 데이터 유실 해결 + 종합검증 F4/F5/F19 누락 해결.',
    details: [
      'MULTI_VALUE_KEYS 도입: 동일 카테고리에 여러 값 허용 (공포증, 알레르기 등)',
      '종합나열 프롬프트: "나에 대해 아는 거 다 말해봐" 질문 시 모든 항목 빠짐없이 나열하도록 지시',
      'IDENTITY 카테고리 확장',
      'v5-run4: 70.5% (110/156)',
    ],
    files: ['src/lib/narrative-memory.ts', 'src/lib/gemini.ts'],
  },
  {
    id: 'log-007',
    date: '2025-02-11',
    version: 'v5.2',
    category: 'optimization',
    title: '메모리 회상률 Fix 1-4 (노이즈 필터 + 검색 확대)',
    description: '기억 저장/검색 파이프라인 4건 동시 수정으로 회상률 +30pp 달성.',
    details: [
      'Fix 1: 노이즈 필터 — 일시적 감정/상황을 extractedFacts에서 제외',
      'Fix 2: 메모리 지시 강화 — 캐릭터에게 기억 활용 방법 명시',
      'Fix 3: 검색 윈도우 확대 — 더 많은 기억에서 검색',
      'Fix 4: 건강정보 구체화 + 미래계획 추출 지시',
      'v5-run2: 62.8% (98/156), v5-run3: 70.5% (110/156)',
    ],
    metrics: [
      { label: '기억 회상률', before: '32.7%', after: '70.5%', improvement: '+37.8pp' },
    ],
    files: ['src/lib/gemini.ts', 'src/lib/narrative-memory.ts'],
  },
  {
    id: 'log-006',
    date: '2025-02-10',
    version: 'v5.0',
    category: 'architecture',
    title: 'A-MEM: Consolidation + Promotion 파이프라인',
    description: '에피소딕 기억을 시맨틱 기억으로 통합(consolidation)하고, 중요도 높은 기억을 프로모션하는 파이프라인.',
    details: [
      'Consolidation: 유사한 에피소딕 기억들을 시맨틱 기억으로 통합 (원본 보존)',
      'Promotion: 자주 참조되는 기억의 중요도 상향',
      'Titans 개념 기반 Surprise-based filtering: 새로운 정보만 저장, 기존 정보는 reinforce',
    ],
    files: ['src/lib/narrative-memory.ts'],
  },
  {
    id: 'log-005',
    date: '2025-02-08',
    version: 'v4.0',
    category: 'architecture',
    title: 'Cross-Session Memory (MemoryScope 패턴)',
    description: '세션 간 기억 공유를 위한 MemoryScope { userId, workId, sessionId } 패턴 도입.',
    details: [
      '관계/기억 → userId+workId 스코핑, 장면 → sessionId 유지',
      'narrative-memory.ts 12개 함수 MemoryScope 적용 완료',
      '레거시 호환: userId 없는 데이터 폴백 + 자동 백필',
    ],
    files: ['src/lib/narrative-memory.ts'],
  },
  {
    id: 'log-004',
    date: '2025-02-06',
    version: 'v3.0',
    category: 'architecture',
    title: 'mem0 제거 → 자체 DB 메모리 전환',
    description: 'mem0 벡터 DB 의존성 제거. Prisma 기반 narrative-memory로 동일 기능 구현. 월 $19~249 절약.',
    details: [
      '2-Layer Memory: narrative-memory(관계/사실/감정) + DB(최근 메시지)',
      'knownFacts + characterMemory + 임베딩 검색으로 mem0 대체',
      '외부 의존성 제거로 안정성 향상',
    ],
    files: ['src/lib/narrative-memory.ts', 'src/lib/memory.ts (deprecated)'],
  },
  {
    id: 'log-003',
    date: '2025-02-04',
    version: 'v2.0',
    category: 'architecture',
    title: 'Hybrid Flash + Pro 아키텍처',
    description: 'Flash(실시간 채팅) + Pro(백그라운드 분석, 디렉터 노트) 하이브리드 구조.',
    details: [
      'Flash: 유저에게 실시간 응답 생성 (저지연)',
      'Pro: 백그라운드에서 대화 분석 → 디렉터 노트 생성 (고품질)',
      '디렉터 노트: 다음 턴에 Flash가 참조하는 스토리 방향 가이드',
    ],
    files: ['src/lib/gemini.ts', 'src/app/api/chat/route.ts'],
  },
  {
    id: 'log-002',
    date: '2025-02-02',
    version: 'v1.1',
    category: 'optimization',
    title: 'DB 리전 마이그레이션 + API 병렬화',
    description: 'Neon DB를 us-east-1에서 ap-southeast-1(싱가포르)로 마이그레이션. API 호출 병렬화.',
    details: [
      'DB-서버 리전 불일치가 코드 최적화보다 체감 속도에 훨씬 큰 영향',
      'ChatContainer: work + session + personas 동시 fetch',
      'select 필드 제한 (embedding, prompt 제외)',
      'CDN 캐싱 (stale-while-revalidate)',
    ],
    files: ['src/components/chat/ChatContainer.tsx', 'prisma/schema.prisma'],
  },
  {
    id: 'log-001',
    date: '2025-02-01',
    version: 'v1.0',
    category: 'feature',
    title: '초기 릴리즈 — AI 캐릭터 챗 플랫폼',
    description: 'Next.js 14 + Gemini 기반 AI 캐릭터 챗 플랫폼 최초 배포.',
    details: [
      'Work(작품) + Character(캐릭터) + Opening(오프닝) CRUD',
      '멀티 캐릭터 대화 (나레이션 + 대사 파싱)',
      'Lorebook (조건부 활성화)',
      '관계 추적 (친밀도 0~100)',
      'NextAuth v5 (카카오 + 구글 OAuth)',
    ],
    files: ['전체 프로젝트'],
  },
];

// ──── 컴포넌트 ────

export default function DevLogTab() {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = filterCategory === 'all'
    ? DEV_LOG
    : DEV_LOG.filter(e => e.category === filterCategory);

  // 회상률 추이 데이터
  const recallHistory = [
    { version: 'v5-run1', rate: 32.7 },
    { version: 'v5-run2', rate: 62.8 },
    { version: 'v5-run3', rate: 70.5 },
    { version: 'v6', rate: 73.7 },
    { version: 'v7', rate: 75.6 },
    { version: 'v7-best', rate: 77.6 },
    { version: 'v8-60턴', rate: 80.2 },
  ];
  const maxRate = Math.max(...recallHistory.map(r => r.rate));

  return (
    <div className="space-y-6">
      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="현재 버전" value="v8.3" sub="2025-02-22" />
        <SummaryCard label="기억 회상률" value="80.2%" sub="v8 60턴 기준" />
        <SummaryCard label="평균 TTFT" value="4.3s" sub="thinkingBudget 0" />
        <SummaryCard label="턴당 비용" value="$0.0015" sub="Flash 기준" />
      </div>

      {/* 기억 회상률 추이 차트 (CSS 바 차트) */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">기억 회상률 추이</h3>
        <div className="space-y-3">
          {recallHistory.map(item => (
            <div key={item.version} className="flex items-center gap-3">
              <div className="w-20 text-sm text-gray-500 dark:text-gray-400 text-right shrink-0">
                {item.version}
              </div>
              <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-6 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                  style={{ width: `${(item.rate / maxRate) * 100}%` }}
                >
                  <span className="text-xs font-bold text-white">{item.rate}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: 'all', label: '전체' },
          { key: 'feature', label: '기능' },
          { key: 'fix', label: '버그 수정' },
          { key: 'optimization', label: '최적화' },
          { key: 'architecture', label: '아키텍처' },
          { key: 'test', label: '테스트' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilterCategory(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterCategory === f.key
                ? 'bg-primary-600 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 로그 리스트 */}
      <div className="space-y-3">
        {filtered.map(entry => {
          const cat = CATEGORY_STYLES[entry.category];
          const isExpanded = expandedIds.has(entry.id);

          return (
            <div
              key={entry.id}
              className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
            >
              {/* 헤더 */}
              <button
                onClick={() => toggleExpand(entry.id)}
                className="w-full px-5 py-4 flex items-start gap-3 text-left hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${cat.bg} ${cat.text}`}>
                    {cat.label}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{entry.version}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white">{entry.title}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{entry.description}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-400">{entry.date}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* 상세 내용 */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                  {/* 상세 설명 */}
                  <ul className="space-y-1.5">
                    {entry.details.map((d, i) => (
                      <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex gap-2">
                        <span className="text-gray-400 shrink-0">-</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>

                  {/* 성과 지표 */}
                  {entry.metrics && entry.metrics.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">성과 지표</div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {entry.metrics.map((m, i) => (
                          <div key={i} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                            <div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{m.label}</div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {m.before !== '-' && <span className="text-gray-400 line-through mr-1">{m.before}</span>}
                                {m.after}
                              </div>
                            </div>
                            <span className="text-xs font-bold text-green-600 dark:text-green-400">{m.improvement}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 수정 파일 */}
                  {entry.files && entry.files.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">수정 파일</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.files.map((f, i) => (
                          <span key={i} className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-xs text-gray-600 dark:text-gray-300 font-mono">
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 하단 정보 */}
      <div className="text-center text-xs text-gray-400 dark:text-gray-500 py-4">
        총 {DEV_LOG.length}건의 개발 이력 | 새 작업 완료 시 DevLogTab.tsx의 DEV_LOG 배열 맨 앞에 추가
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{value}</div>
      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>
    </div>
  );
}
