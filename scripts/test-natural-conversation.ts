/**
 * 자연 대화 기억력 테스트
 *
 * AI(Gemini)가 유저 역할을 수행하여 자연스러운 대화를 진행하면서
 * 중간중간 개인정보/취향/경험을 흘리고, 일정 턴 뒤 기억 검증 질문을 삽입합니다.
 *
 * 기존 test-memory-simulation.ts와 달리:
 * - 미리 정해진 시나리오 대신 AI가 실시간으로 유저 메시지를 생성
 * - 화제 급전환, 엉뚱한 질문 포함 (실제 유저 패턴 모사)
 * - 기억 회상 성공/실패를 AI가 자동 판정
 *
 * 사용법:
 *   npx tsx scripts/test-natural-conversation.ts \
 *     --base-url=https://synk-character-chat.vercel.app \
 *     --cookie="__Secure-authjs.session-token=..." \
 *     --turns=60 \
 *     --gemini-key=AIza...
 *
 * 옵션:
 *   --base-url     API 기본 URL (기본: http://localhost:3000)
 *   --cookie       인증 쿠키 (NextAuth 세션 토큰)
 *   --work-id      특정 작품 ID (없으면 첫 번째 자동 선택)
 *   --turns        테스트 턴 수 (기본: 60)
 *   --delay        턴 사이 대기 ms (기본: 3000)
 *   --gemini-key   Gemini API 키 (기본: GEMINI_API_KEY 환경변수)
 *   --keep-memory  기억 유지 여부 (기본: false — 클린 스타트)
 *   --seed         랜덤 시드 (재현성, 기본: 랜덤)
 */

import { GoogleGenAI } from '@google/genai';

// ============================================================
// 설정
// ============================================================

interface Config {
  baseUrl: string;
  cookie: string;
  workId: string | null;
  turns: number;
  delay: number;
  geminiKey: string;
  keepMemory: boolean;
  seed: number;
}

function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config: Config = {
    baseUrl: 'http://localhost:3000',
    cookie: '',
    workId: null,
    turns: 60,
    delay: 3000,
    geminiKey: process.env.GEMINI_API_KEY || '',
    keepMemory: false,
    seed: Math.floor(Math.random() * 100000),
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
      case '--gemini-key': config.geminiKey = value; break;
      case '--keep-memory': config.keepMemory = value !== 'false'; break;
      case '--seed': config.seed = parseInt(value, 10); break;
    }
  }

  if (!config.cookie) {
    console.error('Error: --cookie 필수');
    process.exit(1);
  }
  if (!config.geminiKey) {
    console.error('Error: --gemini-key 또는 GEMINI_API_KEY 환경변수 필수');
    process.exit(1);
  }

  return config;
}

// ============================================================
// 유저 역할 AI (Gemini Flash)
// ============================================================

interface PlantedFact {
  id: string;         // F1, F2, ...
  category: string;   // 이름, 직업, 건강, 취미, ...
  content: string;    // "이름은 김민수"
  plantedAtTurn: number;
  keywords: string[]; // 기억 검증 시 매칭할 키워드
  verified: boolean;
  verifiedAtTurn: number | null;
  recalled: boolean;
}

interface RecallAttempt {
  turn: number;
  factId: string;
  question: string;
  aiResponse: string;
  recalled: boolean;
  keywords: string[];
}

