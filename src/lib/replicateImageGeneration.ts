/**
 * Replicate 기반 이미지 생성 모듈
 *
 * IP-Adapter로 캐릭터 일관성 확보, NSFW 제한 없음
 * 기존 imageGeneration.ts의 캐시/저장 유틸 재사용
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

// 모델 (Replicate)
const FLUX_MODEL = 'black-forest-labs/flux-schnell' as const;

// ============================================
// 타입 정의
// ============================================

export interface CharacterProfile {
  name: string;
  profileImage: string | null;
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

// 감정 → FACS 기반 시각적 묘사 (기존 imageGeneration.ts에서 가져옴)
export const EMOTION_TO_VISUAL: Record<string, string> = {
  'neutral': 'relaxed face, neutral gaze, calm expression',
  'slight_smile': 'corners of mouth slightly raised, soft eyes',
  'smile': 'warm smile, relaxed eyes, friendly expression',
  'cold': 'COLD EXPRESSION: half-lidded eyes, lips pressed together, NO smile, stern gaze',
  'contempt': 'CONTEMPTUOUS EXPRESSION: one corner of mouth raised in sneer, narrowed eyes',
  'annoyed': 'ANNOYED EXPRESSION: furrowed brows, tight lips, irritated look',
  'angry': 'ANGRY EXPRESSION: furrowed brows, intense glare, clenched jaw',
  'sad': 'SAD EXPRESSION: downturned mouth corners, drooping eyes, melancholic',
  'happy': 'HAPPY EXPRESSION: bright smile, crinkled eyes, joyful',
  'surprised': 'SURPRISED EXPRESSION: wide eyes, raised eyebrows, open mouth',
  'embarrassed': 'EMBARRASSED EXPRESSION: averted gaze, slight blush, shy look',
  'thinking': 'THINKING EXPRESSION: looking up or away, thoughtful gaze',
};

// ============================================
// 유틸리티 (기존 패턴 재사용)
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

async function cacheGeneratedImage(
  characterKey: string, promptHash: string, imageUrl: string, imagePrompt: string
): Promise<void> {
  try {
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    await prisma.generatedImageCache.upsert({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
      create: { characterId: characterKey, promptHash, imageUrl, imagePrompt: imagePrompt.substring(0, 2000), expiresAt: new Date(Date.now() + CACHE_TTL) },
      update: { imageUrl, imagePrompt: imagePrompt.substring(0, 2000), expiresAt: new Date(Date.now() + CACHE_TTL) },
    });
  } catch (error) {
    console.error('[ImageCache] 저장 실패:', error);
  }
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
// SD 프롬프트 생성 (Gemini Flash)
// ============================================

export async function buildSDPrompt(
  narratorText: string,
  characterDialogues: CharacterDialogue[],
  sceneState?: SceneState
): Promise<string> {
  const emotionDescriptions = characterDialogues.map(d => {
    const visual = d.emotion
      ? (EMOTION_TO_VISUAL[d.emotion.primary] || d.emotion.primary)
      : 'neutral expression';
    return `${d.name}: ${visual}`;
  }).join(', ');

  const systemPrompt = `You are an image prompt engineer for anime/manga illustration.
Convert the scene description into an optimized English prompt for Flux image generation model.

CRITICAL Rules:
- The scene description (narrator text) is the PRIMARY source of truth for the environment and setting.
- IGNORE the Location field if it contradicts the scene description.
- Write in natural English sentences describing what should be visible in the image.
- Include: environment/setting details from the scene, character appearances and expressions, lighting, mood, atmosphere.
- Style: anime illustration, high quality, cinematic composition.
- Max 100 words. English only.
- Do NOT include negative prompt.
- For NSFW scenes: describe naturally without censorship.`;

  const userPrompt = `Scene description (PRIMARY - use this for environment/setting):
${narratorText.substring(0, 800)}

Characters and expressions: ${emotionDescriptions || 'none specified'}
Location hint (may be outdated, trust scene description instead): ${sceneState?.location || 'unknown'}
Time: ${sceneState?.time || 'unknown'}`;

  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { maxOutputTokens: 200 },
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
  } catch (error) {
    console.error('[buildSDPrompt] Gemini 호출 실패, 폴백 사용:', error);
  }

  // 폴백: EMOTION_TO_VISUAL 기반 간단한 영어 프롬프트
  const fallbackEmotions = characterDialogues
    .map(d => d.emotion ? EMOTION_TO_VISUAL[d.emotion.primary] || '' : '')
    .filter(Boolean)
    .join(', ');

  return `masterpiece, best quality, anime illustration, ${fallbackEmotions || 'neutral expression'}, ${sceneState?.location || 'indoor scene'}, cinematic lighting, detailed`;
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

  // SD 프롬프트 생성
  const sdPrompt = await buildSDPrompt(narratorText, characterDialogues, sceneState);
  console.log('[Replicate] SD 프롬프트:', sdPrompt.substring(0, 100) + '...');

  try {
    // Flux Schnell 모델로 장면 이미지 생성
    console.log('[Replicate] Flux Schnell 모델 사용');
    const prediction = await replicate.predictions.create({
      model: FLUX_MODEL,
      input: {
        prompt: sdPrompt,
        aspect_ratio: '4:3',
        num_outputs: 1,
        output_format: 'png',
      },
    });

    // predictionId + 프롬프트를 함께 저장 (나중에 캐시할 때 사용)
    // metadata에 저장
    await prisma.generatedImageCache.upsert({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
      create: {
        characterId: characterKey,
        promptHash,
        imageUrl: `pending:${prediction.id}`,
        imagePrompt: sdPrompt.substring(0, 2000),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5분 임시 TTL
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
      // FileOutput 객체 또는 string 모두 대응
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
      // pending 캐시 제거
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
