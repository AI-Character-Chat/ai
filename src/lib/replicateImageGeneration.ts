/**
 * Replicate 기반 이미지 생성 모듈
 *
 * ponynai3 (tPonynai3_v7) — Pony-XL 기반 애니메 특화 모델
 * score 시스템 + Danbooru 태그 + Compel 가중치
 * NSFW 제한 없음, 871K+ runs
 */

import Replicate from 'replicate';
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { put } from '@vercel/blob';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from './prisma';

// ============================================
// 초기화
// ============================================

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || '' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// 모델 (Replicate) — ponynai3 (tPonynai3_v7): Pony-XL 애니메 특화, NSFW 무제한, 871K+ runs
// prepend_preprompt=true → 자동으로 "score_9, score_8_up, score_7_up" 추가
const PONYNAI3_VERSION = '848da0d3e5a762b8662592acd1818003a3b4672f513d7250895bd0d96c6a48c9';

// ============================================
// 타입 정의
// ============================================

export interface CharacterProfile {
  name: string;
  profileImage: string | null;
  prompt?: string; // 캐릭터 설정 텍스트 (외모 묘사 포함)
}

export interface CharacterDialogue {
  name: string;
  dialogue?: string;
  emotion?: {
    primary: string;
    intensity: number;
  };
}

export interface SceneState {
  location: string;
  time: string;
}

export interface SceneImageParams {
  narratorText: string;
  characterProfiles: CharacterProfile[];
  characterDialogues?: CharacterDialogue[];
  sceneState?: SceneState;
}

export interface ReplicateImageResult {
  success: boolean;
  predictionId?: string;
  imageUrl?: string;
  error?: string;
  cached?: boolean;
}

// 한국어 동작 → Danbooru 포즈 태그 매핑
const POSE_MAPPING: Record<string, string> = {
  // 기본 자세
  '서있': 'standing', '앉아': 'sitting', '누워': 'lying', '무릎': 'kneeling',
  '웅크': 'crouching', '기대': 'leaning', '엎드': 'on stomach',
  // 전투/액션
  '제압': 'pinned down', '붙잡': 'grabbing', '밀어': 'pushing', '때리': 'punching',
  '차고': 'kicking', '달리': 'running', '뛰': 'jumping', '피하': 'dodging',
  '쓰러': 'falling', '막아': 'blocking',
  // 감정 표현
  '안아': 'hugging', '키스': 'kiss', '울': 'crying', '떨': 'trembling',
  '웃': 'laughing',
  // 특수
  '눕혀': 'on back', '매달': 'suspended', '묶': 'restrained',
  '들어': 'carrying', '잡아': 'holding',
};

// 나레이션에서 포즈 태그 감지
function detectPosesFromText(text: string): string[] {
  const detected: string[] = [];
  for (const [korean, tag] of Object.entries(POSE_MAPPING)) {
    if (text.includes(korean)) {
      detected.push(tag);
    }
  }
  return detected;
}

// 감정 → Danbooru 태그 매핑
export const EMOTION_TO_TAGS: Record<string, string> = {
  'neutral': 'neutral expression',
  'slight_smile': 'slight smile, soft eyes',
  'smile': 'smile, happy',
  'cold': 'cold expression, half-closed eyes, serious',
  'contempt': 'smirk, narrowed eyes, contemptuous',
  'annoyed': 'furrowed brows, annoyed, frown',
  'angry': 'angry, glaring, clenched teeth',
  'sad': 'sad, downcast eyes, melancholic',
  'happy': 'happy, bright smile, sparkling eyes',
  'surprised': 'surprised, wide eyes, open mouth',
  'embarrassed': 'embarrassed, blush, looking away',
  'thinking': 'thinking, looking up, thoughtful',
};

// ============================================
// 유틸리티
// ============================================

