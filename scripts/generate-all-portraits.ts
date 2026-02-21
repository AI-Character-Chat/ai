/**
 * 모든 캐릭터에 대해 AI 프로필 이미지(애니메이션 초상화) 일괄 생성
 *
 * 사용법: npx tsx scripts/generate-all-portraits.ts
 * 옵션:
 *   --force    이미 profileImage가 있는 캐릭터도 재생성
 *   --dry-run  실제 생성 없이 대상 캐릭터만 확인
 */

import { PrismaClient } from '@prisma/client';
import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';
import { put } from '@vercel/blob';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// .env + .env.local 수동 로드 (dotenv 미설치)
function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch { /* 파일 없으면 무시 */ }
}
loadEnvFile(resolve(process.cwd(), '.env.local'));
loadEnvFile(resolve(process.cwd(), '.env'));

const prisma = new PrismaClient();
const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || '' });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const FLUX_MODEL = 'black-forest-labs/flux-schnell' as `${string}/${string}`;

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const DRY_RUN = args.includes('--dry-run');

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
    console.error(`  [Gemini 실패] ${name}:`, error instanceof Error ? error.message : error);
  }

  return `A portrait of an anime character, upper body shot, looking at viewer, face clearly visible, beautiful detailed face and eyes, clean simple background, high quality anime art style`;
}

async function generatePortrait(characterId: string, name: string, sdPrompt: string): Promise<string | null> {
  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
  try {
    const output = await replicate.run(FLUX_MODEL, {
      input: {
        prompt: sdPrompt,
        aspect_ratio: '1:1',
        num_outputs: 1,
        output_format: 'png',
      },
    });

    // FileOutput 객체 → URL 문자열 변환
    const rawOutput = Array.isArray(output) ? output[0] : output;
    const outputUrl = String(rawOutput);
    if (!outputUrl || outputUrl === '[object Object]' || !outputUrl.startsWith('http')) {
      console.error(`  [Replicate] 출력 없음: ${name}`);
      return null;
    }

    // Vercel Blob에 저장
    const imageResponse = await fetch(outputUrl);
    if (!imageResponse.ok) throw new Error(`Download failed: ${imageResponse.status}`);

    const buffer = Buffer.from(await imageResponse.arrayBuffer());
    const fileName = `uploads/portrait-${characterId}-${Date.now()}.png`;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(fileName, buffer, {
        access: 'public',
        addRandomSuffix: false,
        contentType: 'image/png',
      });
      return blob.url;
    }

    // 로컬 폴백
    const fs = await import('fs');
    const path = await import('path');
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, fileName.replace('uploads/', '')), buffer);
    return `/${fileName}`;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('429') && attempt < MAX_RETRIES - 1) {
      const waitSec = 15 * (attempt + 1);
      console.log(`  [429 Rate Limit] ${waitSec}초 대기 후 재시도 (${attempt + 1}/${MAX_RETRIES})...`);
      await new Promise(r => setTimeout(r, waitSec * 1000));
      continue;
    }
    console.error(`  [생성 실패] ${name}:`, msg);
    return null;
  }
  } // end for retry
  return null;
}

async function main() {
  console.log('=== 캐릭터 프로필 이미지 일괄 생성 ===');
  console.log(`모드: ${DRY_RUN ? 'DRY RUN (미리보기)' : FORCE ? 'FORCE (전체 재생성)' : '신규만 생성'}`);
  console.log('');

  // profileImage가 없는 캐릭터 조회 (또는 FORCE 시 전체)
  const characters = await prisma.character.findMany({
    where: FORCE ? {} : { OR: [{ profileImage: null }, { profileImage: '' }] },
    include: { work: { select: { title: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`대상 캐릭터: ${characters.length}명`);
  if (characters.length === 0) {
    console.log('생성할 캐릭터가 없습니다.');
    await prisma.$disconnect();
    return;
  }

  for (const char of characters) {
    console.log(`\n[${characters.indexOf(char) + 1}/${characters.length}] ${char.name} (작품: ${char.work.title})`);
    console.log(`  현재 이미지: ${char.profileImage || '없음'}`);

    if (DRY_RUN) {
      console.log(`  프롬프트: ${char.prompt.substring(0, 80)}...`);
      continue;
    }

    // 1. SD 프롬프트 추출
    console.log('  외형 추출 중...');
    const sdPrompt = await extractAppearancePrompt(char.name, char.prompt);
    console.log(`  SD 프롬프트: ${sdPrompt.substring(0, 80)}...`);

    // 2. 이미지 생성
    console.log('  이미지 생성 중...');
    const imageUrl = await generatePortrait(char.id, char.name, sdPrompt);

    if (!imageUrl) {
      console.log('  ❌ 실패 — 건너뜀');
      continue;
    }

    // 3. DB 업데이트
    await prisma.character.update({
      where: { id: char.id },
      data: { profileImage: imageUrl },
    });

    console.log(`  ✅ 완료: ${imageUrl}`);

    // API 부하 방지 딜레이 (무료 계정 레이트 리밋: 분당 6회)
    await new Promise(r => setTimeout(r, 12000));
  }

  console.log('\n=== 완료 ===');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('스크립트 오류:', e);
  prisma.$disconnect();
  process.exit(1);
});
