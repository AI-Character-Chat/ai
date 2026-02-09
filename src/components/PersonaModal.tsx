'use client';

import { useState, useEffect } from 'react';

interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

interface PersonaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect?: (persona: Persona) => void;
  selectedPersonaId?: string;
  showSelectMode?: boolean; // true: 선택 모드, false: 관리 모드만
}

export default function PersonaModal({
  isOpen,
  onClose,
  onSelect,
  selectedPersonaId,
  showSelectMode = true,
}: PersonaModalProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // 폼 상태
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'private',
    description: '',
  });
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchPersonas();
    }
  }, [isOpen]);

  const fetchPersonas = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/personas');
      const data = await response.json();
      setPersonas(data.personas || []);
    } catch (error) {
      console.error('Failed to fetch personas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setEditingPersona(null);
    setFormData({ name: '', age: '', gender: 'private', description: '' });
    setShowAddModal(true);
  };

  const handleEditClick = (persona: Persona) => {
    setEditingPersona(persona);
    setFormData({
      name: persona.name,
      age: persona.age?.toString() || '',
      gender: persona.gender,
      description: persona.description || '',
    });
    setShowAddModal(true);
    setMenuOpenId(null);
  };

  const handleDeleteClick = async (id: string) => {
    if (!confirm('이 페르소나를 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/personas?id=${id}`, { method: 'DELETE' });
      if (response.ok) {
        fetchPersonas();
      }
    } catch (error) {
      console.error('Failed to delete persona:', error);
    }
    setMenuOpenId(null);
  };

  const handleSetDefault = async (persona: Persona) => {
    try {
      const response = await fetch('/api/personas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...persona, isDefault: true }),
      });
      if (response.ok) {
        fetchPersonas();
      }
    } catch (error) {
      console.error('Failed to set default persona:', error);
    }
    setMenuOpenId(null);
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    setFormSubmitting(true);
    try {
      const method = editingPersona ? 'PUT' : 'POST';
      const body = editingPersona
        ? { id: editingPersona.id, ...formData }
        : formData;

      const response = await fetch('/api/personas', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        setShowAddModal(false);
        fetchPersonas();
      } else {
        const error = await response.json();
        alert(error.error || '저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to save persona:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSelect = async (persona: Persona) => {
    if (onSelect && showSelectMode) {
      console.log('PersonaModal: selecting persona', persona.name);
      // 먼저 선택 콜백 실행 (async일 수 있음)
      await onSelect(persona);
      console.log('PersonaModal: onSelect completed, closing modal');
      // 모달 닫기
      onClose();
    }
  };

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male': return '남';
      case 'female': return '여';
      default: return '비공개';
    }
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
                      {/* 기본 프로필 뱃지 - isDefault일 때만 표시 */}
                      {persona.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-400 rounded-full">
                          기본
                        </span>
                      )}
                      {/* 선택됨 표시 - 현재 선택된 페르소나일 때만 표시 */}
                      {selectedPersonaId === persona.id && showSelectMode && (
                        <span className="px-2 py-0.5 text-xs bg-pink-500/20 text-pink-400 rounded-full flex items-center gap-1">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                          </svg>
                          선택됨
                        </span>
                      )}
                    </div>

                    {/* 점3개 메뉴 */}
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(menuOpenId === persona.id ? null : persona.id);
                        }}
                        className="p-1 text-gray-400 hover:text-white rounded"
                      >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="12" cy="18" r="2" />
                        </svg>
                      </button>

                      {menuOpenId === persona.id && (
                        <div className="absolute right-0 top-8 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-1 z-10 min-w-[120px]">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(persona);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
                          >
                            수정
                          </button>
                          {!persona.isDefault && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefault(persona);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
                            >
                              기본 프로필로 설정
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(persona.id);
                            }}
                            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700"
                          >
                            삭제
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-1 text-sm text-gray-400">
                    {getGenderText(persona.gender)}
                    {persona.age && ` | ${persona.age}세`}
                  </div>

                  {persona.description && (
                    <p className="mt-2 text-sm text-gray-500 line-clamp-2">
                      {persona.description}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          {/* 페르소나 추가 버튼 */}
          <div className="p-4 border-t border-gray-800">
            <button
              onClick={handleAddClick}
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

      {/* 추가/수정 모달 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="p-5 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingPersona ? '페르소나 수정' : '페르소나 추가'}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 폼 */}
            <div className="p-5 space-y-5">
              {/* 닉네임 */}
              <div>
                <label className="block text-white text-sm mb-2">
                  닉네임 <span className="text-pink-500 text-xs">기본 프로필과 크리에이터 이름으로 사용됩니다</span> <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 20) })}
                    placeholder="닉네임을 입력하세요"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                    {formData.name.length}/20
                  </span>
                </div>
              </div>

              {/* 나이 */}
              <div>
                <label className="block text-white text-sm mb-2">
                  나이 <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  placeholder="나이를 입력하세요"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                />
              </div>

              {/* 성별 */}
              <div>
                <label className="block text-white text-sm mb-2">
                  성별 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'female', label: '여성' },
                    { value: 'male', label: '남성' },
                    { value: 'private', label: '비공개' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setFormData({ ...formData, gender: option.value })}
                      className={`py-3 rounded-xl font-medium transition-all ${
                        formData.gender === option.value
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세정보 */}
              <div>
                <label className="block text-white text-sm mb-2">
                  상세정보 <span className="text-pink-500 text-xs">상세정보로 캐릭터가 내 정보를 인식할 수 있어요</span> <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, 1000) })}
                    placeholder="상세정보를 입력하세요"
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 resize-none"
                  />
                  <span className="absolute right-3 bottom-3 text-xs text-gray-500">
                    {formData.description.length}/1000
                  </span>
                </div>
              </div>
            </div>

            {/* 저장 버튼 */}
            <div className="p-5 pt-0">
              <button
                onClick={handleSubmit}
                disabled={formSubmitting || !formData.name.trim()}
                className="w-full py-4 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors"
              >
                {formSubmitting ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
