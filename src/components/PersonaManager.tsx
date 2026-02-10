'use client';

import { useState } from 'react';
import { usePersonas, getGenderText } from '@/hooks/usePersonas';
import PersonaFormModal from './PersonaFormModal';

interface PersonaManagerProps {
  onPersonaChange?: () => void;
}

export default function PersonaManager({ onPersonaChange }: PersonaManagerProps) {
  const {
    personas, loading, editingPersona,
    showForm, formData, formSubmitting,
    setFormData, openAddForm, openEditForm, closeForm, submitForm,
    deletePersona, setDefault,
  } = usePersonas();
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleSubmit = async () => {
    const ok = await submitForm();
    if (ok) onPersonaChange?.();
  };

  const handleDelete = async (id: string) => {
    const ok = await deletePersona(id);
    if (ok) onPersonaChange?.();
    setMenuOpenId(null);
  };

  const handleSetDefault = async (persona: Parameters<typeof setDefault>[0]) => {
    const ok = await setDefault(persona);
    if (ok) onPersonaChange?.();
    setMenuOpenId(null);
  };

  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          대화할 때 사용할 역할을 설정하세요. 기본 프로필은 크리에이터 이름으로도 사용됩니다.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
          </div>
        ) : personas.length === 0 ? (
          <div className="text-center py-8 bg-white dark:bg-gray-800 rounded-xl">
            <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <p className="text-gray-500 dark:text-gray-400 mb-4">아직 페르소나가 없습니다.</p>
            <button
              onClick={openAddForm}
              className="inline-flex items-center gap-2 px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              페르소나 추가
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {personas.map((persona) => (
              <div
                key={persona.id}
                className="relative p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 dark:text-white">{persona.name}</span>
                    {persona.isDefault && (
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">기본</span>
                    )}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === persona.id ? null : persona.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
                      </svg>
                    </button>
                    {menuOpenId === persona.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[140px]">
                          <button onClick={() => { openEditForm(persona); setMenuOpenId(null); }} className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">수정</button>
                          {!persona.isDefault && (
                            <button onClick={() => handleSetDefault(persona)} className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">기본 프로필로 설정</button>
                          )}
                          <button onClick={() => handleDelete(persona.id)} className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700">삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {getGenderText(persona.gender)}{persona.age && ` | ${persona.age}세`}
                </div>
                {persona.description && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{persona.description}</p>
                )}
              </div>
            ))}
            <button
              onClick={openAddForm}
              className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl text-gray-500 dark:text-gray-400 hover:border-pink-500 hover:text-pink-500 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              페르소나 추가
            </button>
          </div>
        )}
      </div>

      <PersonaFormModal
        isOpen={showForm}
        isEditing={!!editingPersona}
        formData={formData}
        submitting={formSubmitting}
        onFormChange={setFormData}
        onSubmit={handleSubmit}
        onClose={closeForm}
      />
    </>
  );
}
