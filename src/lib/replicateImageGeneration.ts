/**
 * Replicate 기반 이미지 생성 모듈
 *
 * Animagine XL 4.0으로 캐릭터 일관성 확보 (Danbooru 태그 + 캐릭터 외모 묘사)
 * NSFW 제한 없음, 애니메 특화
 */

import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';
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

// 모델 (Replicate) — Animagine XL 4.0: 애니메 특화, NSFW 지원, Danbooru 태그
// 커뮤니티 모델이라 model: 대신 version: 해시 사용 필요
const ANIMAGINE_VERSION = '057e2276ac5dcd8d1575dc37b131f903df9c10c41aed53d47cd7d4f068c19fa5';

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
// Danbooru 태그 프롬프트 생성 (Gemini Flash)
// ============================================

export async function buildSDPrompt(
  narratorText: string,
  characterProfiles: CharacterProfile[],
  characterDialogues: CharacterDialogue[],
  sceneState?: SceneState
): Promise<{ prompt: string; negativePrompt: string }> {
  // 캐릭터별 감정 태그
  const emotionTags = characterDialogues.map(d => {
    const tag = d.emotion ? (EMOTION_TO_TAGS[d.emotion.primary] || d.emotion.primary) : '';
    return tag;
  }).filter(Boolean).join(', ');

  // 캐릭터 외모 묘사 수집
  const characterDescriptions = characterProfiles
    .filter(c => c.prompt)
    .map(c => `[${c.name}]: ${c.prompt!.substring(0, 400)}`)
    .join('\n');

  const characterCount = characterProfiles.length;
  const characterCountTag = characterCount === 1 ? '1girl' :
    characterCount === 2 ? '2girls' : `${characterCount}girls`;

  const systemPrompt = `You are a Danbooru tag expert for anime image generation (Animagine XL model).
Convert the scene and character descriptions into Danbooru-style comma-separated tags.

RULES:
- Output ONLY comma-separated English tags, no sentences.
- Start with: masterpiece, best quality, anime illustration
- For each character, include their SPECIFIC visual features (hair color, hair style, eye color, outfit, accessories) extracted from their description.
- Include scene/environment tags from the narrator text.
- Include expression/emotion tags for the characters.
- Include lighting and atmosphere tags.
- Character count tag: ${characterCountTag}
- Max 80 tags total. English only.
- Do NOT output negative prompt.
- If the scene is NSFW/sexual, use appropriate Danbooru tags naturally.
- IMPORTANT: Focus on the character's SPECIFIC appearance features, not generic descriptions.`;

  const userPrompt = `Narrator (scene description):
${narratorText.substring(0, 600)}

Character Appearances:
${characterDescriptions || 'No descriptions available'}

Emotions: ${emotionTags || 'neutral'}
Location: ${sceneState?.location || 'unknown'}
Time: ${sceneState?.time || 'unknown'}`;

  const defaultNegative = 'lowres, bad anatomy, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts, signature, watermark, username, blurry, artist name';

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { maxOutputTokens: 500, thinkingConfig: { thinkingBudget: 0 } },
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
    prompt: `masterpiece, best quality, anime illustration, ${characterCountTag}, ${emotionTags || 'neutral expression'}, ${sceneState?.location || 'indoor scene'}, cinematic lighting, detailed`,
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

  // Danbooru 태그 프롬프트 생성 (캐릭터 외모 포함)
  const { prompt: sdPrompt, negativePrompt } = await buildSDPrompt(
    narratorText, characterProfiles, characterDialogues, sceneState
  );
  console.log('[Replicate] SD 프롬프트:', sdPrompt.substring(0, 150) + '...');

  try {
    // Animagine XL 4.0 — 애니메 특화 모델 (version 해시 사용)
    console.log('[Replicate] Animagine XL 4.0 모델 사용');
    const prediction = await replicate.predictions.create({
      version: ANIMAGINE_VERSION,
      input: {
        prompt: sdPrompt,
        negative_prompt: negativePrompt,
        width: 1024,
        height: 768,
        num_inference_steps: 25,
        guidance_scale: 7,
        num_outputs: 1,
        output_format: 'png',
      },
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
