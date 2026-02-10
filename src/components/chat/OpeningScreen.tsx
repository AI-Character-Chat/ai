'use client';

import { useState } from 'react';
import Link from 'next/link';
import PersonaDropdown from '@/components/PersonaDropdown';
import PersonaModal from '@/components/PersonaModal';
import type { ChatWork, Persona } from './useChatReducer';

interface OpeningScreenProps {
  work: ChatWork;
  personas: Persona[];
  selectedPersona: Persona | null;
  isLoggedIn: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  onPersonaSelect: (persona: Persona) => void;
  onStart: (openingId: string | null) => void;
  onPersonasRefresh: () => void;
}

export default function OpeningScreen({
  work,
  personas,
  selectedPersona,
  isLoggedIn,
  sidebarOpen,
  sidebarCollapsed,
  onPersonaSelect,
  onStart,
  onPersonasRefresh,
}: OpeningScreenProps) {
  const [selectedOpening, setSelectedOpening] = useState<string | null>(
    work.openings.length === 1 ? work.openings[0].id : null
  );
  const [startingChat, setStartingChat] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);

  const sidebarMargin = sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : '';

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
        <div className={`min-h-screen flex flex-col items-center justify-center p-4 pt-20 transition-all duration-300 ${sidebarMargin}`}>
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white text-center">
              <h1 className="text-2xl font-bold">{work.title}</h1>
              <p className="text-violet-100 mt-1">{work.characters.length}명의 캐릭터와 대화하기</p>
            </div>
            <div className="p-8 text-center space-y-6">
              <div className="w-20 h-20 mx-auto bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">로그인이 필요합니다</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  캐릭터와의 대화를 시작하려면 로그인해주세요.<br/>대화 내용은 저장되어 언제든 이어갈 수 있습니다.
                </p>
              </div>
              <div className="space-y-3">
                <Link href="/login" className="block w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors">로그인하기</Link>
                <Link href="/login" className="block w-full py-3 border border-violet-600 text-violet-600 dark:text-violet-400 rounded-lg font-semibold hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors">회원가입하기</Link>
              </div>
            </div>
          </div>
          <Link href="/" className="mt-4 text-gray-400 hover:text-white transition-colors">← 목록으로 돌아가기</Link>
        </div>
      </div>
    );
  }

  const handleStart = async () => {
    setStartingChat(true);
    try {
      await onStart(selectedOpening);
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800">
      <div className={`min-h-screen flex flex-col items-center justify-center p-4 pt-20 transition-all duration-300 ${sidebarMargin}`}>
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 bg-gradient-to-r from-violet-600 to-purple-600 text-white">
            <h1 className="text-2xl font-bold">{work.title}</h1>
            <p className="text-violet-100 mt-1">{work.characters.length}명의 캐릭터와 대화하기</p>
          </div>

          <div className="p-6 space-y-6">
            {/* 페르소나 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">페르소나</label>
              <div className="space-y-2">
                <PersonaDropdown
                  personas={personas}
                  selectedPersona={selectedPersona}
                  onSelect={onPersonaSelect}
                  onManageClick={() => setPersonaModalOpen(true)}
                />
                {personas.length === 0 && (
                  <button onClick={() => setPersonaModalOpen(true)} className="text-sm text-violet-500 hover:text-violet-400">
                    + 페르소나 추가하기
                  </button>
                )}
              </div>
            </div>

            {/* 캐릭터 미리보기 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">등장 캐릭터</label>
              <div className="flex -space-x-3">
                {work.characters.map(char => (
                  <div key={char.id} className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-800 flex items-center justify-center overflow-hidden" title={char.name}>
                    {char.profileImage ? (
                      <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-lg font-bold text-gray-500">{char.name[0]}</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">{work.characters.map(c => c.name).join(', ')}</p>
            </div>

            {/* 오프닝 선택 */}
            {work.openings.length > 1 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">시작 상황 선택</label>
                <div className="space-y-2">
                  {work.openings.map(opening => (
                    <label
                      key={opening.id}
                      className={`block p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedOpening === opening.id
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                          : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div className="flex items-center">
                        <input type="radio" name="opening" value={opening.id} checked={selectedOpening === opening.id} onChange={() => setSelectedOpening(opening.id)} className="mr-3" />
                        <div>
                          <span className="font-medium text-gray-900 dark:text-white">{opening.title}</span>
                          {opening.isDefault && <span className="ml-2 text-xs text-violet-600">(기본)</span>}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 시작 버튼 */}
            <button
              onClick={handleStart}
              disabled={startingChat || (!selectedOpening && work.openings.length > 0)}
              className="w-full py-3 bg-violet-600 text-white rounded-lg font-semibold hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {startingChat ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  대화 준비 중...
                </>
              ) : (
                '대화 시작하기'
              )}
            </button>
          </div>
        </div>

        <Link href="/" className="mt-4 text-gray-400 hover:text-white transition-colors">← 목록으로 돌아가기</Link>
      </div>

      <PersonaModal
        isOpen={personaModalOpen}
        onClose={() => { setPersonaModalOpen(false); onPersonasRefresh(); }}
        onSelect={onPersonaSelect}
        selectedPersonaId={selectedPersona?.id}
        showSelectMode={true}
      />
    </div>
  );
}
