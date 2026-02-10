'use client';

import type { PersonaFormData } from '@/hooks/usePersonas';

interface PersonaFormModalProps {
  isOpen: boolean;
  isEditing: boolean;
  formData: PersonaFormData;
  submitting: boolean;
  onFormChange: (data: PersonaFormData) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function PersonaFormModal({
  isOpen, isEditing, formData, submitting,
  onFormChange, onSubmit, onClose,
}: PersonaFormModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[80] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? '페르소나 수정' : '페르소나 추가'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white">
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
                onChange={(e) => onFormChange({ ...formData, name: e.target.value.slice(0, 20) })}
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
            <label className="block text-gray-900 dark:text-white text-sm mb-2">나이</label>
            <input
              type="number"
              value={formData.age}
              onChange={(e) => onFormChange({ ...formData, age: e.target.value })}
              placeholder="나이를 입력하세요"
              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-pink-500"
            />
          </div>

          {/* 성별 */}
          <div>
            <label className="block text-gray-900 dark:text-white text-sm mb-2">성별</label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { value: 'female', label: '여성' },
                { value: 'male', label: '남성' },
                { value: 'private', label: '비공개' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => onFormChange({ ...formData, gender: option.value })}
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
                onChange={(e) => onFormChange({ ...formData, description: e.target.value.slice(0, 1000) })}
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
            onClick={onSubmit}
            disabled={submitting || !formData.name.trim()}
            className="w-full py-4 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition-colors"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