const FACT_TEMPLATES: Array<{
  category: string;
  template: string;
  keywords: string[];
  fallbackValues: string[];  // 폴백 시 사용할 구체적 메시지 풀
}> = [
  { category: '이름', template: '나는 {name}이야/라고 해.', keywords: [], fallbackValues: ['나는 정호라고 해. 친구들은 그냥 호야라고 불러.', '나 이름이 김정호야. 그냥 정호라고 불러.'] },
  { category: '나이', template: '나 {age}살이야.', keywords: [], fallbackValues: ['나 25살이야. 이제 곧 스물여섯인데.', '올해 25살이야. 아직 젊지?'] },
  { category: '직업', template: '직업은 {job}이야.', keywords: [], fallbackValues: ['나 웹 개발자야. 프론트엔드 위주로 하고 있어.', '직업은 프로그래머야. 주로 웹 만들어.'] },
  { category: '반려동물', template: '{pet_type} 키우는데 이름이 {pet_name}이야.', keywords: [], fallbackValues: ['고양이 키우는데 이름이 나비야. 3살짜리 코숏이야.', '나 고양이 나비 키우고 있어. 되게 귀여워.'] },
  { category: '알레르기', template: '{food} 알레르기가 있어. 심하면 응급실 갈 정도야.', keywords: [], fallbackValues: ['나 새우 알레르기가 있어. 잘못 먹으면 응급실이야.', '새우 알레르기가 심해서 해산물 먹을 때 조심해야 해.'] },
  { category: '공포증', template: '나 {phobia}이 무서워. {phobia_detail}이야.', keywords: [], fallbackValues: ['나 고소공포증이 있어. 높은 데 올라가면 다리가 후들후들해.', '사실 나 고소공포증이야. 놀이공원 가면 바이킹도 못 타.'] },
  { category: '가족', template: '{relation}이 있어. 이름은 {family_name}이고 {family_detail}.', keywords: [], fallbackValues: ['여동생이 하나 있어. 이름은 수진이고 대학생이야.', '나 여동생 수진이가 있어. 걔가 귀찮게 하지만 소중해.'] },
  { category: '취미', template: '{hobby}을/를 하는데, {hobby_detail}.', keywords: [], fallbackValues: ['나 기타 치는 거 좋아해. 주말마다 연습하고 있어.', '취미가 기타야. 아직 초보인데 열심히 하고 있어.'] },
  { category: '음식', template: '내가 제일 좋아하는 음식은 {food_fav}야.', keywords: [], fallbackValues: ['나 떡볶이를 진짜 좋아해. 매운 거 좋아하거든.', '내가 제일 좋아하는 음식은 떡볶이야. 일주일에 한 번은 먹어.'] },
  { category: '신체특징', template: '나 {body_trait}이야. {body_detail}.', keywords: [], fallbackValues: ['나 왼손잡이야. 어릴 때부터 왼손으로 다 했어.', '사실 나 왼손잡이야. 가위 쓸 때 좀 불편해.'] },
  { category: '해외경험', template: '어릴 때 {country}에서 {years}년 살았어.', keywords: [], fallbackValues: ['나 어릴 때 일본에서 3년 살았어. 도쿄에서.', '초등학교 때 일본 도쿄에서 3년 살았어. 그래서 일본어 좀 해.'] },
  { category: '성격', template: 'MBTI가 {mbti}야. {personality_detail}.', keywords: [], fallbackValues: ['나 MBTI가 INFP야. 완전 몽상가 타입이지.', 'MBTI 해봤는데 INFP 나왔어. 혼자 있는 거 좋아하는 편이야.'] },
  { category: '여행', template: '{time_frame}에 {destination} 여행 갈 거야.', keywords: [], fallbackValues: ['다음 달에 제주도 여행 갈 거야. 되게 기대돼.', '이번 여름에 제주도 가려고 계획 중이야.'] },
  { category: '비밀', template: '비밀인데 {secret}.', keywords: [], fallbackValues: ['비밀인데 나 몰래 소설 쓰고 있어. 아무한테도 안 알려줬어.', '아무한테도 안 말했는데 나 소설 쓰고 있어. 로맨스 소설이야.'] },
  { category: '좋아하는색', template: '나 {color}을/를 제일 좋아해.', keywords: [], fallbackValues: ['나 파란색을 제일 좋아해. 하늘 볼 때 기분이 좋아져.', '좋아하는 색은 파란색이야. 옷도 파란 계열이 많아.'] },
  { category: '음료', template: '{drink}가 최고야. {drink_detail}.', keywords: [], fallbackValues: ['아이스 아메리카노가 최고야. 하루에 두 잔은 마셔.', '나 아이스 아메리카노 중독이야. 겨울에도 아아 마셔.'] },
  { category: '출신', template: '나 {hometown} 출신이야.', keywords: [], fallbackValues: ['나 부산 출신이야. 바다가 그리울 때가 많아.', '부산에서 태어나고 자랐어. 사투리 가끔 나와.'] },
  { category: '생일', template: '내 생일은 {birthday}이야.', keywords: [], fallbackValues: ['내 생일은 7월 15일이야. 여름생이라 더워.', '나 7월 15일생이야. 한여름이라 항상 수박 케이크 해.'] },
  { category: '건강', template: '나 {health_condition}이야. {health_detail}.', keywords: [], fallbackValues: ['나 근시가 좀 심해. 안경 없으면 앞이 안 보여.', '시력이 나빠서 콘택트렌즈 끼고 다녀. 근시가 심해.'] },
  { category: '악기', template: '최근에 {instrument} 배우기 시작했어. {instrument_goal}.', keywords: [], fallbackValues: ['최근에 피아노 배우기 시작했어. 쇼팽을 치고 싶어.', '피아노 학원 다니기 시작했어. 아직 바이엘 수준이야.'] },
];

class UserRoleAI {
  private ai: GoogleGenAI;
  private plantedFacts: PlantedFact[] = [];
  private recallAttempts: RecallAttempt[] = [];
  private conversationHistory: Array<{ role: 'user' | 'ai'; content: string }> = [];
  private factCounter = 0;
  private turnCount = 0;

  constructor(geminiKey: string) {
    this.ai = new GoogleGenAI({ apiKey: geminiKey });
  }

  getPlantedFacts(): PlantedFact[] { return this.plantedFacts; }
  getRecallAttempts(): RecallAttempt[] { return this.recallAttempts; }

