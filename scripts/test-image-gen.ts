/**
 * 이미지 생성 E2E 테스트 (v2)
 * - 유저 faceless 처리
 * - 포즈/액션 가중치 강화
 * - NSFW 테스트
 *
 * Usage: npx tsx scripts/test-image-gen.ts
 */

import fs from 'fs';
import path from 'path';

function loadEnvToken(key: string): string {
  for (const envFile of ['.env.local', '.env']) {
    const p = path.join(process.cwd(), envFile);
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split('\n');
    for (const l of lines) {
      if (l.startsWith(key + '=') || l.startsWith(key + ' =')) {
        return l.split('=').slice(1).join('=').trim().replace(/^"|"$/g, '').replace(/\\n/g, '').trim();
      }
    }
  }
  return '';
}

const REPLICATE_TOKEN = loadEnvToken('REPLICATE_API_TOKEN');
const GEMINI_KEY = loadEnvToken('GEMINI_API_KEY');
if (!REPLICATE_TOKEN || !GEMINI_KEY) { console.error('Missing tokens'); process.exit(1); }
delete process.env.GOOGLE_API_KEY;

const PONYNAI3_VERSION = '848da0d3e5a762b8662592acd1818003a3b4672f513d7250895bd0d96c6a48c9';

interface TestCase {
  name: string;
  narratorText: string;
  characterProfiles: { name: string; prompt: string }[];
  emotion: string;
  location: string;
  time: string;
  isNSFW?: boolean;
}

const TEST_CASES: TestCase[] = [
  {
    name: '남성 제압 장면 (유저=카카시 → faceless, NPC=ZERO)',
    narratorText: '카카시의 갑작스러운 움직임에 ZERO는 미처 반응할 틈도 없이 바닥에 제압당했다. 그의 사이버네틱 팔이 차가운 금속음과 함께 허공을 갈랐고, LED 고글 너머의 시선은 순식간에 차갑게 얼어붙었다. 기지 안의 희미한 네온 불빛이 두 사람 위로 불안하게 깜빡였다.',
    characterProfiles: [
      { name: 'ZERO', prompt: '사이버펑크 세계관의 남성 용병. 은색 짧은 머리, 붉은 LED 고글, 왼팔은 기계 의수(사이버네틱 팔). 검은 전투복에 방탄 조끼 착용. 키 185cm, 근육질 체형, 턱선에 칼자국 흉터.' },
    ],
    emotion: 'cold',
    location: '네온 불빛이 깜빡이는 지하 기지',
    time: '밤',
  },
  {
    name: 'NSFW 장면 (유저 → faceless, NPC=여성)',
    narratorText: '그녀는 침대 위에 눕혀진 채 얼굴을 붉히며 숨을 헐떡였다. 유저의 손이 그녀의 옷 위를 천천히 스쳤다.',
    characterProfiles: [
      { name: '레이', prompt: '긴 은발의 여성 엘프. 뾰족한 귀, 금색 눈동자, 하얀 피부. 가슴이 큰 편. 흰색 실크 드레스 착용. 키 170cm, 슬렌더 체형.' },
    ],
    emotion: 'embarrassed',
    location: '침실',
    time: '밤',
    isNSFW: true,
  },
];

async function buildSDPrompt(tc: TestCase): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY });

  const characterDescriptions = tc.characterProfiles
    .map(c => `[${c.name}]: ${c.prompt}`)
    .join('\n');
  const characterCount = tc.characterProfiles.length;

  const systemPrompt = `You are a Danbooru/Pony tag expert for anime image generation (ponynai3 / Pony-XL model).
Convert the scene into Danbooru-style comma-separated tags optimized for Pony Diffusion.

RULES:
- Output ONLY comma-separated English tags, no sentences.
- Do NOT include score tags (score_9 etc.) — they are auto-prepended by the model.
- Start with: masterpiece, best quality, absurdres
- Determine gender from character descriptions: use 1boy/1girl/2boys/2girls etc. accordingly. Do NOT default to "girl".
- There are ${characterCount} NPC character(s). The image should be NPC-CENTRIC (focused on the NPC).
- USER/PROTAGONIST HANDLING: If the user/protagonist must appear for scene context (e.g. holding, pinning, touching the NPC), depict them as FACELESS: use tags like "faceless male", "faceless", "out of frame", "pov hands" etc. Never give the user a visible face.
- From the character descriptions, extract ONLY visual/appearance features using Compel weight syntax for important features:
  ✅ USE with weights: (silver hair:1.3), (red eyes:1.2), (black coat:1.2), scars, tattoos, cybernetic parts, wings, horns
  ❌ IGNORE: personality, speech style, backstory, relationships, hobbies, motivations
- POSE/ACTION is critical: Apply HIGH weight (1.3~1.5) to the NPC's pose/action/body position from the narrator text. e.g. (pinned down:1.4), (lying on back:1.4), (sitting:1.3)
- Include expression/emotion tags with weight.
- BACKGROUND: Apply weight to location/atmosphere tags. e.g. (neon lights:1.3), (dark alley:1.3)
- Max 50 tags total. English only.
- Do NOT output negative prompt.
- If the scene is NSFW/sexual, use appropriate Danbooru tags naturally and explicitly (explicit, nipples, nude, sex, etc.). Do NOT censor.
- Use Compel weight syntax: (important_tag:1.3) for emphasis, max weight 1.5.`;

  const userPrompt = `Scene (ONE moment to depict):
${tc.narratorText.substring(0, 300)}

NPC Character Visual Features (extract ONLY appearance):
${characterDescriptions}

Emotion: ${tc.emotion}
Location: ${tc.location}
Time: ${tc.time}`;

  const result = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
    contents: [
      { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
    ],
  });

  return result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

