/**
 * 스튜디오 프리뷰용 콘텐츠 파서
 * gemini.ts의 markdown fallback parser를 참고한 클라이언트용 경량 파서
 */

export interface PreviewTurn {
  type: 'narrator' | 'dialogue' | 'system';
  characterName: string;
  emotion: string;
  content: string;
}

/**
 * 오프닝 콘텐츠를 파싱하여 채팅 프리뷰용 턴 배열로 변환
 * 지원 태그: [나레이션], [캐릭터|표정], [장면] (무시)
 * 태그 없는 텍스트 → system 메시지
 */
export function parseOpeningContent(
  text: string,
  characterNames: string[],
): PreviewTurn[] {
  if (!text.trim()) return [];

  const turns: PreviewTurn[] = [];

  // 태그 패턴: [태그명] 또는 [태그명|옵션]
  const tagPattern = /\[([^\]]+)\]/g;
  const hasAnyTag = tagPattern.test(text);

  // 태그가 하나도 없으면 전체를 system 메시지로
  if (!hasAnyTag) {
    return [{ type: 'system', characterName: '', emotion: '', content: text.trim() }];
  }

  // 태그 기준으로 분할
  const segments = text.split(/(\[[^\]]+\])/g).filter(Boolean);

  let currentTag: { name: string; emotion: string } | null = null;

  for (const segment of segments) {
    const tagMatch = segment.match(/^\[([^\]]+)\]$/);

    if (tagMatch) {
      const tagContent = tagMatch[1];
      const parts = tagContent.split('|').map(s => s.trim());
      const tagName = parts[0];
      const tagEmotion = parts[1] || 'neutral';

      // [장면] 무시
      if (['장면', 'scene'].includes(tagName.toLowerCase())) {
        currentTag = null;
        continue;
      }

      // [나레이션]
      if (tagName === '나레이션') {
        currentTag = { name: '나레이션', emotion: 'neutral' };
        continue;
      }

      // [캐릭터|표정] — 캐릭터 이름 매칭
      const matched = characterNames.find(
        cn => cn === tagName || cn.includes(tagName) || tagName.includes(cn)
      );
      currentTag = { name: matched || tagName, emotion: tagEmotion };
      continue;
    }

    // 태그가 아닌 텍스트
    const content = segment.trim();
    if (!content) continue;

    if (!currentTag) {
      // 태그 이전의 텍스트 → system
      turns.push({ type: 'system', characterName: '', emotion: '', content });
    } else if (currentTag.name === '나레이션') {
      turns.push({ type: 'narrator', characterName: '', emotion: 'neutral', content });
      currentTag = null;
    } else {
      turns.push({
        type: 'dialogue',
        characterName: currentTag.name,
        emotion: currentTag.emotion,
        content,
      });
      currentTag = null;
    }
  }

  return turns;
}

/**
 * *텍스트* 를 이탤릭 span으로 변환 (ChatMessages.tsx의 formatMessage와 동일 패턴)
 */
export function formatPreviewText(text: string): Array<{ text: string; italic: boolean }> {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts
    .filter(Boolean)
    .map(part => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return { text: part.slice(1, -1), italic: true };
      }
      return { text: part, italic: false };
    });
}

/** 캐릭터 색상 배열 (ChatMessages.tsx 동일) */
export const CHARACTER_COLORS = [
  'bg-blue-500', 'bg-purple-500', 'bg-pink-500',
  'bg-orange-500', 'bg-teal-500', 'bg-indigo-500',
];

export function getPreviewCharacterColor(characterName: string, allNames: string[]): string {
  const index = allNames.indexOf(characterName);
  if (index < 0) return 'bg-gray-400';
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length];
}
