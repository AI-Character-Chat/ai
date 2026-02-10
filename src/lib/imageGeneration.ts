/**
 * 이미지 생성 모듈
 *
 * 공식 문서: https://ai.google.dev/gemini-api/docs/image-generation
 *
 * 핵심 원칙 (공식 문서 기반):
 * 1. 최대 5개 인물 참조 이미지 지원
 * 2. 키워드 나열보다 서술형 묘사가 효과적
 * 3. 각 캐릭터를 명확히 구분하여 설명
 * 4. 프로필 없는 캐릭터는 실루엣/익명으로 표현
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { put } from '@vercel/blob';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import prisma from './prisma';

// Gemini API 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * 이미지 생성 모델
 * - gemini-2.5-flash-image: 빠르고 효율적 (안정)
 */
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const imageModel = genAI.getGenerativeModel({
  model: IMAGE_MODEL,
});

// ============================================
// 타입 정의
// ============================================
interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

interface CharacterProfile {
  name: string;
  profileImage: string | null;
}

interface CharacterInfo {
  name: string;
  dialogue?: string;
  description?: string;
  emotion?: {
    primary: string;
    intensity: number;
  };
}

// 감정 타입 → FACS 기반 시각적 묘사 매핑
const EMOTION_TO_VISUAL: Record<string, string> = {
  'neutral': 'relaxed face, neutral gaze, calm expression',
  'slight_smile': 'corners of mouth slightly raised, soft eyes',
  'smile': 'warm smile, relaxed eyes, friendly expression',
  'cold': 'COLD EXPRESSION: half-lidded eyes, lips pressed together, NO smile, stern gaze, emotionless face',
  'contempt': 'CONTEMPTUOUS EXPRESSION: one corner of mouth raised in sneer, narrowed eyes looking down, arrogant',
  'annoyed': 'ANNOYED EXPRESSION: furrowed brows, tight lips, irritated look',
  'angry': 'ANGRY EXPRESSION: furrowed brows, intense glare, clenched jaw, fierce eyes',
  'sad': 'SAD EXPRESSION: downturned mouth corners, drooping eyes, melancholic',
  'happy': 'HAPPY EXPRESSION: bright smile, crinkled eyes, joyful',
  'surprised': 'SURPRISED EXPRESSION: wide eyes, raised eyebrows, open mouth',
  'embarrassed': 'EMBARRASSED EXPRESSION: averted gaze, slight blush, shy look',
  'thinking': 'THINKING EXPRESSION: looking up or away, thoughtful gaze, slight frown',
};

// ============================================
// 유틸리티 함수
// ============================================

/**
 * 이미지를 Base64로 변환 (원격 URL 및 로컬 파일 모두 지원)
 */
async function imageToBase64(imagePath: string): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // 원격 URL (Vercel Blob Storage 등)
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      const response = await fetch(imagePath);
      if (!response.ok) {
        console.error('이미지 다운로드 실패:', imagePath, response.status);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      const mimeType = contentType.includes('png') ? 'image/png' : 'image/jpeg';
      return { base64: buffer.toString('base64'), mimeType };
    }

    // 로컬 파일 (개발 환경 / 레거시)
    const fullPath = imagePath.startsWith('/')
      ? path.join(process.cwd(), 'public', imagePath)
      : imagePath;

    if (!fs.existsSync(fullPath)) {
      console.error('이미지 파일 없음:', fullPath);
      return null;
    }

    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

    return { base64: buffer.toString('base64'), mimeType };
  } catch (error) {
    console.error('이미지 변환 실패:', error);
    return null;
  }
}

/**
 * Base64 이미지를 Vercel Blob Storage에 저장
 */
