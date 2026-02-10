'use client';

import { useState } from 'react';
import { usePersonas, getGenderText, type Persona } from '@/hooks/usePersonas';
import PersonaFormModal from './PersonaFormModal';

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (persona: Persona) => void;
  selectedPersonaId?: string;
  showSelectMode?: boolean;
}

export default function PersonaModal({
  isOpen, onClose, onSelect, selectedPersonaId, showSelectMode = true,
}: PersonaModalProps) {
  const {
    personas, loading, editingPersona,
    showForm, formData, formSubmitting,
    setFormData, fetchPersonas, openAddForm, openEditForm, closeForm, submitForm,
    deletePersona, setDefault,
  } = usePersonas(isOpen);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleSelect = async (persona: Persona) => {
    if (onSelect && showSelectMode) {
      await onSelect(persona);
      onClose();
    }
  };

  const handleDelete = async (id: string) => {
    await deletePersona(id);
    setMenuOpenId(null);
  };

  const handleSetDefault = async (persona: Persona) => {
    await setDefault(persona);
    setMenuOpenId(null);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* 메인 모달 */}
      <div
        className="fixed inset-0 bg-black/70 z-[70] flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-gray-900 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="p-5 border-b border-gray-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">페르소나</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 설명 */}
          <div className="px-5 pt-4">
            <h3 className="text-white font-medium">페르소나로 설정한 역할에 맞춰</h3>
            <h3 className="text-white font-medium">캐릭터와 대화할 수 있어요</h3>
            <p className="text-gray-500 text-sm mt-2">
              생성한 캐릭터의 크리에이터 이름은 기본 프로필의 닉네임으로 표기돼요
            </p>
          </div>

          {/* 페르소나 목록 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
              </div>
            ) : personas.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                페르소나가 없습니다. 추가해주세요.
              </div>
            ) : (
              personas.map((persona) => (
                <div
                  key={persona.id}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    selectedPersonaId === persona.id
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                  } ${showSelectMode ? 'cursor-pointer' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (showSelectMode && menuOpenId !== persona.id) {
                      handleSelect(persona);
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{persona.name}</span>
                      {persona.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">기본</span>
                      )}
                      {selectedPersonaId === persona.id && showSelectMode && (
                        <span className="px-2 py-0.5 text-xs bg-pink-500/20 text-pink-400 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                          선택됨
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === persona.id ? null : persona.id); }}
                        className="p-1 text-gray-400 hover:text-white rounded"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="18" r="2" />
                        </svg>
                      </button>
                      {menuOpenId === persona.id && (
                        <div className="absolute right-0 top-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-10 min-w-[120px]">
                          <button onClick={(e) => { e.stopPropagation(); openEditForm(persona); setMenuOpenId(null); }} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700">수정</button>
                          {!persona.isDefault && (
                            <button onClick={(e) => { e.stopPropagation(); handleSetDefault(persona); }} className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700">기본 프로필로 설정</button>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(persona.id); }} className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700">삭제</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-1 text-sm text-gray-400">
                    {getGenderText(persona.gender)}{persona.age && ` | ${persona.age}세`}
                  </div>
                  {persona.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">{persona.description}</p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 페르소나 추가 버튼 */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={openAddForm}
              className="w-full flex items-center justify-center gap-2 py-3 text-pink-400 hover:text-pink-300 transition-colors"
            >
              <svg className="w-6 h-6 bg-pink-500 rounded-full text-white p-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>페르소나 추가</span>
            </button>
          </div>
        </div>
      </div>

      <PersonaFormModal
        isOpen={showForm}
        isEditing={!!editingPersona}
        formData={formData}
        submitting={formSubmitting}
        onFormChange={setFormData}
        onSubmit={submitForm}
        onClose={closeForm}
      />
    </>
  );
}