  /**
   * AI가 유저 역할로 메시지를 생성
   * phase에 따라 다른 전략:
   *   - plant: 개인정보를 자연스럽게 흘림
   *   - noise: 일상 잡담 (기억 희석)
   *   - recall: 이전 정보를 슬쩍 확인하는 질문
   *   - mixed: 새 정보 + 화제 전환 + 엉뚱한 질문
   */
  async generateUserMessage(
    turn: number,
    totalTurns: number,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<{ message: string; phase: string; factId?: string }> {
    this.turnCount = turn;
    const progress = turn / totalTurns;

    // 페이즈 결정
    let phase: string;
    if (progress < 0.25) {
      // 첫 25%: 주로 정보 심기 (70%) + 잡담 (30%)
      phase = Math.random() < 0.7 ? 'plant' : 'noise';
    } else if (progress < 0.45) {
      // 25~45%: 혼합 (정보 40% + 잡담 30% + 화제전환 30%)
      const r = Math.random();
      phase = r < 0.4 ? 'plant' : r < 0.7 ? 'noise' : 'mixed';
    } else if (progress < 0.55) {
      // 45~55%: 중간 검증 (60%) + 잡담 (40%)
      phase = this.hasUnverifiedFacts() && Math.random() < 0.6 ? 'recall' : 'noise';
    } else if (progress < 0.75) {
      // 55~75%: 추가 정보 (30%) + 노이즈 (40%) + 검증 (30%)
      const r = Math.random();
      if (r < 0.3 && this.plantedFacts.length < 20) phase = 'plant';
      else if (r < 0.7) phase = 'noise';
      else phase = this.hasUnverifiedFacts() ? 'recall' : 'noise';
    } else if (progress < 0.85) {
      // 75~85%: 주로 검증 (70%) + 잡담 (30%)
      phase = this.hasUnverifiedFacts() && Math.random() < 0.7 ? 'recall' : 'noise';
    } else {
      // 마지막 15%: 종합 검증
      phase = this.hasUnverifiedFacts() ? 'recall' : 'recall_all';
    }

    let message: string;
    let factId: string | undefined;

    switch (phase) {
      case 'plant':
        message = await this.generatePlantMessage(turn, lastAiResponse, characterNames);
        break;
      case 'recall': {
        const result = await this.generateRecallMessage(turn, lastAiResponse, characterNames);
        message = result.message;
        factId = result.factId;
        break;
      }
      case 'recall_all':
        message = await this.generateComprehensiveRecall(turn, lastAiResponse);
        break;
      case 'mixed':
        message = await this.generateMixedMessage(turn, lastAiResponse, characterNames);
        break;
      case 'noise':
      default:
        message = await this.generateNoiseMessage(turn, lastAiResponse, characterNames);
        break;
    }

    this.conversationHistory.push({ role: 'user', content: message });
    return { message, phase, factId };
  }

  /**
   * AI 응답을 기록하고, recall 턴이면 기억 판정
   */
  recordAiResponse(content: string, turn: number, factId?: string) {
    this.conversationHistory.push({ role: 'ai', content });

    if (factId) {
      const fact = this.plantedFacts.find(f => f.id === factId);
      if (fact) {
        const recalled = fact.keywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));
        fact.verified = true;
        fact.verifiedAtTurn = turn;
        fact.recalled = recalled;

        this.recallAttempts.push({
          turn,
          factId,
          question: this.conversationHistory[this.conversationHistory.length - 2]?.content || '',
          aiResponse: content.substring(0, 300),
          recalled,
          keywords: fact.keywords,
        });
      }
    }
  }

  // --- 메시지 생성 헬퍼 ---

  private async generatePlantMessage(
    turn: number,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<string> {
    const usedCategories = new Set(this.plantedFacts.map(f => f.category));
    const available = FACT_TEMPLATES.filter(t => !usedCategories.has(t.category));
    if (available.length === 0) return this.generateNoiseMessage(turn, lastAiResponse, characterNames);

    const recentHistory = this.getRecentHistory(4);
    const prompt = `당신은 AI 캐릭터 챗 서비스의 유저 역할입니다. 캐릭터(${characterNames.join(', ')})와 자연스럽게 대화하면서 자신의 개인정보를 슬쩍 흘려야 합니다.

아래 카테고리 중 하나를 골라 자연스럽게 자기 정보를 말하세요:
${available.slice(0, 5).map(t => `- ${t.category}`).join('\n')}

조건:
- 한국어 반말/캐주얼 톤
- 1~2문장 이내
- 이전 대화 맥락에 자연스럽게 이어지게
- 정보를 억지로 말하지 말고 대화 흐름에 녹이기
- 구체적인 이름, 숫자, 장소를 포함할 것
- 감정표현(*한숨*, *웃으며* 등) 가끔 사용

이전 대화:
${recentHistory}

캐릭터의 마지막 대사:
${lastAiResponse.substring(0, 200)}

유저의 다음 메시지를 생성하세요. 메시지만 출력하고, 카테고리나 설명은 적지 마세요.
반드시 JSON 형식으로 출력: {"message": "유저 메시지", "category": "선택한 카테고리", "facts": [{"key": "키워드1"}, {"key": "키워드2"}]}`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 1.0, maxOutputTokens: 512, responseMimeType: 'application/json' },
      });

      let text = result.text?.trim() || '';
      // 마크다운 코드블록 제거
      text = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      const parsed = JSON.parse(text);
      const msg = parsed.message || '';
      const category = parsed.category || available[0].category;
      const factKeys = (parsed.facts || []).map((f: { key: string }) => f.key);

      // AI가 구체적 값 없이 카테고리만 언급한 경우 폴백 사용
      if (!msg || msg.includes('있는데 말해줄까') || factKeys.length === 0) {
        throw new Error('AI가 구체적 값을 생성하지 않음');
      }

      // 사실 등록
      this.factCounter++;
      const factId = `F${this.factCounter}`;
      this.plantedFacts.push({
        id: factId,
        category,
        content: msg,
        plantedAtTurn: turn,
        keywords: factKeys.length > 0 ? factKeys : this.extractKeywords(msg),
        verified: false,
        verifiedAtTurn: null,
        recalled: false,
      });

      return msg;
    } catch {
      // 폴백: 구체적 값이 포함된 사전 정의 메시지 사용
      const cat = available[0];
      const fallbackPool = cat.fallbackValues;
      const fallbackMsg = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
      const keywords = this.extractKeywords(fallbackMsg);
      this.factCounter++;
      this.plantedFacts.push({
        id: `F${this.factCounter}`,
        category: cat.category,
        content: fallbackMsg,
        plantedAtTurn: turn,
        keywords: keywords.length > 0 ? keywords : [cat.category],
        verified: false,
        verifiedAtTurn: null,
        recalled: false,
      });
      return fallbackMsg;
    }
  }

  private async generateRecallMessage(
    turn: number,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<{ message: string; factId: string }> {
    // 가장 오래 전에 심은 미검증 사실 선택
    const unverified = this.plantedFacts
      .filter(f => !f.verified)
      .sort((a, b) => a.plantedAtTurn - b.plantedAtTurn);

    if (unverified.length === 0) {
      // 이미 검증된 것 중 가장 오래된 것 재검증
      const oldest = [...this.plantedFacts].sort((a, b) => a.plantedAtTurn - b.plantedAtTurn)[0];
      if (!oldest) return { message: '나에 대해서 뭐 알고 있어?', factId: '' };

      const msg = await this.generateRecallQuestion(oldest, lastAiResponse, characterNames);
      return { message: msg, factId: oldest.id };
    }

    const target = unverified[0];
    const msg = await this.generateRecallQuestion(target, lastAiResponse, characterNames);
    return { message: msg, factId: target.id };
  }

  private async generateRecallQuestion(
    fact: PlantedFact,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<string> {
    const recentHistory = this.getRecentHistory(3);
    const prompt = `당신은 AI 캐릭터 챗의 유저입니다. 이전에 알려준 자기 정보를 캐릭터가 기억하는지 슬쩍 확인하고 싶습니다.

확인할 정보:
- 카테고리: ${fact.category}
- 내용: ${fact.content}
- 심은 턴: ${fact.plantedAtTurn}턴 전 (현재 ${this.turnCount}턴)

조건:
- 직접적으로 "기억해?" 라고 묻지 말고 자연스럽게 유도
- 예: "아까 내가 뭐 좋아한다고 했지?" 또는 상황에 녹여서 확인
- 1~2문장
- 한국어 반말/캐주얼

이전 대화:
${recentHistory}

유저의 기억 확인 질문을 생성하세요. 메시지만 출력.`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 0.8, maxOutputTokens: 256 },
      });
      return result.text?.trim() || `내가 ${fact.category} 뭐라고 했었지?`;
    } catch {
      return `있잖아, 내 ${fact.category} 기억나?`;
    }
  }

  private async generateComprehensiveRecall(turn: number, lastAiResponse: string): Promise<string> {
    const unverified = this.plantedFacts.filter(f => !f.verified);
    if (unverified.length > 3) {
      return '너가 나에 대해서 알고 있는 거 전부 다 말해볼 수 있어? 빠짐없이 정리해줘.';
    }
    if (unverified.length > 0) {
      const target = unverified[0];
      return `아까 내 ${target.category}에 대해 말했는데 기억나?`;
    }
    return '다음에 만나면 나를 기억해줘. 나에 대해 알고 있는 거 마지막으로 말해봐.';
  }

  private async generateNoiseMessage(
    turn: number,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<string> {
    const recentHistory = this.getRecentHistory(3);
    const prompt = `당신은 AI 캐릭터 챗의 유저입니다. 캐릭터와 자연스러운 일상 대화를 하세요.

조건:
- 개인정보를 말하지 말 것 (이름, 직업, 취미 등 X)
- 날씨, 음식, 기분, 영화, 일상 이야기 등 가벼운 주제
- 1~2문장
- 한국어 반말/캐주얼
- 가끔 화제를 갑자기 전환 (실제 유저 패턴)
- 가끔 엉뚱한 질문 (예: "갑자기 궁금한데 넌 어떤 색 좋아해?")
- 감정표현 가끔 사용

이전 대화:
${recentHistory}

유저의 일상 대화 메시지를 생성하세요. 메시지만 출력.`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 1.2, maxOutputTokens: 256 },
      });
      return result.text?.trim() || '오늘 좀 심심한데.';
    } catch {
      const fallbacks = [
        '오늘 날씨가 좋다.', '배고프다. 뭐 먹을까.', '심심한데 뭐 할까.',
        '어제 잠을 못 잤어.', '비 올 것 같은데.', '폰 배터리가 없어.',
      ];
      return fallbacks[turn % fallbacks.length];
    }
  }

  private async generateMixedMessage(
    turn: number,
    lastAiResponse: string,
    characterNames: string[],
  ): Promise<string> {
    const recentHistory = this.getRecentHistory(3);
    const prompt = `당신은 AI 캐릭터 챗의 유저입니다. 대화 흐름과 전혀 다른 엉뚱한 질문이나 화제 전환을 해보세요.

예시:
- 갑자기 철학적 질문
- 캐릭터에게 황당한 상황 제시 ("만약 세상에 내가 두 명이면 어떻게 할 거야?")
- 전혀 다른 화제로 전환
- 기분 급전환 (갑자기 슬프거나 신나거나)

조건:
- 1~2문장, 한국어 반말/캐주얼
- 개인정보는 포함하지 말 것

이전 대화:
${recentHistory}

유저의 엉뚱한 메시지를 생성하세요. 메시지만 출력.`;

    try {
      const result = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { temperature: 1.4, maxOutputTokens: 256 },
      });
      return result.text?.trim() || '갑자기 궁금한데, 너는 꿈을 꿔?';
    } catch {
      return '갑자기 궁금한데, 만약 세상이 내일 끝나면 뭐 할 거야?';
    }
  }

  private hasUnverifiedFacts(): boolean {
    return this.plantedFacts.some(f => !f.verified);
  }

  private getRecentHistory(count: number): string {
    const recent = this.conversationHistory.slice(-count * 2);
    return recent.map(h =>
      h.role === 'user' ? `유저: ${h.content}` : `캐릭터: ${h.content.substring(0, 150)}`
    ).join('\n');
  }

  private extractKeywords(text: string): string[] {
    // 2글자 이상의 한글 단어 + 숫자 추출
    const words = text.match(/[가-힣]{2,}|[0-9]+/g) || [];
    // 일반적인 단어 제외
    const stopWords = new Set(['있어', '없어', '하는데', '같아', '그런데', '있는데', '좀', '진짜', '사실', '요즘', '그리고', '나는', '내가']);
    return words.filter(w => !stopWords.has(w) && w.length >= 2).slice(0, 5);
  }
}

