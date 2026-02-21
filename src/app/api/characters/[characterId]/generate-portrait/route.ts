import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || '' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const FLUX_MODEL = 'black-forest-labs/flux-schnell' as const;

/**
 * 캐릭터 프롬프트 기반 프로필 이미지 자동 생성
 * POST /api/characters/[characterId]/generate-portrait
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { characterId } = params;

    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { work: true },
    });

    if (!character) {
      return NextResponse.json({ error: '캐릭터를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (character.work.authorId !== session.user.id) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json({ error: 'REPLICATE_API_TOKEN not configured' }, { status: 500 });
    }

    // 1. Gemini Flash로 캐릭터 프롬프트에서 외형 추출 → SD 프롬프트 생성
    const sdPrompt = await extractAppearancePrompt(character.name, character.prompt);
    console.log(`[Portrait] ${character.name}: ${sdPrompt.substring(0, 100)}...`);

    // 2. Replicate Flux로 초상화 생성 (동기 대기)
    const output = await replicate.run(FLUX_MODEL, {
      input: {
        prompt: sdPrompt,
        aspect_ratio: '1:1',
        num_outputs: 1,
        output_format: 'png',
      },
    });

    // FileOutput → URL 문자열 변환
    const rawOutput = Array.isArray(output) ? output[0] : output;
    const outputUrl = String(rawOutput);
    if (!outputUrl || !outputUrl.startsWith('http')) {
      return NextResponse.json({ error: '이미지 생성 실패' }, { status: 500 });
    }

    // 3. Vercel Blob에 영구 저장
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) throw new Error('Generated image download failed');

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const fileName = `uploads/portrait-${characterId}-${Date.now()}.png`;

    let permanentUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(fileName, buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/png',
      });
      permanentUrl = blob.url;
    } else {
      // 로컬 폴백
      const fs = await import('fs');
      const path = await import('path');
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, fileName.replace('uploads/', '')), buffer);
      permanentUrl = `/${fileName}`;
    }

    // 4. DB 업데이트
    await prisma.character.update({
      where: { id: characterId },
      data: { profileImage: permanentUrl },
    });

    return NextResponse.json({ success: true, imageUrl: permanentUrl });
  } catch (error) {
    console.error('[generate-portrait]', error);
    return NextResponse.json(
      { error: '프로필 이미지 생성 실패', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

/**
 * 캐릭터 프롬프트에서 외형 묘사를 추출하여 SD 초상화 프롬프트 생성
 */
async function extractAppearancePrompt(name: string, prompt: string): Promise<string> {
  try {
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: { maxOutputTokens: 200 },
      contents: [{
        role: 'user',
        parts: [{ text: `You are an expert at writing image generation prompts for anime character portraits.

From the character description below, create a detailed prompt for generating a HIGH-QUALITY ANIME CHARACTER PORTRAIT. The image MUST show a person/character, NOT a background or landscape.

Character name: ${name}
Character description:
${prompt.substring(0, 2000)}

CRITICAL RULES:
- The prompt MUST describe a SINGLE ANIME CHARACTER as the main subject
- MUST start with: "A portrait of an anime character,"
- MUST include: face details (eye color, expression), hair (color, style, length), body type, clothing/outfit
- MUST specify: "upper body shot, looking at viewer, face clearly visible"
- If the character description lacks appearance details, INVENT fitting appearance based on their personality and role
- Use natural English descriptions, NOT comma-separated tags
- Keep under 100 words
- End with: "clean simple background, high quality anime art style, detailed face and eyes"
- Do NOT describe backgrounds, landscapes, or scenery as the main subject` }],
      }],
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) return text;
  } catch (error) {
    console.error('[extractAppearance] Gemini 실패:', error);
  }

  // 폴백
  return `A portrait of an anime character named ${name}, upper body shot, looking at viewer, face clearly visible, beautiful detailed face and eyes, clean simple background, high quality anime art style`;
}
