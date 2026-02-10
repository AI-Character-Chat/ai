'use client';

import { useCallback, RefObject } from 'react';
import type { ChatWork, ChatMessage, ChatCharacter } from './useChatReducer';

interface ChatMessagesProps {
  messages: ChatMessage[];
  work: ChatWork;
  sending: boolean;
  generatingImages: Set<string>;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

function getCharacterColor(characterId: string | null, characters: ChatCharacter[]) {
  if (!characterId) return 'bg-gray-200 dark:bg-gray-700';
  const index = characters.findIndex(c => c.id === characterId);
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'];
  return colors[index % colors.length];
}

function formatMessage(text: string) {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <span key={index} className="italic text-gray-500 dark:text-gray-400">
          {part.slice(1, -1)}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export default function ChatMessages({
  messages,
  work,
  sending,
  generatingImages,
  sidebarOpen,
  sidebarCollapsed,
  messagesEndRef,
}: ChatMessagesProps) {
  const sidebarMargin = sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : '';

  return (
    <main className={`flex-1 overflow-y-auto pt-[120px] transition-all duration-300 ${sidebarMargin}`}>
      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {messages.map(message => {
          const { messageType } = message;
          const character = message.character;

          if (messageType === 'system') {
            return (
              <div key={message.id} className="bg-gradient-to-r from-primary-100 to-purple-100 dark:from-primary-900/30 dark:to-purple-900/30 rounded-xl p-4 text-center animate-fade-in-up border border-primary-200 dark:border-primary-800">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{formatMessage(message.content)}</p>
              </div>
            );
          }

          if (messageType === 'narrator') {
            const isGeneratingSceneImage = generatingImages.has(message.id);
            return (
              <div key={message.id} className="bg-gray-200 dark:bg-gray-700/50 rounded-xl p-4 animate-fade-in-up">
                {message.generatedImageUrl && (
                  <div className="mb-3 -mx-2 -mt-2">
                    <img src={message.generatedImageUrl} alt="상황 이미지" className="w-full rounded-xl" loading="lazy" />
                  </div>
                )}
                {isGeneratingSceneImage && !message.generatedImageUrl && (
                  <div className="mb-3 -mx-2 -mt-2 bg-gray-100 dark:bg-gray-600 rounded-xl p-8 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span className="text-sm">상황 이미지 생성 중...</span>
                    </div>
                  </div>
                )}
                <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap leading-relaxed italic text-center">{formatMessage(message.content)}</p>
              </div>
            );
          }

          if (messageType === 'user') {
            return (
              <div key={message.id} className="flex justify-end animate-fade-in-up">
                <div className="max-w-[80%] bg-primary-600 text-white rounded-2xl rounded-tr-sm px-4 py-2">
                  <p className="whitespace-pre-wrap">{message.content}</p>
                </div>
              </div>
            );
          }

          const isGeneratingImage = generatingImages.has(message.id);
          return (
            <div key={message.id} className="flex items-start gap-3 animate-fade-in-up">
              <div className={`w-10 h-10 rounded-full ${getCharacterColor(message.characterId, work.characters)} flex-shrink-0 flex items-center justify-center overflow-hidden`}>
                {character?.profileImage ? (
                  <img src={character.profileImage} alt={character.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-white">{character?.name?.[0] || '?'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{character?.name || '알 수 없음'}</p>
                <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-2 shadow-sm">
                  {message.generatedImageUrl && (
                    <div className="mb-3 -mx-2 -mt-1">
                      <img src={message.generatedImageUrl} alt="상황 이미지" className="w-full rounded-xl" loading="lazy" />
                    </div>
                  )}
                  {isGeneratingImage && !message.generatedImageUrl && (
                    <div className="mb-3 -mx-2 -mt-1 bg-gray-100 dark:bg-gray-700 rounded-xl p-4 flex items-center justify-center">
                      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="text-sm">이미지 생성 중...</span>
                      </div>
                    </div>
                  )}
                  <p className="text-gray-900 dark:text-white whitespace-pre-wrap leading-relaxed">{formatMessage(message.content)}</p>
                </div>
              </div>
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-3 animate-fade-in-up">
            <div className="w-10 h-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-gray-500 dark:text-gray-400 text-sm">캐릭터들이 반응 중...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </main>
  );
}