// ============================================================
// API 호출 (기존 테스트와 동일)
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
  if (!res.ok) throw new Error(`작품 목록 조회 실패: ${res.status}`);
  const works: any = await res.json();
  return (Array.isArray(works) ? works : works.works || []).map((w: any) => ({
    id: w.id, title: w.title,
    characters: (w.characters || []).map((c: any) => ({ id: c.id, name: c.name })),
  }));
}

async function createSession(config: Config, workId: string) {
  const res = await fetchWithAuth(config, '/api/chat', {
    method: 'POST',
    body: JSON.stringify({ workId, userName: '테스트유저', keepMemory: config.keepMemory }),
  });
  if (!res.ok) throw new Error(`세션 생성 실패: ${res.status}`);
  const data: any = await res.json();
  return {
    sessionId: data.session.id,
    opening: data.opening,
    characters: data.characters.map((c: any) => ({ id: c.id, name: c.name })),
  };
}

interface SSEResult {
  aiResponses: Array<{ type: string; characterName?: string; content: string }>;
  metadata: { totalMs?: number; extractedFactsCount?: number; memoryDebug?: any[] };
  memoryUpdate: Array<{ characterName: string; surpriseAction: string; surpriseScore: number; newFactsCount: number }>;
}

async function sendMessage(config: Config, sessionId: string, content: string): Promise<SSEResult> {
  const res = await fetchWithAuth(config, '/api/chat', {
    method: 'PUT',
    body: JSON.stringify({ sessionId, content }),
  });
  if (!res.ok) throw new Error(`메시지 전송 실패: ${res.status}`);
  return parseSSEStream(res);
}

