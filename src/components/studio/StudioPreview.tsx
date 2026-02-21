'use client';

import {
  parseOpeningContent,
  formatPreviewText,
  getPreviewCharacterColor,
  type PreviewTurn,
} from '@/lib/preview-parser';
import MarkdownRenderer from '@/components/MarkdownRenderer';

// ─── 공통 타입 ───

interface Character {
  id: string;
  name: string;
  profileImage: string | null;
  prompt: string;
}

interface Opening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
}

interface LorebookEntry {
  id: string;
  name: string;
  keywords: string[];
  content: string;
}

// ─── 텍스트 포맷 렌더러 ───

function FormattedText({ text }: { text: string }) {
  const parts = formatPreviewText(text);
  return (
    <>
      {parts.map((p, i) =>
        p.italic ? (
          <span key={i} className="italic text-gray-500 dark:text-gray-400">{p.text}</span>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </>
  );
}

// ─── 오프닝 채팅 프리뷰 (탭 + 모달 공용) ───

export function OpeningPreview({
  content,
  characterNames,
}: {
  content: string;
  characterNames: string[];
}) {
  const turns = parseOpeningContent(content, characterNames);

  if (turns.length === 0) {
    return (
      <div className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
        오프닝 내용을 입력하면 미리보기가 표시됩니다
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {turns.map((turn, i) => (
        <TurnBubble key={i} turn={turn} characterNames={characterNames} />
      ))}
    </div>
  );
}

function TurnBubble({ turn, characterNames }: { turn: PreviewTurn; characterNames: string[] }) {
  if (turn.type === 'system') {
    return (
      <div className="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 rounded-xl p-3 text-center border border-primary-200 dark:border-primary-800">
        <MarkdownRenderer content={turn.content} className="text-sm text-center" />
      </div>
    );
  }

  if (turn.type === 'narrator') {
    return (
      <div className="bg-gray-200 dark:bg-gray-700/50 rounded-xl p-3">
        <div className="text-center italic">
          <MarkdownRenderer content={turn.content} className="text-sm" />
        </div>
      </div>
    );
  }

  // dialogue
  const colorClass = getPreviewCharacterColor(turn.characterName, characterNames);
  return (
    <div className="flex items-start gap-2">
      <div className={`w-8 h-8 rounded-full ${colorClass} flex-shrink-0 flex items-center justify-center`}>
        <span className="text-xs font-bold text-white">{turn.characterName[0] || '?'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5">
          {turn.characterName}
          {turn.emotion !== 'neutral' && (
            <span className="ml-1 text-gray-400">({turn.emotion})</span>
          )}
        </p>
        <div className="bg-white dark:bg-gray-800 rounded-xl rounded-tl-sm px-3 py-2 shadow-sm">
          <MarkdownRenderer content={turn.content} className="text-sm" />
        </div>
      </div>
    </div>
  );
}

// ─── 캐릭터 프리뷰 (모달용) ───

export function CharacterPreview({
  name,
  image,
  prompt,
}: {
  name: string;
  image: string | null;
  prompt: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center overflow-hidden">
          {image ? (
            <img src={image} alt={name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-lg font-bold text-white">{name?.[0] || '?'}</span>
          )}
        </div>
        <h4 className="font-semibold text-gray-900 dark:text-white">
          {name || '캐릭터 이름'}
        </h4>
      </div>
      <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">프롬프트 미리보기</p>
        {prompt ? (
          <div className="max-h-48 overflow-y-auto">
            <MarkdownRenderer content={prompt} className="text-sm" />
          </div>
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500">캐릭터 프롬프트를 입력하면 미리보기가 표시됩니다</p>
        )}
      </div>
    </div>
  );
}

// ─── 로어북 프리뷰 (모달용) ───

export function LorebookPreview({
  name,
  keywords,
  content,
}: {
  name: string;
  keywords: string[];
  content: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
        {name || '로어북 항목'}
      </h4>
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {keywords.map((kw, i) => (
            <span key={i} className="px-2 py-0.5 text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
              {kw}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap line-clamp-8">
        {content || '내용을 입력하면 미리보기가 표시됩니다'}
      </p>
    </div>
  );
}

// ─── 메인 탭 프리뷰 패널 ───

interface StudioPreviewProps {
  activeTab: string;
  title: string;
  description: string;
  tags: string[];
  worldSetting: string;
  characters: Character[];
  openings: Opening[];
  lorebook: LorebookEntry[];
  thumbnail?: string | null;
  useCustomRelConfig?: boolean;
  maxHeight?: string;
}

export default function StudioPreview({
  activeTab,
  title,
  description,
  tags,
  worldSetting,
  characters,
  openings,
  lorebook,
  thumbnail,
  maxHeight,
}: StudioPreviewProps) {
  return (
    <div
      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col"
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">미리보기</h3>
      </div>

      <div className="p-4 overflow-y-auto flex-1 min-h-0">
        {activeTab === 'info' && (
          <InfoPreview
            title={title}
            description={description}
            tags={tags}
            characters={characters}
            thumbnail={thumbnail}
          />
        )}

        {activeTab === 'worldsetting' && (
          <WorldSettingPreview worldSetting={worldSetting} />
        )}

        {activeTab === 'characters' && (
          <CharactersListPreview characters={characters} />
        )}

        {activeTab === 'openings' && (
          <OpeningsPreview openings={openings} characterNames={characters.map(c => c.name)} />
        )}

        {activeTab === 'lorebook' && (
          <LorebookListPreview lorebook={lorebook} />
        )}
      </div>
    </div>
  );
}

// ─── 탭별 서브 프리뷰 ───

function InfoPreview({
  title, description, tags, characters, thumbnail,
}: {
  title: string; description: string; tags: string[];
  characters: Character[]; thumbnail?: string | null;
}) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">홈페이지에서 보이는 작품 카드</p>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md overflow-hidden max-w-[220px] mx-auto border border-gray-100 dark:border-gray-700">
        {/* Thumbnail */}
        <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative">
          {thumbnail ? (
            <img src={thumbnail} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          {/* Character avatars */}
          {characters.length > 0 && (
            <div className="absolute bottom-1.5 right-1.5 flex -space-x-1.5">
              {characters.slice(0, 3).map((char, i) => (
                <div key={char.id} className={`w-6 h-6 rounded-full border-2 border-white dark:border-gray-800 overflow-hidden flex items-center justify-center ${getPreviewCharacterColor(char.name, characters.map(c => c.name))}`}>
                  {char.profileImage ? (
                    <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-white">{char.name[0]}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Content */}
        <div className="p-2.5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-0.5 truncate">
            {title || '제목 없음'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-1.5">
            {description || '설명을 입력하세요'}
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorldSettingPreview({ worldSetting }: { worldSetting: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">세계관 설명</p>
      {worldSetting.trim() ? (
        <MarkdownRenderer content={worldSetting} className="text-sm" />
      ) : (
        <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
          세계관 설명을 입력하면 미리보기가 표시됩니다
        </p>
      )}
    </div>
  );
}

function CharactersListPreview({ characters }: { characters: Character[] }) {
  if (characters.length === 0) {
    return (
      <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
        캐릭터를 추가하면 미리보기가 표시됩니다
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-500">캐릭터 목록</p>
      {characters.map(char => (
        <CharacterPreview
          key={char.id}
          name={char.name}
          image={char.profileImage}
          prompt={char.prompt}
        />
      ))}
    </div>
  );
}

function OpeningsPreview({
  openings,
  characterNames,
}: {
  openings: Opening[];
  characterNames: string[];
}) {
  const defaultOpening = openings.find(o => o.isDefault) || openings[0];
  if (!defaultOpening) {
    return (
      <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
        오프닝을 추가하면 미리보기가 표시됩니다
      </p>
    );
  }
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
        기본 오프닝: {defaultOpening.title}
      </p>
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-3">
        <OpeningPreview content={defaultOpening.content} characterNames={characterNames} />
      </div>
    </div>
  );
}

function LorebookListPreview({ lorebook }: { lorebook: LorebookEntry[] }) {
  if (lorebook.length === 0) {
    return (
      <p className="text-center text-gray-400 dark:text-gray-500 text-sm py-8">
        로어북을 추가하면 미리보기가 표시됩니다
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-400 dark:text-gray-500">로어북 항목</p>
      {lorebook.map(entry => (
        <LorebookPreview
          key={entry.id}
          name={entry.name}
          keywords={entry.keywords}
          content={entry.content}
        />
      ))}
    </div>
  );
}