async function saveBase64Image(base64Data: string, mimeType: string): Promise<string> {
  const ext = mimeType.includes('png') ? 'png' : 'jpg';
  const fileName = `uploads/generated-${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

  const buffer = Buffer.from(base64Data, 'base64');

  // Vercel Blob Storage 사용 가능 시
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(fileName, buffer, {
      access: 'public',
      addRandomSuffix: false,
      contentType: mimeType,
    });
    return blob.url;
  }

  // 폴백: 로컬 파일시스템 (개발 환경)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, fileName.replace('uploads/', ''));
  fs.writeFileSync(filePath, buffer);
  return `/${fileName}`;
}

// ============================================
// 이미지 캐시 함수
// ============================================

/**
 * 프롬프트 해시 생성 (SHA-256, 32자)
 */
function generatePromptHash(narratorText: string, characterNames: string[]): string {
  const content = `${narratorText.trim()}|${characterNames.sort().join(',')}`;
  return crypto.createHash('sha256').update(content).digest('hex').substring(0, 32);
}

/**
 * 캐시된 이미지 조회
 */
async function getCachedImage(characterKey: string, promptHash: string): Promise<string | null> {
  try {
    const cached = await prisma.generatedImageCache.findUnique({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
    });

    if (cached && cached.expiresAt > new Date()) {
      return cached.imageUrl;
    }

    // 만료된 캐시 삭제
    if (cached) {
      await prisma.generatedImageCache.delete({ where: { id: cached.id } }).catch(() => {});
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * 생성된 이미지를 캐시에 저장 (7일 TTL)
 */
async function cacheGeneratedImage(
  characterKey: string,
  promptHash: string,
  imageUrl: string,
  imagePrompt: string
): Promise<void> {
  try {
    const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7일
    await prisma.generatedImageCache.upsert({
      where: { characterId_promptHash: { characterId: characterKey, promptHash } },
      create: {
        characterId: characterKey,
        promptHash,
        imageUrl,
        imagePrompt: imagePrompt.substring(0, 2000),
        expiresAt: new Date(Date.now() + CACHE_TTL),
      },
      update: {
        imageUrl,
        imagePrompt: imagePrompt.substring(0, 2000),
        expiresAt: new Date(Date.now() + CACHE_TTL),
      },
    });
  } catch (error) {
    console.error('[ImageCache] 저장 실패:', error);
  }
}

// ============================================
// 메인 이미지 생성 함수
// ============================================

/**
 * Gemini 이미지 생성 (개선된 버전)
 *
 * 공식 문서 기반 최적화:
 * 1. 프로필 있는 캐릭터: 참조 이미지로 정확히 재현
 * 2. 프로필 없는 캐릭터: 실루엣/뒷모습/익명으로 표현
 * 3. 서술형 프롬프트로 장면 묘사
 * 4. 캐릭터별 대사와 감정 반영
 *
 * @param narratorText - 나레이션 텍스트 (상황 묘사)
 * @param characterProfiles - 등장 캐릭터들의 프로필
 * @param characterDialogues - 캐릭터별 대사 (선택)
 * @returns 이미지 생성 결과
 */
export async function generateSceneImage(
  narratorText: string,
  characterProfiles: CharacterProfile[],
  characterDialogues?: CharacterInfo[]
): Promise<ImageGenerationResult> {
  try {
    // 캐시 확인
    const characterNames = characterProfiles.map(c => c.name);
    const promptHash = generatePromptHash(narratorText, characterNames);
    const characterKey = characterNames.sort().join('-').substring(0, 50) || 'scene';

    const cachedUrl = await getCachedImage(characterKey, promptHash);
    if (cachedUrl) {
      console.log('🎨 [캐시 히트] 기존 이미지 사용:', cachedUrl);
      return { success: true, imageUrl: cachedUrl };
    }

    console.log('');
    console.log('🎨 ========================================');
    console.log(`🎨 Gemini 이미지 생성 (${IMAGE_MODEL})`);
    console.log('🎨 ========================================');
    console.log('📝 나레이션:', narratorText.substring(0, 100) + '...');
    console.log('👥 전체 캐릭터 수:', characterProfiles.length);

    // 캐릭터 분류
    const charsWithProfile = characterProfiles.filter(c => c.profileImage).slice(0, 5);
    const charsWithoutProfile = characterProfiles.filter(c => !c.profileImage);

    console.log('✅ 프로필 있음:', charsWithProfile.map(c => c.name).join(', ') || '없음');
    console.log('👤 프로필 없음 (실루엣):', charsWithoutProfile.map(c => c.name).join(', ') || '없음');

    // 참조 이미지 준비 (프로필 있는 캐릭터만)
    const referenceImages: Array<{ inlineData: { data: string; mimeType: string } }> = [];
    const loadedCharacters: { name: string; refIndex: number }[] = [];

    for (let i = 0; i < charsWithProfile.length; i++) {
      const char = charsWithProfile[i];
      if (char.profileImage) {
        const imageData = await imageToBase64(char.profileImage);
        if (imageData) {
          referenceImages.push({
            inlineData: {
              data: imageData.base64,
              mimeType: imageData.mimeType,
            },
          });
          loadedCharacters.push({ name: char.name, refIndex: referenceImages.length });
          console.log(`✅ [참조 ${referenceImages.length}] ${char.name} 로드 완료`);
        }
      }
    }

    // 대사에서 감정 추출 로그 (디버깅용)
    if (characterDialogues && characterDialogues.length > 0) {
      console.log('🎭 캐릭터별 감정 추출:');
      for (const d of characterDialogues) {
        const emotion = extractEmotion(d.dialogue || '');
        console.log(`   - ${d.name}: ${emotion || '(감정 없음)'}`);
        console.log(`     대사 일부: "${(d.dialogue || '').substring(0, 80)}..."`);
      }
    }

    // 프롬프트 구성 (공식 문서 권장: 서술형 묘사)
    const prompt = buildNarrativePrompt(
      narratorText,
      loadedCharacters,
      charsWithoutProfile,
      characterDialogues
    );

    console.log('📤 Gemini API 요청 중...');
    console.log('📋 참조 이미지 수:', referenceImages.length);
    console.log('📋 익명 캐릭터 수:', charsWithoutProfile.length);
    console.log('📋 프롬프트 미리보기 (처음 500자):');
    console.log(prompt.substring(0, 500) + '...');

    // API 호출 구성
    const parts: any[] = [];

    // 참조 이미지가 있으면 먼저 배치
    if (referenceImages.length > 0) {
      parts.push(...referenceImages.map(img => ({ inlineData: img.inlineData })));
    }

    // 텍스트 프롬프트
    parts.push({ text: prompt });

    // generateContent 호출
    const result = await imageModel.generateContent({
      contents: [{ role: 'user', parts }] as any,
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
      } as any,
    });

    const response = result.response;
    const candidates = response.candidates;

    if (!candidates || candidates.length === 0) {
      console.error('❌ 응답 없음');
      return { success: false, error: '이미지 생성 응답 없음' };
    }

    // 응답 처리
    const responseParts = candidates[0].content?.parts || [];

    // 텍스트 응답 로깅
    for (const part of responseParts) {
      const textPart = part as { text?: string };
      if (textPart.text) {
        console.log('📝 AI 응답:', textPart.text.substring(0, 100));
      }
    }

    // 이미지 추출
    for (const part of responseParts) {
      const inlineData = (part as { inlineData?: { data: string; mimeType: string } }).inlineData;
      if (inlineData) {
        const imageUrl = await saveBase64Image(inlineData.data, inlineData.mimeType);

        console.log('');
        console.log('✅ ========================================');
        console.log('✅ 이미지 생성 완료!');
        console.log('✅ ========================================');
        console.log('🖼️ URL:', imageUrl);

        // 캐시에 저장 (비동기, 실패해도 무시)
        cacheGeneratedImage(characterKey, promptHash, imageUrl, prompt).catch(() => {});

        return { success: true, imageUrl };
      }
    }

    console.error('❌ 응답에 이미지 없음');
    return { success: false, error: '응답에 이미지가 포함되지 않음' };

  } catch (error) {
    console.error('❌ 이미지 생성 에러:', error);
    // 상세 에러 정보 출력
    if (error instanceof Error) {
      console.error('에러 이름:', error.name);
      console.error('에러 메시지:', error.message);
      console.error('에러 스택:', error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * 서술형 프롬프트 생성
 *
 * 공식 문서 권장사항:
 * - "Describe the scene, don't just list keywords"
 * - 각 캐릭터를 명확히 구분하여 설명
 * - 상호작용과 감정을 포함
 *
 * 중요 규칙:
 * - "당신", "너", "you" = 유저/플레이어 (등장하지 않거나 1인칭 시점)
 * - 행동 묘사를 정확히 반영 (결박, 포옹, 싸움 등)
 */
function buildNarrativePrompt(
  narratorText: string,
  loadedCharacters: { name: string; refIndex: number }[],
  anonymousCharacters: CharacterProfile[],
  dialogues?: CharacterInfo[]
): string {
  // 나레이션에서 행동/상황 키워드 추출
  const actionContext = extractActionContext(narratorText);

  // "당신" 관련 처리 - 유저는 이미지에 등장하지 않음 (1인칭 시점)
  const hasUserReference = /당신|너의|너를|너는|you|your/i.test(narratorText);
  const userPerspectiveNote = hasUserReference
    ? `\n⚠️ "당신/you/너" = VIEWER (first-person POV). Do NOT draw an extra character for viewer.`
    : '';

  // 캐릭터별 표정 지시 수집 (프롬프트 최상단에 배치할 용도)
  const expressionInstructions: string[] = [];
  const negativeInstructions: string[] = [];

  // 부정적 감정 타입 목록
  const NEGATIVE_EMOTIONS = ['cold', 'contempt', 'annoyed', 'angry'];

  // 캐릭터 참조 설명 (프로필 있는 캐릭터)
  const characterRefSection = loadedCharacters.length > 0
    ? loadedCharacters.map(c => {
      const dialogue = dialogues?.find(d =>
        d.name.includes(c.name.split(' ')[0]) ||
        c.name.includes(d.name.split(' ')[0])
      );

      // 1순위: AI가 분석한 emotion 태그 사용 (FACS 기반 시각 묘사로 변환)
      // 2순위: 대사 텍스트에서 키워드 추출 (폴백)
      let visualExpression = '';
      let isNegativeEmotion = false;

      if (dialogue?.emotion) {
        const emotionType = dialogue.emotion.primary;
        visualExpression = EMOTION_TO_VISUAL[emotionType] || EMOTION_TO_VISUAL['neutral'];
        isNegativeEmotion = NEGATIVE_EMOTIONS.includes(emotionType);

        console.log(`   🎭 ${c.name}: AI 감정 태그 사용 → ${emotionType} (${dialogue.emotion.intensity})`);
      } else if (dialogue?.dialogue) {
        // 폴백: 텍스트에서 감정 추출
        visualExpression = extractEmotion(dialogue.dialogue);
        isNegativeEmotion = /cold|icy|angry|furious|hostile|arrogant|contempt|mocking/i.test(visualExpression);

        console.log(`   🎭 ${c.name}: 텍스트 분석 폴백 → ${visualExpression}`);
      }

      const characterAction = extractCharacterAction(narratorText, c.name);

      // 표정 지시 수집
      if (visualExpression) {
        if (isNegativeEmotion) {
          expressionInstructions.push(`"${c.name}": ${visualExpression}`);
          negativeInstructions.push(`${c.name} must NOT smile or look warm/friendly`);
        } else {
          expressionInstructions.push(`"${c.name}": ${visualExpression}`);
        }
      }

      return `[Image ${c.refIndex}] = "${c.name}"${visualExpression ? ` → ${visualExpression}` : ''}${characterAction ? ` → Action: ${characterAction}` : ''}`;
    }).join('\n')
    : '';

  // 익명 캐릭터 설명 (프로필 없는 캐릭터)
  const anonymousSection = anonymousCharacters.length > 0
    ? anonymousCharacters.map(c => {
      const dialogue = dialogues?.find(d =>
        d.name.includes(c.name.split(' ')[0]) ||
        c.name.includes(d.name.split(' ')[0])
      );
      const characterAction = extractCharacterAction(narratorText, c.name);

      let bodyLanguage = '';
      if (dialogue?.emotion) {
        const emotionType = dialogue.emotion.primary;
        bodyLanguage = EMOTION_TO_VISUAL[emotionType] || '';
      } else if (dialogue?.dialogue) {
        bodyLanguage = extractEmotion(dialogue.dialogue);
      }

      return `"${c.name}" = silhouette/back view (no face)${bodyLanguage ? `, body language: ${bodyLanguage}` : ''}${characterAction ? `, action: ${characterAction}` : ''}`;
    }).join('\n')
    : '';

  // 총 캐릭터 수 계산 (유저는 제외)
  const totalCharacters = loadedCharacters.length + anonymousCharacters.length;

  // 프롬프트를 단순하고 직접적으로 구성 (Gemini 이미지 모델 최적화)
  // 복잡한 지시보다 짧고 명확한 지시가 효과적

  // 캐릭터별 한 줄 요약 생성
  const characterSummaries = loadedCharacters.map(c => {
    const dialogue = dialogues?.find(d =>
      d.name.includes(c.name.split(' ')[0]) ||
      c.name.includes(d.name.split(' ')[0])
    );

    let expressionWord = 'neutral';
    if (dialogue?.emotion) {
      const emotionType = dialogue.emotion.primary;
      // 간단한 영어 단어로 변환
      const simpleEmotions: Record<string, string> = {
        'cold': 'cold stern',
        'contempt': 'contemptuous sneering',
        'angry': 'angry fierce',
        'annoyed': 'annoyed irritated',
        'sad': 'sad melancholic',
        'happy': 'happy smiling',
        'smile': 'gentle smile',
        'slight_smile': 'slight smile',
        'surprised': 'surprised',
        'embarrassed': 'embarrassed blushing',
        'thinking': 'thoughtful',
        'neutral': 'neutral calm',
      };
      expressionWord = simpleEmotions[emotionType] || 'neutral';
    }

    return `Person ${c.refIndex} from reference image ${c.refIndex} with ${expressionWord} expression`;
  }).join('. ');

  // 부정적 표정 캐릭터 명시
  const noSmileChars = loadedCharacters
    .filter(c => {
      const dialogue = dialogues?.find(d =>
        d.name.includes(c.name.split(' ')[0]) ||
        c.name.includes(d.name.split(' ')[0])
      );
      return dialogue?.emotion && ['cold', 'contempt', 'angry', 'annoyed'].includes(dialogue.emotion.primary);
    })
    .map(c => `Person ${c.refIndex}`)
    .join(', ');

  // 최종 프롬프트 - 간결하게!
  return `High quality anime illustration, cinematic lighting, 16:9 aspect ratio.

Scene: ${narratorText.substring(0, 300)}

Characters: ${characterSummaries}
${anonymousCharacters.length > 0 ? `\nAlso include ${anonymousCharacters.length} dark silhouette figure(s) with no visible face.` : ''}

${noSmileChars ? `IMPORTANT: ${noSmileChars} must have COLD/STERN expression, NOT smiling, NOT friendly looking.` : ''}
${hasUserReference ? '\nNote: Draw from first-person perspective, do not include the viewer as a character.' : ''}

Style: Detailed anime art, each character must exactly match their reference image appearance.`;
}

/**
 * 나레이션에서 주요 행동/상황 키워드 추출
 */
function extractActionContext(narratorText: string): string {
  const actionKeywords: { [key: string]: string } = {
    // 구속/제한
    '결박': 'character is being tied/bound with restraints',
    '묶': 'character is being tied up',
    '속박': 'character is restrained/bound',
    '포박': 'character is captured and bound',

    // 신체 접촉
    '움켜쥐': 'grabbing/seizing action',
    '잡아': 'grabbing/holding',
    '끌고': 'dragging/pulling someone',
    '밀어': 'pushing someone',
    '던지': 'throwing action',

    // 위치/자세
    '침대': 'on/near a bed',
    '바닥': 'on the floor',
    '무릎': 'kneeling position',
    '누워': 'lying down',
    '앉아': 'sitting',

    // 감정/상태
    '무력': 'helpless/powerless state',
    '포로': 'captive/prisoner',
    '저항': 'resisting/struggling',
    '굳어': 'frozen/stiff',
  };

  const foundActions: string[] = [];
  for (const [korean, english] of Object.entries(actionKeywords)) {
    if (narratorText.includes(korean)) {
      foundActions.push(english);
    }
  }

  return foundActions.join(', ');
}

/**
 * 특정 캐릭터에 대한 행동 설명 추출
 */
function extractCharacterAction(narratorText: string, characterName: string): string {
  // 캐릭터 이름 (괄호 전 이름)
  const shortName = characterName.split(' ')[0];

  // 캐릭터 이름 주변의 행동 패턴 찾기
  const patterns = [
    // "카이의 가죽 재킷을 움켜쥔" 패턴
    new RegExp(`${shortName}[의을를가]?[^.]*?(결박|묶|잡|움켜|끌|밀|눕|앉)`, 'i'),
    // "그를 침대로 끌고 가" 패턴 (대명사)
    new RegExp(`(그|그녀|그를|그녀를)[^.]*?${shortName}`, 'i'),
    // "카이는 ... 하고 있" 패턴
    new RegExp(`${shortName}[은는이가][^.]*?(있|했|되|당)`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = narratorText.match(pattern);
    if (match) {
      // 행동 키워드에 따른 설명
      if (narratorText.includes('결박') || narratorText.includes('묶')) {
        return 'being restrained/tied to bed frame, arms and legs bound';
      }
      if (narratorText.includes('무력') || narratorText.includes('포로')) {
        return 'helpless, captive state, unable to move';
      }
      if (narratorText.includes('굳어')) {
        return 'frozen in place, stiff body';
      }
    }
  }

  return '';
}

/**
 * 대사에서 감정/행동/표정 힌트 추출 (개선 버전)
 *
 * 캐릭터 대사에는 다음이 포함됨:
 * 1. 직접 대사 ("말이야")
 * 2. 행동/표정 묘사 (날카롭고 차가운 목소리, 오만한 시선 등)
 *
 * 이 함수는 두 가지 모두에서 감정/행동 힌트를 추출함
 */
function extractEmotion(dialogue: string): string {
  const hints: string[] = [];
  let isNegativeEmotion = false;  // 부정적 감정 여부

  // 감정/표정 키워드 (부정적 감정에 [NEG] 태그)
  const emotionKeywords: { [key: string]: { text: string; negative: boolean } } = {
    // 부정적 감정 (이미지에서 웃으면 안됨!)
    '화': { text: 'angry face', negative: true },
    '분노': { text: 'furious/enraged', negative: true },
    '냉정': { text: 'COLD STOIC EXPRESSION (no smile)', negative: true },
    '차가': { text: 'COLD ICY EXPRESSION (no warmth)', negative: true },
    '날카로': { text: 'SHARP PIERCING GAZE', negative: true },
    '매섭': { text: 'FIERCE INTIMIDATING LOOK', negative: true },
    '오만': { text: 'ARROGANT HAUGHTY EXPRESSION', negative: true },
    '경멸': { text: 'CONTEMPTUOUS DISDAINFUL', negative: true },
    '비웃': { text: 'MOCKING SNEER (not friendly smile)', negative: true },
    '조롱': { text: 'MOCKING EXPRESSION', negative: true },
    '적대': { text: 'HOSTILE EXPRESSION', negative: true },
    '위협': { text: 'THREATENING LOOK', negative: true },
    '무표정': { text: 'EXPRESSIONLESS BLANK FACE', negative: true },
    '싸늘': { text: 'ICY COLD EXPRESSION', negative: true },
    '증오': { text: 'HATEFUL LOOK', negative: true },
    '짜증': { text: 'ANNOYED IRRITATED', negative: true },
    '불쾌': { text: 'DISPLEASED FACE', negative: true },
    '험악': { text: 'MENACING GRIM', negative: true },
    '냉소': { text: 'CYNICAL COLD SMILE', negative: true },
    '씁쓸': { text: 'BITTER EXPRESSION', negative: true },
    '불만': { text: 'DISPLEASED UNHAPPY', negative: true },
    '으르렁': { text: 'SNARLING GROWLING', negative: true },
    '노려': { text: 'GLARING FIERCELY', negative: true },
    '쏘아': { text: 'GLARING SHARPLY', negative: true },

    // 긍정적 감정 (웃어도 됨)
    '웃': { text: 'smiling', negative: false },
    '미소': { text: 'gentle smile', negative: false },
    '활짝': { text: 'bright smile', negative: false },
    '기쁨': { text: 'joyful', negative: false },
    '행복': { text: 'happy', negative: false },
    '온화': { text: 'gentle warm expression', negative: false },
    '부드러': { text: 'soft gentle expression', negative: false },
    '따뜻': { text: 'warm expression', negative: false },
    '친절': { text: 'kind expression', negative: false },

    // 슬픔/걱정
    '슬픔': { text: 'sad', negative: false },
    '눈물': { text: 'crying tearful', negative: false },
    '우울': { text: 'melancholy', negative: false },
    '걱정': { text: 'worried', negative: false },
    '근심': { text: 'anxious concerned', negative: false },

    // 놀람/두려움
    '놀라': { text: 'surprised', negative: false },
    '충격': { text: 'shocked', negative: false },
    '두려': { text: 'fearful', negative: false },
    '공포': { text: 'terrified', negative: false },
    '겁': { text: 'scared', negative: false },
    '떨': { text: 'trembling', negative: false },

    // 기타
    '흥분': { text: 'excited', negative: false },
    '당황': { text: 'embarrassed flustered', negative: false },
    '부끄': { text: 'shy blushing', negative: false },
    '의심': { text: 'suspicious doubtful', negative: false },
    '호기심': { text: 'curious', negative: false },
    '진지': { text: 'serious', negative: true },
    '단호': { text: 'resolute determined', negative: true },
    '자신감': { text: 'confident', negative: false },
    '거만': { text: 'ARROGANT PROUD', negative: true },
  };

  // 행동/자세 키워드
  const actionKeywords: { [key: string]: string } = {
    '팔짱': 'arms crossed',
    '내려다': 'looking down at',
    '올려다': 'looking up at',
    '응시': 'staring intently',
    '치켜올': 'raised eyebrows',
    '찡그': 'frowning',
    '눈썹': 'eyebrows furrowed',
    '고개를 끄덕': 'nodding',
    '고개를 젓': 'shaking head',
    '어깨를 으쓱': 'shrugging',
    '다가오': 'approaching',
    '다가서': 'stepping closer',
    '밀치': 'pushing aside',
    '가로막': 'blocking',
    '손을 뻗': 'reaching out hand',
    '손짓': 'gesturing',
    '가리키': 'pointing',
  };

  // 감정 키워드 체크
  for (const [korean, data] of Object.entries(emotionKeywords)) {
    if (dialogue.includes(korean)) {
      hints.push(data.text);
      if (data.negative) {
        isNegativeEmotion = true;
      }
    }
  }

  // 행동 키워드 체크
  for (const [korean, english] of Object.entries(actionKeywords)) {
    if (dialogue.includes(korean)) {
      hints.push(english);
    }
  }

  // 문장부호 기반 추론
  if (hints.length === 0) {
    if (dialogue.includes('!')) hints.push('intense emotion');
    if (dialogue.includes('?')) hints.push('questioning');
    if (dialogue.includes('...')) hints.push('hesitant/thoughtful');
  }

  // 중복 제거 후 결합
  const uniqueHints = Array.from(new Set(hints));
  let result = uniqueHints.slice(0, 4).join(', '); // 최대 4개

  // 부정적 감정일 경우 명시적으로 "웃지 말것" 추가
  if (isNegativeEmotion) {
    result += ' [DO NOT SMILE]';
  }

  return result;
}