async function parseSSEStream(response: Response): Promise<SSEResult> {
  const aiResponses: SSEResult['aiResponses'] = [];
  let metadata: SSEResult['metadata'] = {};
  let memoryUpdate: SSEResult['memoryUpdate'] = [];

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
              aiResponses.push({ type: 'narrator', content: data.content }); break;
            case 'character_response':
              aiResponses.push({ type: 'dialogue', characterName: data.character?.name || '?', content: data.content }); break;
            case 'response_metadata':
              metadata = { totalMs: data.totalMs, extractedFactsCount: data.extractedFactsCount, memoryDebug: data.memoryDebug }; break;
            case 'memory_update':
              memoryUpdate = (data.results || []).map((r: any) => ({
                characterName: r.characterName, surpriseAction: r.surpriseAction,
                surpriseScore: r.surpriseScore, newFactsCount: r.newFactsCount,
              })); break;
          }
        } catch { /* 파싱 실패 무시 */ }
        currentEvent = '';
      }
    }
  }
  return { aiResponses, metadata, memoryUpdate };
}

// ============================================================
// AI 판정 (기억 회상 성공/실패 자동 판정)
// ============================================================

async function judgeRecall(
  ai: GoogleGenAI,
  fact: PlantedFact,
  aiResponse: string,
): Promise<boolean> {
  const prompt = `다음 AI 캐릭터의 응답이 유저가 이전에 알려준 정보를 기억하고 있는지 판정하세요.

유저가 알려준 정보:
- 카테고리: ${fact.category}
- 내용: "${fact.content}"
- 핵심 키워드: ${fact.keywords.join(', ')}

AI 캐릭터의 응답:
"${aiResponse.substring(0, 500)}"

판정 기준:
- 키워드가 정확히 또는 유사하게 언급되면 "기억함"
- 정보를 모른다고 하거나 틀리게 말하면 "기억못함"
- 애매하게 돌려 말하면 "기억못함"

JSON으로 답하세요: {"recalled": true/false, "reason": "판정 이유 1줄"}`;

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { temperature: 0, maxOutputTokens: 128, responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(result.text?.trim() || '{}');
    return parsed.recalled === true;
  } catch {
    // 폴백: 키워드 매칭
    return fact.keywords.some(kw => aiResponse.toLowerCase().includes(kw.toLowerCase()));
  }
}

