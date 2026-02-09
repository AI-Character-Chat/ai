'use client';

import { useState, useRef, useEffect } from 'react';

interface Persona {
  id: string;
  name: string;
  age: number | null;
  gender: string;
  description: string | null;
  isDefault: boolean;
}

interface PersonaDropdownProps {
  personas: Persona[];
  selectedPersona: Persona | null;
  onSelect: (persona: Persona) => void;
  onManageClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export default function PersonaDropdown({
  personas,
  selectedPersona,
  onSelect,
  onManageClick,
  disabled = false,
  className = '',
}: PersonaDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getGenderText = (gender: string) => {
    switch (gender) {
      case 'male': return '남';
      case 'female': return '여';
      default: return '비공개';
    }
  };

  const handleSelect = (persona: Persona) => {
    onSelect(persona);
    setIsOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* 드롭다운 트리거 버튼 */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg
          bg-white dark:bg-gray-700
          flex items-center justify-between
          transition-colors
          ${disabled
            ? 'opacity-50 cursor-not-allowed'
            : 'cursor-pointer hover:border-violet-500 dark:hover:border-violet-400'
          }
        `}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-gray-900 dark:text-white font-medium truncate">
            {selectedPersona?.name || '페르소나 선택'}
          </span>
          {selectedPersona?.isDefault && (
            <span className="flex-shrink-0 px-2 py-0.5 text-xs bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">
              기본
            </span>
          )}
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 선택된 페르소나 정보 */}
      {selectedPersona && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">
          {getGenderText(selectedPersona.gender)}
          {selectedPersona.age && ` | ${selectedPersona.age}세`}
          {selectedPersona.description && ` | ${selectedPersona.description.slice(0, 30)}${selectedPersona.description.length > 30 ? '...' : ''}`}
        </p>
      )}

      {/* 드롭다운 목록 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 max-h-64 overflow-y-auto">
          {personas.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-center">
              페르소나가 없습니다
            </div>
          ) : (
            <>
              {personas.map((persona) => (
                <button
                  key={persona.id}
                  onClick={() => handleSelect(persona)}
                  className={`
                    w-full px-4 py-3 text-left transition-colors
                    ${selectedPersona?.id === persona.id
                      ? 'bg-violet-50 dark:bg-violet-900/30'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                    first:rounded-t-xl
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`font-medium ${
                        selectedPersona?.id === persona.id
                          ? 'text-violet-600 dark:text-violet-400'
                          : 'text-gray-900 dark:text-white'
                      }`}>
                        {persona.name}
                      </span>
                      {persona.isDefault && (
                        <span className="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-500 dark:text-blue-400 rounded-full">
                          기본
                        </span>
                      )}
                    </div>
                    {selectedPersona?.id === persona.id && (
                      <svg className="w-5 h-5 text-violet-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
                      </svg>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {getGenderText(persona.gender)}
                    {persona.age && ` | ${persona.age}세`}
                  </div>
                </button>
              ))}
            </>
          )}

          {/* 페르소나 관리 버튼 */}
          {onManageClick && (
            <button
              onClick={() => {
                setIsOpen(false);
                onManageClick();
              }}
              className="w-full px-4 py-3 text-left text-sm text-violet-500 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700 rounded-b-xl flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              페르소나 관리
            </button>
          )}
        </div>
      )}
    </div>
  );
}
