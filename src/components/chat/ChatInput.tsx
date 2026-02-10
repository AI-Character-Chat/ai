'use client';

import { useRef, useEffect } from 'react';

interface ChatInputProps {
  inputMessage: string;
  sending: boolean;
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  onInputChange: (text: string) => void;
  onSend: () => void;
}

export default function ChatInput({
  inputMessage,
  sending,
  sidebarOpen,
  sidebarCollapsed,
  onInputChange,
  onSend,
}: ChatInputProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!sending && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      handleActionDescriptionClick();
    }
  };

  const handleActionDescriptionClick = () => {
    if (!inputRef.current) return;
    const textarea = inputRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = inputMessage;

    if (start !== end) {
      const selectedText = text.substring(start, end);
      const newText = text.substring(0, start) + '*' + selectedText + '*' + text.substring(end);
      onInputChange(newText);
      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(end + 2, end + 2); }, 0);
    } else {
      const newText = text.substring(0, start) + '**' + text.substring(end);
      onInputChange(newText);
      setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + 1, start + 1); }, 0);
    }
  };

  const sidebarMargin = sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : '';

  return (
    <div className={`bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 transition-all duration-300 ${sidebarMargin}`}>
      <div className="max-w-3xl mx-auto px-4 py-3">
        <div className="flex items-end gap-2">
          <button
            onClick={handleActionDescriptionClick}
            disabled={sending}
            className="px-3 py-2 text-lg font-bold text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="상황/행동 묘사 (Ctrl+I)"
          >
            ✱
          </button>
          <textarea
            ref={inputRef}
            value={inputMessage}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (*행동묘사*로 상황을 표현할 수 있습니다)"
            rows={1}
            disabled={sending}
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-700 dark:text-white disabled:opacity-50"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={onSend}
            disabled={sending || !inputMessage.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 text-center">Enter 전송 · Shift+Enter 줄바꿈 · Ctrl+I 상황묘사</p>
      </div>
    </div>
  );
}