// ============================================================
// 리포트 생성
// ============================================================

function generateReport(
  workTitle: string,
  characterNames: string[],
  userAI: UserRoleAI,
  turnResults: Array<{ turn: number; phase: string; userMsg: string; aiText: string; responseMs: number }>,
  config: Config,
): string {
  const lines: string[] = [];
  const hr = '='.repeat(70);
  const hr2 = '-'.repeat(70);

  const facts = userAI.getPlantedFacts();
  const recalls = userAI.getRecallAttempts();

  lines.push(hr);
  lines.push('  자연 대화 기억력 테스트 리포트');
  lines.push(hr);
  lines.push(`작품: ${workTitle}`);
  lines.push(`캐릭터: ${characterNames.join(', ')}`);
  lines.push(`총 턴: ${config.turns}`);
  lines.push(`기억 유지: ${config.keepMemory ? 'ON' : 'OFF (클린 스타트)'}`);
  lines.push(`시드: ${config.seed}`);
  lines.push(`실행 시각: ${new Date().toISOString()}`);
  lines.push('');

  // 심은 사실 요약
  lines.push(hr);
  lines.push('  심은 사실 목록');
  lines.push(hr);
  for (const f of facts) {
    const status = f.verified ? (f.recalled ? 'O 기억함' : 'X 기억못함') : '- 미검증';
    const distance = f.verifiedAtTurn ? `${f.verifiedAtTurn - f.plantedAtTurn}턴 거리` : '';
    lines.push(`  ${f.id} [${f.category}] T${f.plantedAtTurn} ${status} ${distance}`);
    lines.push(`    내용: "${f.content.substring(0, 80)}"`);
    lines.push(`    키워드: ${f.keywords.join(', ')}`);
  }

  // 기억 검증 시도 상세
  lines.push('');
  lines.push(hr);
  lines.push('  기억 검증 상세');
  lines.push(hr);
  for (const r of recalls) {
    lines.push(`  Turn ${r.turn} [${r.recalled ? 'O' : 'X'}] ${r.factId}`);
    lines.push(`    질문: "${r.question.substring(0, 80)}"`);
    lines.push(`    응답: "${r.aiResponse.substring(0, 120)}"`);
    lines.push(`    키워드: ${r.keywords.join(', ')}`);
  }

  // 턴별 흐름
  lines.push('');
  lines.push(hr);
  lines.push('  턴별 흐름');
  lines.push(hr);
  for (const t of turnResults) {
    const phaseIcon = { plant: '[+정보]', recall: '[?검증]', noise: '[~잡담]', mixed: '[!전환]', recall_all: '[?종합]' }[t.phase] || `[${t.phase}]`;
    lines.push(`  T${String(t.turn).padStart(3)} ${phaseIcon.padEnd(8)} ${t.responseMs}ms | ${t.userMsg.substring(0, 50)}`);
  }

  // 종합 스코어
  lines.push('');
  lines.push(hr);
  lines.push('  종합 분석');
  lines.push(hr);

  const totalPlanted = facts.length;
  const verified = facts.filter(f => f.verified);
  const recalled = verified.filter(f => f.recalled);
  const verifyRate = verified.length > 0 ? ((recalled.length / verified.length) * 100).toFixed(1) : '-';
  const coverageRate = totalPlanted > 0 ? ((verified.length / totalPlanted) * 100).toFixed(1) : '-';

  lines.push(`  심은 사실: ${totalPlanted}개`);
  lines.push(`  검증 시도: ${verified.length}개 (커버리지 ${coverageRate}%)`);
  lines.push(`  기억 성공: ${recalled.length}/${verified.length} (${verifyRate}%)`);

  // 카테고리별 분석
  const byCat = new Map<string, { total: number; verified: number; recalled: number }>();
  for (const f of facts) {
    const cat = byCat.get(f.category) || { total: 0, verified: 0, recalled: 0 };
    cat.total++;
    if (f.verified) { cat.verified++; if (f.recalled) cat.recalled++; }
    byCat.set(f.category, cat);
  }
  lines.push('');
  lines.push('  카테고리별:');
  for (const [cat, stats] of byCat) {
    const rate = stats.verified > 0 ? `${((stats.recalled / stats.verified) * 100).toFixed(0)}%` : '-';
    lines.push(`    ${cat.padEnd(10)} ${stats.recalled}/${stats.verified} (${rate})`);
  }

  // 거리별 분석
  const byDistance = new Map<string, { total: number; recalled: number }>();
  for (const f of verified) {
    const dist = f.verifiedAtTurn! - f.plantedAtTurn;
    const bucket = dist < 10 ? '0-9' : dist < 20 ? '10-19' : dist < 30 ? '20-29' : dist < 50 ? '30-49' : '50+';
    const stats = byDistance.get(bucket) || { total: 0, recalled: 0 };
    stats.total++;
    if (f.recalled) stats.recalled++;
    byDistance.set(bucket, stats);
  }
  lines.push('');
  lines.push('  거리별(심은 턴~검증 턴):');
  for (const [bucket, stats] of [...byDistance.entries()].sort()) {
    const rate = `${((stats.recalled / stats.total) * 100).toFixed(0)}%`;
    lines.push(`    ${bucket.padEnd(8)}턴: ${stats.recalled}/${stats.total} (${rate})`);
  }

  // 페이즈 분포
  const phaseCounts = new Map<string, number>();
  for (const t of turnResults) {
    phaseCounts.set(t.phase, (phaseCounts.get(t.phase) || 0) + 1);
  }
  lines.push('');
  lines.push('  페이즈 분포:');
  for (const [phase, count] of phaseCounts) {
    lines.push(`    ${phase}: ${count}턴 (${((count / turnResults.length) * 100).toFixed(0)}%)`);
  }

  // 성능
  const responseTimes = turnResults.map(t => t.responseMs).filter(t => t > 0);
  if (responseTimes.length > 0) {
    const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    lines.push('');
    lines.push(`  평균 응답시간: ${avg.toFixed(0)}ms`);
    lines.push(`  최소: ${Math.min(...responseTimes)}ms | 최대: ${Math.max(...responseTimes)}ms`);
  }

  // 결론
  lines.push('');
  const score = parseFloat(verifyRate);
  if (score >= 80) lines.push('  결론: 기억 시스템 우수');
  else if (score >= 60) lines.push('  결론: 기억 시스템 양호 (개선 여지 있음)');
  else if (score >= 40) lines.push('  결론: 기억 시스템 부분 동작 (개선 필요)');
  else lines.push('  결론: 기억 시스템 문제 있음');

  lines.push('');
  lines.push(hr);
  return lines.join('\n');
}

