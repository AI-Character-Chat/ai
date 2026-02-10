'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useLayout } from '@/contexts/LayoutContext';

interface ChatSession {
  id: string;
  workId: string;
  work: {
    id: string;
    title: string;
    thumbnail: string | null;
    description: string;
  };
  userName: string;
  turnCount: number;
  intimacy: number;
  currentLocation: string | null;
  lastMessage: {
    content: string;
    messageType: string;
    createdAt: string;
  } | null;
  updatedAt: string;
  createdAt: string;
}

export default function ChatHistorySidebar() {
  const { data: session, status } = useSession();
  const { sidebarOpen, setSidebarOpen, sidebarCollapsed, setSidebarCollapsed, sidebarRefreshKey } = useLayout();
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(true);

  useEffect(() => {
    if (status === 'authenticated' && sidebarOpen) {
      fetchChatSessions();
    }
  }, [status, sidebarOpen, sidebarRefreshKey]);

  const fetchChatSessions = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/user/sessions');
      const data = await response.json();
      setChatSessions(data.sessions || []);
    } catch (error) {
      console.error('Failed to fetch chat sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return '오늘';
    } else if (days === 1) {
      return '어제';
    } else if (days < 7) {
      return `${days}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  if (!sidebarOpen) return null;

  // 축소 모드일 때 (아이콘만 표시)
  if (sidebarCollapsed) {
    return (
      <aside className="fixed top-0 left-0 h-full w-16 bg-white dark:bg-gray-800 shadow-md z-30 pt-16" role="navigation" aria-label="채팅 기록">
        <div className="flex flex-col items-center py-4 space-y-3 overflow-y-auto h-full">
          {/* 작품 만들기 버튼 */}
          <Link
            href="/studio"
            className="p-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors shadow-md hover:shadow-lg"
            title="작품 만들기"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </Link>

          {/* 구분선 */}
          <div className="w-8 border-t border-gray-200 dark:border-gray-700" />

          {/* 최근 채팅 아이콘들 */}
          {status === 'authenticated' && chatSessions.length > 0 && (
            <>
              {chatSessions.slice(0, 8).map((chat) => (
                <Link
                  key={chat.id}
                  href={`/chat/${chat.workId}?session=${chat.id}`}
                  className="relative w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden hover:ring-2 hover:ring-primary-500 transition-all flex-shrink-0"
                  title={chat.work.title}
                >
                  {chat.work.thumbnail ? (
                    <Image
                      src={chat.work.thumbnail}
                      alt={chat.work.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    </div>
                  )}
                </Link>
              ))}
            </>
          )}
        </div>
      </aside>
    );
  }

  return (
    <>
      {/* Backdrop - 모바일에서만 표시 */}
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={() => setSidebarCollapsed(true)}
      />

      {/* Sidebar - 전체 모드 */}
      <aside className={`
        fixed top-0 left-0 h-full w-80 bg-white dark:bg-gray-800 shadow-xl z-30 pt-16
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:shadow-md
      `}>
        {/* Content */}
        <div className="overflow-y-auto h-full">
          {/* 작품 만들기 버튼 */}
          <div className="p-4">
            <Link
              href="/studio"
              className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              작품 만들기
            </Link>
          </div>

          {/* 최근 채팅 섹션 (접었다 펼 수 있음) */}
          <div className="border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setChatHistoryOpen(!chatHistoryOpen)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            >
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                최근 채팅
              </span>
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${chatHistoryOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* 채팅 목록 (접기/펴기) */}
          {chatHistoryOpen && (
            <div>
              {status === 'unauthenticated' ? (
                <div className="p-4 text-center">
                  <p className="text-gray-600 dark:text-gray-400 text-sm mb-3">
                    로그인하면 채팅 기록을 저장하고<br />언제든 이어서 대화할 수 있어요
                  </p>
                  <Link
                    href="/login"
                    className="inline-block px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    로그인하기
                  </Link>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-500" />
                </div>
              ) : chatSessions.length === 0 ? (
                <div className="p-4 text-center">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    아직 채팅 기록이 없어요
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {chatSessions.map((chat) => (
                    <Link
                      key={chat.id}
                      href={`/chat/${chat.workId}?session=${chat.id}`}
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="flex gap-3">
                        {/* Thumbnail */}
                        <div className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          {chat.work.thumbnail ? (
                            <Image
                              src={chat.work.thumbnail}
                              alt={chat.work.title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {chat.work.title}
                            </h3>
                            <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                              {formatDate(chat.updatedAt)}
                            </span>
                          </div>
                          {chat.lastMessage && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {truncateText(chat.lastMessage.content, 35)}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