function generatePromptHash(narratorText: string, characterNames: string[]): string {
  const content = `${narratorText.trim()}|${characterNames.sort().join(',')}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}

async function getCachedImage(characterKey: string, promptHash: string): Promise<string | null> {
  try {
    const cached = await prisma.generatedImageCache.findUnique({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
    });
    if (cached && cached.expiresAt > new Date()) return cached.imageUrl;
    if (cached) await prisma.generatedImageCache.delete({ where: { id: cached.id } }).catch(() => {});
    return null;
  } catch { return null; }
}

async function saveImageFromUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) throw new Error(`Image download failed: ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = response.headers.get('content-type') || 'image/png';
  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const fileName = `uploads/generated-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(fileName, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType,
    });
    return blob.url;
  }

  // 폴백: 로컬 파일시스템
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  fs.writeFileSync(path.join(uploadsDir, fileName.replace('uploads/', '')), buffer);
  return `/${fileName}`;
}

// ============================================
// 캐릭터 시각 태그 추출 및 캐싱
// ============================================

async function getVisualTagsFromCache(characterId: string, promptHash: string): Promise<string | null> {
  try {
    const cached = await prisma.generatedImageCache.findUnique({
      where: { characterId_promptHash: { characterId: `visual-tags:${characterId}`, promptHash } },
    });
    if (cached && cached.expiresAt > new Date()) return cached.imagePrompt;
    return null;
  } catch { return null; }
}

async function saveVisualTagsToCache(characterId: string, promptHash: string, tags: string): Promise<void> {
  try {
    await prisma.generatedImageCache.upsert({
      where: { characterId_promptHash: { characterId: `visual-tags:${characterId}`, promptHash } },
      create: {
        characterId: `visual-tags:${characterId}`,
        promptHash,
        imageUrl: 'visual-tags',
        imagePrompt: tags,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30일
      },
      update: {
        imagePrompt: tags,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
  } catch (e) {
    console.error('[extractVisualTags] 캐시 저장 실패:', e);
  }
}

export async function extractVisualTags(characterPrompt: string, characterName: string, characterId?: string): Promise<string> {
  const promptHash = crypto.createHash('sha256').update(characterPrompt).digest('hex').substring(0, 32);
  const cacheKey = characterId || characterName;

  // 캐시 확인
  const cached = await getVisualTagsFromCache(cacheKey, promptHash);
  if (cached) {
    console.log(`[extractVisualTags] 캐시 히트: ${characterName}`);
    return cached;
  }

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        maxOutputTokens: 300,
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
        ],
      },
      contents: [{
        role: 'user',
        parts: [{ text: `Extract ONLY visual/physical appearance features from this character description and convert to Danbooru-style tags with Compel weights.

Character name: ${characterName}

Character description:
${characterPrompt.substring(0, 2000)}

RULES:
- Output ONLY comma-separated Danbooru tags. No sentences.
- Start with gender tag: 1boy or 1girl (determine from description)
- Include ONLY visual features: hair (color, length, style), eye color, body type, height, clothing, accessories, scars, tattoos, cybernetic parts, wings, horns, etc.
- Use Compel weight (tag:1.3) for distinctive/unique features
- IGNORE: personality, speech style, backstory, relationships, hobbies, motivations, powers, abilities
- Max 25 tags
- Example output: 1boy, (silver short hair:1.3), (red eyes:1.3), (cybernetic left arm:1.4), black tactical gear, muscular, tall, scar on jaw` }],
      }],
    });

    const tags = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (tags) {
      await saveVisualTagsToCache(cacheKey, promptHash, tags);
      console.log(`[extractVisualTags] 추출 완료 (${characterName}): ${tags.substring(0, 80)}...`);
      return tags;
    }
  } catch (error) {
    console.error(`[extractVisualTags] Gemini 호출 실패 (${characterName}):`, error);
  }

  return '';
}

// ============================================
// Danbooru 태그 프롬프트 생성 (Gemini Flash)
// ============================================

export async function buildSDPrompt(
  narratorText: string,
  characterProfiles: CharacterProfile[],
  characterDialogues: CharacterDialogue[],
  sceneState?: SceneState,
  cachedVisualTags?: Map<string, string>
): Promise<{ prompt: string; negativePrompt: string }> {
  // 캐릭터별 감정 태그
  const emotionTags = characterDialogues.map(d => {
    const tag = d.emotion ? (EMOTION_TO_TAGS[d.emotion.primary] || d.emotion.primary) : '';
    return tag;
  }).filter(Boolean).join(', ');

  // 캐시된 시각 태그가 있으면 고정 프리픽스로 사용
  const visualTagsList: string[] = [];
  if (cachedVisualTags && cachedVisualTags.size > 0) {
    cachedVisualTags.forEach((tags) => {
      if (tags) visualTagsList.push(tags);
    });
  }
  const fixedVisualTags = visualTagsList.join(', ');

  // 시각 태그가 없는 캐릭터만 description 전달
  const characterDescriptions = characterProfiles
    .filter(c => c.prompt && !(cachedVisualTags?.has(c.name) && cachedVisualTags.get(c.name)))
    .map(c => `[${c.name}]: ${c.prompt!.substring(0, 400)}`)
    .join('\n');

  const characterCount = characterProfiles.length;

  const mandatoryAppearance = fixedVisualTags
    ? `\n- MANDATORY CHARACTER APPEARANCE: The following Danbooru tags describe the NPC's fixed appearance. ALWAYS include these tags at the start after quality tags. Do NOT alter hair color, eye color, or distinctive features.\n  ${fixedVisualTags}`
    : '';

  const systemPrompt = `You are a Danbooru/Pony tag expert for anime image generation (ponynai3 / Pony-XL model).
Convert the scene into Danbooru-style comma-separated tags optimized for Pony Diffusion.

RULES:
- Output ONLY comma-separated English tags, no sentences.
- Do NOT include score tags (score_9 etc.) — they are auto-prepended by the model.
- Start with: masterpiece, best quality, absurdres${mandatoryAppearance}
- Determine gender from character descriptions: use 1boy/1girl/2boys/2girls etc. accordingly. Do NOT default to "girl".
- There are ${characterCount} NPC character(s). The image should be NPC-CENTRIC (focused on the NPC).
- USER/PROTAGONIST: Use POV perspective (pov, first person view, from above/below) so the camera IS the user. If user's hands/body must appear, add "faceless male" or "faceless female". NEVER show the user's face.${fixedVisualTags ? '' : `
- From the character descriptions, extract ONLY visual/appearance features using Compel weight syntax for important features:
  ✅ USE with weights: (silver hair:1.3), (red eyes:1.2), (black coat:1.2), scars, tattoos, cybernetic parts, wings, horns
  ❌ IGNORE: personality, speech style, backstory, relationships, hobbies, motivations`}
- POSE/ACTION is critical: Use specific Danbooru pose tags with HIGH weight (1.3~1.5). Examples: (lying:1.4), (sitting:1.3), (kneeling:1.3), (on back:1.4), (restrained:1.4), (standing:1.3). Avoid abstract descriptions — use concrete body position tags.
- Include expression/emotion tags with weight.
- BACKGROUND: Use specific Danbooru location tags with weight. e.g. (neon lights:1.3), (dark room:1.3), (bedroom:1.3), (outdoors:1.2). Avoid vague descriptions — use concrete setting tags.
- Max 50 tags total. English only.
- Do NOT output negative prompt.
- If the scene is NSFW/sexual, use appropriate Danbooru tags naturally and explicitly (explicit, nipples, nude, sex, etc.). Do NOT censor.
- Use Compel weight syntax: (important_tag:1.3) for emphasis, max weight 1.5.`;

  // 한국어 나레이션에서 포즈 태그 자동 감지
  const detectedPoses = detectPosesFromText(narratorText);
  const poseSection = detectedPoses.length > 0
    ? `\n\nDETECTED POSES from narrator text (use these with HIGH weight 1.4~1.5):\n${detectedPoses.join(', ')}`
    : '';

  const userPrompt = `Scene (ONE moment to depict):
${narratorText.substring(0, 500)}

NPC Character Visual Features (extract ONLY appearance):
${characterDescriptions || 'No descriptions available'}

Emotion: ${emotionTags || 'neutral'}
Location: ${sceneState?.location || 'unknown'}
Time: ${sceneState?.time || 'unknown'}${poseSection}`;

  // ponynai3 전용 네거티브 — score 기반 품질 제어
  const defaultNegative = 'score_6, score_5, score_4, lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, watermark, username, blurry';

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        maxOutputTokens: 500,
        thinkingConfig: { thinkingBudget: 1024 },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY, threshold: HarmBlockThreshold.OFF },
        ],
      },
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      return { prompt: text, negativePrompt: defaultNegative };
    }
  } catch (error) {
    console.error('[buildSDPrompt] Gemini 호출 실패, 폴백 사용:', error);
  }

  // 폴백: 기본 태그
  return {
    prompt: `masterpiece, best quality, anime illustration, ${characterCount > 1 ? `${characterCount}persons` : '1person'}, ${emotionTags || 'neutral expression'}, ${sceneState?.location || 'indoor scene'}, cinematic lighting, detailed`,
    negativePrompt: defaultNegative,
  };
}

