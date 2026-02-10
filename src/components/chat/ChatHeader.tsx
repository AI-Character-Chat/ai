'use client';

import { useState } from 'react';
import Link from 'next/link';
import PersonaModal from '@/components/PersonaModal';
import type { ChatWork, ChatSessionData, ChatCharacter, Persona } from './useChatReducer';

interface ChatHeaderProps {
  work: ChatWork;
  session: ChatSessionData;
  personas: Persona[];
  selectedPersona: Persona | null;
  chatMenuOpen: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  onMenuToggle: () => void;
  onPersonaSelect: (persona: Persona) => void;
  onPersonasRefresh: () => void;
}

function getCharacterColor(characterId: string | null, characters: ChatCharacter[]) {
  if (!characterId) return 'bg-gray-200 dark:bg-gray-700';
  const index = characters.findIndex(c => c.id === characterId);
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-teal-500', 'bg-indigo-500'];
  return colors[index % colors.length];
}

function getPresentCharacters(work: ChatWork, session: ChatSessionData): ChatCharacter[] {
  let presentCharacterNames: string[] = [];
  if (Array.isArray(session.presentCharacters)) {
    presentCharacterNames = session.presentCharacters;
  } else if (typeof session.presentCharacters === 'string') {
    try {
      const parsed = JSON.parse(session.presentCharacters);
      presentCharacterNames = Array.isArray(parsed) ? parsed : [];
    } catch { presentCharacterNames = []; }
  }
  return work.characters.filter(c =>
    presentCharacterNames.some(presentName =>
      c.name === presentName || c.name.includes(presentName) || presentName.includes(c.name) ||
      c.name.split(' ')[0] === presentName.split(' ')[0] ||
      c.name.split('(')[0].trim().includes(presentName) || presentName.includes(c.name.split('(')[0].trim())
    )
  );
}

export default function ChatHeader({
  work,
  session,
  personas,
  selectedPersona,
  chatMenuOpen,
  sidebarOpen,
  sidebarCollapsed,
  onMenuToggle,
  onPersonaSelect,
  onPersonasRefresh,
}: ChatHeaderProps) {
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const presentCharacters = getPresentCharacters(work, session);

  const sidebarLeft = sidebarOpen && !sidebarCollapsed ? 'lg:left-80' : sidebarOpen && sidebarCollapsed ? 'lg:left-16' : 'left-0';

  return (
    <>
      <div className={`bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700 fixed top-[64px] right-0 z-40 transition-all duration-300 ${sidebarLeft}`}>
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-white text-sm">{work.title}</h1>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>📍 {session.currentLocation}</span>
                  <span>•</span>
                  <span>🕐 {session.currentTime}</span>
                  <span>•</span>
                  <span>턴 {session.turnCount}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 hidden sm:block">함께하는 캐릭터:</span>
                <div className="flex -space-x-2">
                  {presentCharacters.map(char => (
                    <div
                      key={char.id}
                      className={`w-7 h-7 rounded-full ${getCharacterColor(char.id, work.characters)} border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden`}
                      title={char.name}
                    >
                      {char.profileImage ? (
                        <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs font-bold text-white">{char.name[0]}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 점3개 메뉴 */}
              <div className="relative">
                <button
                  onClick={onMenuToggle}
                  className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="6" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="18" r="2" />
                  </svg>
                </button>

                {chatMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={onMenuToggle} />
                    <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 min-w-[240px] overflow-hidden">
                      <div className="p-3">
                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          페르소나 선택
                        </div>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {personas.map(persona => (
                            <button
                              key={persona.id}
                              onClick={() => { onPersonaSelect(persona); onMenuToggle(); }}
                              className={`w-full px-3 py-2 text-left rounded-lg transition-colors ${
                                selectedPersona?.id === persona.id
                                  ? 'bg-violet-100 dark:bg-violet-900/30'
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${
                                    selectedPersona?.id === persona.id
                                      ? 'text-violet-600 dark:text-violet-400'
                                      : 'text-gray-900 dark:text-white'
                                  }`}>{persona.name}</span>
                                  {persona.isDefault && (
                                    <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">기본</span>
                                  )}
                                </div>
                                {selectedPersona?.id === persona.id && (
                                  <svg className="w-4 h-4 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                                  </svg>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => { onMenuToggle(); setPersonaModalOpen(true); }}
                          className="w-full mt-2 px-3 py-2 text-left text-sm text-violet-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          페르소나 관리
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <PersonaModal
        isOpen={personaModalOpen}
        onClose={() => { setPersonaModalOpen(false); onPersonasRefresh(); }}
        onSelect={onPersonaSelect}
        selectedPersonaId={selectedPersona?.id}
        showSelectMode={true}
      />
    </>
  );
}