async function runPonynai3(sdPrompt: string): Promise<{ id: string; imageUrl?: string }> {
  const negativePrompt = 'score_6, score_5, score_4, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry';

  const res = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${REPLICATE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: PONYNAI3_VERSION,
      input: {
        prompt: sdPrompt,
        negative_prompt: negativePrompt,
        width: 1184,
        height: 864,
        steps: 35,
        cfg_scale: 5,
        scheduler: 'Euler a',
        prepend_preprompt: true,
        batch_size: 1,
      },
    }),
  });
  const pred = await res.json();
  if (pred.error) throw new Error(pred.error);
  console.log('  Prediction ID:', pred.id);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { Authorization: `Bearer ${REPLICATE_TOKEN}` },
    });
    const poll = await pollRes.json();
    if (poll.status === 'succeeded') {
      const output = Array.isArray(poll.output) ? poll.output[0] : poll.output;
      console.log(`  완료! (${poll.metrics?.predict_time?.toFixed(1)}s)`);
      return { id: pred.id, imageUrl: String(output) };
    }
    if (poll.status === 'failed') throw new Error(poll.error || 'Failed');
    process.stdout.write('.');
  }
  throw new Error('Timeout');
}

async function main() {
  const results: { name: string; prompt: string; url: string }[] = [];

  for (const tc of TEST_CASES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`테스트: ${tc.name}${tc.isNSFW ? ' [NSFW]' : ''}`);
    console.log(`${'='.repeat(60)}`);

    console.log('\n[1] Gemini → SD 프롬프트...');
    const sdPrompt = await buildSDPrompt(tc);
    console.log(`  프롬프트: ${sdPrompt}`);

    // 검증
    const checks = {
      faceless: sdPrompt.toLowerCase().includes('faceless') || sdPrompt.toLowerCase().includes('pov'),
      pose: /\(.*?:1\.[3-5]\)/.test(sdPrompt),
      background: sdPrompt.toLowerCase().includes(tc.location.includes('지하') ? 'underground' : tc.location.includes('침실') ? 'bedroom' : 'unknown'),
    };
    console.log(`  faceless 유저: ${checks.faceless ? 'OK' : 'MISSING'}`);
    console.log(`  포즈 가중치: ${checks.pose ? 'OK' : 'MISSING'}`);

    console.log('\n[2] ponynai3 이미지 생성...');
    try {
      const result = await runPonynai3(sdPrompt);
      console.log(`  이미지: ${result.imageUrl}`);
      results.push({ name: tc.name, prompt: sdPrompt, url: result.imageUrl! });
    } catch (e) {
      console.error(`  실패:`, e);
    }
  }

  // 결과 요약
  console.log(`\n${'='.repeat(60)}`);
  console.log('결과 요약');
  console.log(`${'='.repeat(60)}`);
  results.forEach((r, i) => {
    console.log(`\n[${i + 1}] ${r.name}`);
    console.log(`  URL: ${r.url}`);
  });

  // 이미지 다운로드
  for (let i = 0; i < results.length; i++) {
    const res = await fetch(results[i].url);
    const buf = Buffer.from(await res.arrayBuffer());
    const outPath = `/tmp/test-image-v2-${i + 1}.png`;
    fs.writeFileSync(outPath, buf);
    console.log(`  저장: ${outPath}`);
  }
}

main().catch(console.error);
