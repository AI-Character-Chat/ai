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

interface PersonaManagerProps {
  onPersonaChange?: () => void; // 페르소나가 변경되었을 때 콜백
}

export default function PersonaManager({ onPersonaChange }: PersonaManagerProps) {
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
    fetchPersonas();
  }, []);

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
        onPersonaChange?.();
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
        onPersonaChange?.();
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
        onPersonaChange?.();
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

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male': return '남';
      case 'female': return '여';
      default: return '비공개';
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* 설명 */}
        <p className="text-sm text-gray-500 dark:text-gray-400">
          대화할 때 사용할 역할을 설정하세요. 기본 프로필은 크리에이터 이름으로도 사용됩니다.
        </p>

        {/* 페르소나 목록 */}
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
              onClick={handleAddClick}
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
                      <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">
                        기본
                      </span>
                    )}
                  </div>

                  {/* 점3개 메뉴 */}
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === persona.id ? null : persona.id)}
                      className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="12" cy="6" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="18" r="2" />
                      </svg>
                    </button>

                    {menuOpenId === persona.id && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpenId(null)}
                        />
                        <div className="absolute right-0 top-8 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 z-20 min-w-[140px]">
                          <button
                            onClick={() => handleEditClick(persona)}
                            className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            수정
                          </button>
                          {!persona.isDefault && (
                            <button
                              onClick={() => handleSetDefault(persona)}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                            >
                              기본 프로필로 설정
                            </button>
                          )}
                          <button
                            onClick={() => handleDeleteClick(persona.id)}
                            className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {getGenderText(persona.gender)}
                  {persona.age && ` | ${persona.age}세`}
                </div>

                {persona.description && (
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {persona.description}
                  </p>
                )}
              </div>
            ))}

            {/* 페르소나 추가 버튼 */}
            <button
              onClick={handleAddClick}
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

      {/* 추가/수정 모달 */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingPersona ? '페르소나 수정' : '페르소나 추가'}
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 폼 */}
            <div className="p-5 space-y-5">
              {/* 닉네임 */}
              <div>
                <label className="block text-gray-900 dark:text-white text-sm mb-2">
                  닉네임 <span className="text-pink-500 text-xs">기본 프로필과 크리에이터 이름으로 사용됩니다</span> <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value.slice(0, 20) })}
                    placeholder="닉네임을 입력하세요"
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                    {formData.name.length}/20
                  </span>
                </div>
              </div>

              {/* 나이 */}
              <div>
                <label className="block text-gray-900 dark:text-white text-sm mb-2">
                  나이
                </label>
                <input
                  type="number"
                  value={formData.age}
                  onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                  placeholder="나이를 입력하세요"
                  className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
                />
              </div>

              {/* 성별 */}
              <div>
                <label className="block text-gray-900 dark:text-white text-sm mb-2">
                  성별
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
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 상세정보 */}
              <div>
                <label className="block text-gray-900 dark:text-white text-sm mb-2">
                  상세정보 <span className="text-pink-500 text-xs">캐릭터가 내 정보를 인식할 수 있어요</span>
                </label>
                <div className="relative">
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value.slice(0, 1000) })}
                    placeholder="상세정보를 입력하세요"
                    rows={4}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-pink-500 resize-none"
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
                className="w-full py-4 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors"
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