// ============================================
// 메인 함수: 비동기 이미지 생성 요청
// ============================================

export async function generateSceneImageAsync(params: SceneImageParams): Promise<ReplicateImageResult> {
  const { narratorText, characterProfiles, characterDialogues = [], sceneState } = params;

  if (!process.env.REPLICATE_API_TOKEN) {
    return { success: false, error: 'REPLICATE_API_TOKEN not configured' };
  }

  const characterNames = characterProfiles.map(c => c.name);
  const characterKey = characterNames.sort().join(',').substring(0, 50);
  const promptHash = generatePromptHash(narratorText, characterNames);

  // 캐시 확인
  const cachedUrl = await getCachedImage(characterKey, promptHash);
  if (cachedUrl) {
    console.log('[Replicate] 캐시 히트:', characterKey);
    return { success: true, imageUrl: cachedUrl, cached: true };
  }

  // 캐릭터별 시각 태그 추출 (병렬, DB 캐싱)
  const visualTagsMap = new Map<string, string>();
  const visualTagPromises = characterProfiles
    .filter(c => c.prompt)
    .map(async (c) => {
      const tags = await extractVisualTags(c.prompt!, c.name);
      if (tags) visualTagsMap.set(c.name, tags);
    });
  await Promise.all(visualTagPromises);

  // Danbooru 태그 프롬프트 생성 (캐시된 시각 태그 + 장면 태그)
  const { prompt: sdPrompt, negativePrompt } = await buildSDPrompt(
    narratorText, characterProfiles, characterDialogues, sceneState, visualTagsMap
  );
  console.log('[Replicate] SD 프롬프트:', sdPrompt.substring(0, 150) + '...');

  try {
    // ponynai3 (tPonynai3_v7) — Pony-XL 애니메 특화, score 시스템
    // 주 발화자의 profileImage를 img2img 참조로 사용 → 캐릭터 일관성 확보
    const mainCharacter = characterProfiles[0];
    const referenceImage = mainCharacter?.profileImage || null;

    const input: Record<string, unknown> = {
      prompt: sdPrompt,
      negative_prompt: negativePrompt,
      width: 1184,
      height: 864,
      steps: 35,
      cfg_scale: 5,
      scheduler: 'Euler a',
      prepend_preprompt: true,  // score_9, score_8_up, score_7_up 자동 추가
      batch_size: 1,
    };

    if (referenceImage) {
      input.image = referenceImage;
      input.strength = 0.45;  // 0=원본유지, 1=완전새로. 0.45=캐릭터 외형 보존 + 장면 변경
      console.log('[Replicate] img2img 모드 — 참조:', referenceImage.substring(0, 60) + '...');
    } else {
      console.log('[Replicate] txt2img 모드 — profileImage 없음');
    }

    const prediction = await replicate.predictions.create({
      version: PONYNAI3_VERSION,
      input,
    });

    // pending 캐시 저장
    await prisma.generatedImageCache.upsert({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
      create: {
        characterId: characterKey,
        promptHash,
        imageUrl: `pending:${prediction.id}`,
        imagePrompt: sdPrompt.substring(0, 2000),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
      update: {
        imageUrl: `pending:${prediction.id}`,
        imagePrompt: sdPrompt.substring(0, 2000),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    }).catch(() => {});

    return { success: true, predictionId: prediction.id };
  } catch (error) {
    console.error('[Replicate] prediction 생성 실패:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Replicate API error' };
  }
}

// ============================================
// 폴링: Prediction 상태 확인
// ============================================

export async function checkPredictionStatus(
  predictionId: string,
  messageId?: string
): Promise<ReplicateImageResult> {
  if (!process.env.REPLICATE_API_TOKEN) {
    return { success: false, error: 'REPLICATE_API_TOKEN not configured' };
  }

  try {
    const prediction = await replicate.predictions.get(predictionId);

    if (prediction.status === 'succeeded') {
      const rawOutput = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      const outputUrl = String(rawOutput);

      if (!outputUrl || !outputUrl.startsWith('http')) {
        return { success: false, error: 'No output URL from prediction' };
      }

      // Replicate 임시 URL → Vercel Blob 영구 저장
      const permanentUrl = await saveImageFromUrl(outputUrl);

      // 캐시 업데이트 (pending → 실제 URL, 7일 TTL)
      try {
        const pendingCache = await prisma.generatedImageCache.findFirst({
          where: { imageUrl: `pending:${predictionId}` },
        });
        if (pendingCache) {
          await prisma.generatedImageCache.update({
            where: { id: pendingCache.id },
            data: {
              imageUrl: permanentUrl,
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
          });
        }
      } catch { /* 캐시 업데이트 실패해도 이미지는 반환 */ }

      // Message.imageUrl 업데이트
      if (messageId) {
        await prisma.message.update({
          where: { id: messageId },
          data: { imageUrl: permanentUrl },
        }).catch(e => console.error('[Replicate] Message imageUrl 업데이트 실패:', e));
      }

      return { success: true, imageUrl: permanentUrl };
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      await prisma.generatedImageCache.deleteMany({
        where: { imageUrl: `pending:${predictionId}` },
      }).catch(() => {});

      return { success: false, error: (typeof prediction.error === 'string' ? prediction.error : null) || `Prediction ${prediction.status}` };
    }

    // 아직 처리 중
    return { success: true, predictionId };
  } catch (error) {
    console.error('[Replicate] 상태 확인 실패:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Status check failed' };
  }
}
