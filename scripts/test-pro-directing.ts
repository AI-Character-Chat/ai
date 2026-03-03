/**
 * Pro 디렉팅 테스트 — arcPhase + sceneBeat 출력 확인
 *
 * 3턴 시뮬레이션:
 * - Turn 1 (기): 첫 만남 도입
 * - Turn 2 (승): 갈등 고조
 * - Turn 3 (전): 반전 발생
 */

import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
// API key는 환경변수로 전달받음

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
];

// 시뮬레이션 데이터
const scenarios = [
  {
    label: 'Turn 1 — 첫 만남',
    conversationSummary: '(첫 대화)',
    currentTurnSummary: `민수: 안녕, 여기 처음 왔는데 길 좀 알려줄 수 있어?\n\n미나가 민수를 경계하면서 바라본다. "...뭐야, 갑자기." 하지만 시선을 피하지 않았다.`,
    sceneState: { location: '학교 옥상', time: '오후', presentCharacters: ['미나'], recentEvents: [] },
  },
  {
    label: 'Turn 2 — 갈등 고조',
    conversationSummary: '민수가 학교 옥상에서 미나를 처음 만났다. 미나는 경계했지만 길을 알려주었고, 둘은 같은 반이라는 것을 알게 되었다.',
    currentTurnSummary: `민수: 아까 네가 선생님한테 혼나는 거 봤어. 괜찮아?\n\n미나의 표정이 굳어진다. "...네가 알 바 아니잖아." 책을 집어들며 자리에서 일어나려 한다.`,
    sceneState: { location: '교실', time: '쉬는시간', presentCharacters: ['미나'], recentEvents: ['같은 반 배정', '미나가 선생님에게 혼남'] },
  },
  {
    label: 'Turn 3 — 반전 필요',
    conversationSummary: '민수와 미나는 같은 반. 미나는 민수에게 점점 마음을 열고 있지만, 선생님에게 혼난 이야기를 꺼내자 벽을 세웠다. 미나는 가정환경이 복잡한 것 같다.',
    currentTurnSummary: `민수: 미안, 신경쓰여서 그랬어. 점심 같이 먹을래?\n\n미나가 잠시 멈칫한다. "...밥이나 사줄 거야?" 무뚝뚝하지만 거절하지 않았다.`,
    sceneState: { location: '교실', time: '점심시간', presentCharacters: ['미나'], recentEvents: ['미나가 벽을 세움', '민수가 사과함', '미나가 점심 제안을 수락'] },
  },
];

async function runTest() {
  console.log('='.repeat(70));
  console.log('Pro 디렉팅 테스트 (arcPhase + sceneBeat)');
  console.log('='.repeat(70));

  for (const scenario of scenarios) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📍 ${scenario.label}`);
    console.log(`${'─'.repeat(70)}`);

    const analysisPrompt = `이번 턴의 대화를 분석하세요.

등장인물: 미나
장소: ${scenario.sceneState.location}, 시간: ${scenario.sceneState.time}

이전 요약: ${scenario.conversationSummary}
이번 턴: ${scenario.currentTurnSummary}

서사 단계 판단 기준:
- 기(起): 새 장소·인물·상황 소개. 분위기 조성.
- 승(承): 갈등·긴장 고조. 관계 변화. 떡밥 투하.
- 전(轉): 반전·충격·예상 밖 전개. 클라이맥스.
- 결(結): 여운·정리·다음 씬 암시. 감정 착지.

아래 형식으로 출력:
\`\`\`json
{"relationshipDeltas": {"캐릭터이름": {"trust": 0, "affection": 0, "respect": 0, "rivalry": 0, "familiarity": 0.5}}, "directing": {"캐릭터이름": "이 캐릭터가 다음 턴에서 취할 감정·태도·행동 방향 1줄"}, "arcPhase": "기|승|전|결", "sceneBeat": "arcPhase에 맞는 다음 턴 전개 1줄"}
\`\`\``;

    const startTime = Date.now();
    try {
      const result = await ai.models.generateContent({
        model: 'gemini-2.5-pro',
        config: {
          temperature: 0.5,
          maxOutputTokens: 4096,
          safetySettings: SAFETY_SETTINGS,
          thinkingConfig: { thinkingBudget: -1 },
        },
        contents: analysisPrompt,
      });

      const elapsed = Date.now() - startTime;
      const text = result.text || '';

      console.log(`\n⏱️  소요 시간: ${elapsed}ms`);
      console.log(`\n📄 Pro 원문 출력:`);
      console.log(text);

      // 파싱해서 디렉터 노트 형태로 보여주기
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        console.log(`\n🎬 Flash가 받을 디렉터 노트:`);

        const phaseDesc: Record<string, string> = { '기': '도입·분위기 조성', '승': '갈등·긴장 고조', '전': '반전·클라이맥스', '결': '여운·감정 착지' };

        const noteLines: string[] = [];
        if (parsed.arcPhase) {
          noteLines.push(`[씬 단계] ${parsed.arcPhase} — ${phaseDesc[parsed.arcPhase] || ''}`);
        }
        if (parsed.sceneBeat) {
          noteLines.push(`[씬 전개] ${parsed.sceneBeat}`);
        }
        if (parsed.directing) {
          for (const [name, dir] of Object.entries(parsed.directing)) {
            noteLines.push(`[${name}] ${dir}`);
          }
        }

        console.log(`## 디렉터 노트`);
        noteLines.forEach(l => console.log(l));

        console.log(`\n📊 관계 변화:`, JSON.stringify(parsed.relationshipDeltas, null, 2));
      }
    } catch (e: unknown) {
      console.error(`❌ 에러:`, e instanceof Error ? e.message : String(e));
    }
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log('테스트 완료');
}

runTest();
