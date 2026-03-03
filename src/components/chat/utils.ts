// 채팅 공통 유틸리티

interface ChatCharacterLike {
  id: string;
  name: string;
}

const CHARACTER_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-indigo-500',
];

export function getCharacterColor(
  characterId: string | null,
  characters: ChatCharacterLike[]
): string {
  if (!characterId) return 'bg-gray-200 dark:bg-gray-700';
  const index = characters.findIndex((c) => c.id === characterId);
  return CHARACTER_COLORS[index % CHARACTER_COLORS.length];
}

// USD → KRW 환율 (Gemini API 비용 표시용, 업데이트 필요 시 여기서만 수정)
export const USD_TO_KRW = 1460;