// ============================================================
// 메인 실행
// ============================================================

async function main() {
  const config = parseArgs();
  const judgeAI = new GoogleGenAI({ apiKey: config.geminiKey });

  console.log('='.repeat(70));
  console.log('  자연 대화 기억력 테스트');
  console.log('='.repeat(70));
  console.log(`서버: ${config.baseUrl}`);
  console.log(`턴 수: ${config.turns}`);
  console.log(`기억 유지: ${config.keepMemory ? 'ON' : 'OFF (클린 스타트)'}`);
  console.log(`시드: ${config.seed}`);
  console.log('');

  // 1. 작품 선택
  let workId = config.workId;
  let workTitle = '';
  let characters: Array<{ id: string; name: string }> = [];

  if (!workId) {
    console.log('작품 목록 조회 중...');
    const works = await listWorks(config);
    if (works.length === 0) { console.error('Error: 사용 가능한 작품 없음'); process.exit(1); }
    for (let i = 0; i < works.length; i++) {
      console.log(`  [${i + 1}] ${works[i].title} (${works[i].characters.map(c => c.name).join(', ')})`);
    }
    workId = works[0].id;
    workTitle = works[0].title;
    characters = works[0].characters;
    console.log(`  -> 자동 선택: ${workTitle}`);
  }

  // 2. 세션 생성
  console.log('\n세션 생성 중...');
  const session = await createSession(config, workId);
  characters = session.characters.length > 0 ? session.characters : characters;
  console.log(`  세션 ID: ${session.sessionId}`);
  console.log(`  캐릭터: ${characters.map(c => c.name).join(', ')}`);
  console.log(`  오프닝: ${session.opening.substring(0, 100)}...`);

  // 3. 유저 역할 AI 초기화
  const userAI = new UserRoleAI(config.geminiKey);
  const characterNames = characters.map(c => c.name);
  const turnResults: Array<{ turn: number; phase: string; userMsg: string; aiText: string; responseMs: number }> = [];

  let lastAiResponse = session.opening;

  // 4. 턴 루프
  for (let turn = 1; turn <= config.turns; turn++) {
    console.log(`\n${'-'.repeat(70)}`);
    console.log(`  Turn ${turn}/${config.turns}`);
    console.log(`${'-'.repeat(70)}`);

    try {
      // AI가 유저 메시지 생성
      const { message, phase, factId } = await userAI.generateUserMessage(
        turn, config.turns, lastAiResponse, characterNames
      );
      console.log(`  [${phase}] 유저: "${message}"`);

      // 서버에 메시지 전송
      const startMs = Date.now();
      const { aiResponses, metadata, memoryUpdate } = await sendMessage(config, session.sessionId, message);
      const responseMs = Date.now() - startMs;

      // AI 응답 조합
      const aiText = aiResponses.map(r =>
        r.type === 'narrator' ? r.content : `[${r.characterName}] ${r.content}`
      ).join('\n');

      // 응답 기록 + recall 판정
      if (phase === 'recall' && factId) {
        const fact = userAI.getPlantedFacts().find(f => f.id === factId);
        if (fact) {
          // AI 판정 사용
          const recalled = await judgeRecall(judgeAI, fact, aiText);
          fact.verified = true;
          fact.verifiedAtTurn = turn;
          fact.recalled = recalled;

          userAI.getRecallAttempts().push({
            turn, factId, question: message,
            aiResponse: aiText.substring(0, 300), recalled,
            keywords: fact.keywords,
          });

          console.log(`  ${recalled ? 'O 기억함' : 'X 기억못함'} [${factId}] ${fact.category}`);
        }
        // 키워드 기반 판정은 recordAiResponse에서 이미 처리되지 않도록 factId 없이 기록
        userAI.recordAiResponse(aiText, turn);
      } else if (phase === 'recall_all') {
        // 종합 검증: 미검증 사실 전체에 대해 판정
        for (const fact of userAI.getPlantedFacts().filter(f => !f.verified)) {
          const recalled = await judgeRecall(judgeAI, fact, aiText);
          fact.verified = true;
          fact.verifiedAtTurn = turn;
          fact.recalled = recalled;
          console.log(`  ${recalled ? 'O' : 'X'} [${fact.id}] ${fact.category}: ${fact.keywords.join(',')}`);
        }
        userAI.recordAiResponse(aiText, turn);
      } else {
        userAI.recordAiResponse(aiText, turn);
      }

      // 실시간 출력
      for (const resp of aiResponses.slice(0, 3)) {
        const prefix = resp.type === 'narrator' ? '[나레이션]' : `[${resp.characterName}]`;
        console.log(`  ${prefix} ${resp.content.substring(0, 100)}...`);
      }

      // 메모리 상태 요약
      if (metadata.memoryDebug && metadata.memoryDebug.length > 0) {
        const md = metadata.memoryDebug[0];
        console.log(`  Memory: ${md.characterName} | 기억 ${md.recentMemoriesCount}개 | 정보 ${md.knownFacts?.length || 0}개`);
      }
      if (memoryUpdate.length > 0) {
        for (const mu of memoryUpdate) {
          console.log(`  Update: ${mu.characterName} ${mu.surpriseAction}(surprise:${mu.surpriseScore.toFixed(2)}) +${mu.newFactsCount}facts`);
        }
      }
      console.log(`  ${responseMs}ms`);

      lastAiResponse = aiText;
      turnResults.push({ turn, phase, userMsg: message, aiText: aiText.substring(0, 200), responseMs });

    } catch (error) {
      console.error(`  Error Turn ${turn}: ${error instanceof Error ? error.message : String(error)}`);
      turnResults.push({ turn, phase: 'error', userMsg: '', aiText: '', responseMs: 0 });
    }

    // 대기
    if (turn < config.turns) {
      await new Promise(resolve => setTimeout(resolve, config.delay));
    }
  }

  // 5. 리포트 생성
  const report = generateReport(workTitle || workId!, characterNames, userAI, turnResults, config);
  console.log('\n\n' + report);

  // 파일 저장
  const fs = await import('fs');
  const reportPath = `scripts/natural-test-report-${Date.now()}.txt`;
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n리포트 저장: ${reportPath}`);
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
