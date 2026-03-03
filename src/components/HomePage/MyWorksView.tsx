'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import PersonaManager from '@/components/PersonaManager';
import type { Work } from './types';

interface MyWorksViewProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { user?: any } | null;
  status: string;
  profileImage: string | null;
  profileForm: { nickname: string; bio: string };
  onProfileEditOpen: () => void;
  onViewChange: (view: 'works' | 'myworks') => void;
}

export default function MyWorksView({ session, status, profileImage, profileForm, onProfileEditOpen, onViewChange }: MyWorksViewProps) {
  const [myWorks, setMyWorks] = useState<Work[]>([]);
  const [myWorksLoading, setMyWorksLoading] = useState(false);
  const [myWorksSortBy, setMyWorksSortBy] = useState<'chatSessions' | 'likes' | 'newest' | 'oldest'>('newest');
  const [myWorksSortDropdownOpen, setMyWorksSortDropdownOpen] = useState(false);
  const [myPageTab, setMyPageTab] = useState<'works' | 'persona'>('works');

  useEffect(() => {
    if (status === 'authenticated') {
      fetchMyWorks();
    }
  }, [status]);

  const fetchMyWorks = async () => {
    setMyWorksLoading(true);
    try {
      const response = await fetch('/api/user/works');
      const data = await response.json();
      setMyWorks(data.works || []);
    } catch (error) {
      console.error('Failed to fetch my works:', error);
    } finally {
      setMyWorksLoading(false);
    }
  };

  const getSortLabel = (option: 'chatSessions' | 'likes' | 'newest' | 'oldest') => {
    switch (option) {
      case 'chatSessions': return '대화량순';
      case 'likes': return '좋아요순';
      case 'newest': return '최신순';
      case 'oldest': return '오래된순';
    }
  };

  const sortedMyWorks = useMemo(() => [...myWorks].sort((a, b) => {
    switch (myWorksSortBy) {
      case 'chatSessions':
        return b._count.chatSessions - a._count.chatSessions;
      case 'likes':
        return b._count.likes - a._count.likes;
      case 'newest':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'oldest':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      default:
        return 0;
    }
  }), [myWorks, myWorksSortBy]);

  return (
    <>
      {/* 마이페이지 타이틀 & 뒤로가기 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onViewChange('works')}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="뒤로가기"
        >
          <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">마이페이지</h1>
      </div>

      {/* User Info */}
      <div className="flex items-center gap-4 mb-8 p-4 bg-white dark:bg-gray-800 rounded-xl">
        <div className="relative">
          {profileImage || session?.user?.image ? (
            <img
              src={profileImage || session?.user?.image || ''}
              alt={profileForm.nickname || session?.user?.name || ''}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <span className="text-xl font-bold text-white">
                {profileForm.nickname?.[0] || session?.user?.name?.[0] || '?'}
              </span>
            </div>
          )}
          <button
            onClick={onProfileEditOpen}
            className="absolute bottom-0 right-0 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center border-2 border-white dark:border-gray-800"
          >
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-lg text-gray-900 dark:text-white">{profileForm.nickname || session?.user?.name}</h3>
          {profileForm.bio && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{profileForm.bio}</p>
          )}
        </div>
        <button
          onClick={onProfileEditOpen}
          className="px-4 py-2 text-sm text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors flex-shrink-0"
        >
          프로필 수정
        </button>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex items-center gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setMyPageTab('works')}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            myPageTab === 'works'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          내 작품
        </button>
        <button
          onClick={() => setMyPageTab('persona')}
          className={`flex-1 py-2.5 px-4 rounded-lg font-medium text-sm transition-all ${
            myPageTab === 'persona'
              ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          페르소나
        </button>
      </div>

      {/* 내 작품 탭 */}
      {myPageTab === 'works' && (
        <>
          {/* Header with Sort */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                총 {myWorks.length}개
              </span>
            </div>

            <div className="relative">
              <button
                onClick={() => setMyWorksSortDropdownOpen(!myWorksSortDropdownOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                </svg>
                {getSortLabel(myWorksSortBy)}
                <svg className={`w-4 h-4 transition-transform ${myWorksSortDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {myWorksSortDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMyWorksSortDropdownOpen(false)} />
                  <div className="absolute right-0 mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                    {(['chatSessions', 'likes', 'newest', 'oldest'] as const).map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          setMyWorksSortBy(option);
                          setMyWorksSortDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                          myWorksSortBy === option ? 'text-pink-500 bg-pink-50 dark:bg-pink-900/20' : 'text-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {myWorksSortBy === option && (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        <span className={myWorksSortBy !== option ? 'ml-6' : ''}>{getSortLabel(option)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* My Works List */}
          {myWorksLoading ? (
            <div className="text-center py-12">
              <div className="text-gray-500 dark:text-gray-400">로딩 중...</div>
            </div>
          ) : myWorks.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl">
              <svg className="w-20 h-20 mx-auto text-gray-300 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 mb-4">아직 작품이 없습니다.</p>
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                첫 작품 만들기
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedMyWorks.map((work) => (
                <div
                  key={work.id}
                  className="flex gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                >
                  <div className="w-16 h-16 flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                    {work.thumbnail ? (
                      <img src={work.thumbnail} alt={work.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute top-1 left-1">
                      <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                        work.visibility === 'public'
                          ? 'bg-green-500 text-white'
                          : work.visibility === 'unlisted'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-500 text-white'
                      }`}>
                        {work.visibility === 'public' ? '공개' : work.visibility === 'unlisted' ? '일부' : '비공개'}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">{work.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{work.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                        {work._count.characters}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                        {work._count.chatSessions}
                      </span>
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                        </svg>
                        {work._count.likes}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/studio/${work.id}`}
                    className="flex items-center px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                    편집
                  </Link>
                </div>
              ))}
            </div>
          )}

          {/* Create New Work FAB */}
          {myWorks.length > 0 && (
            <Link
              href="/studio"
              className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-full shadow-lg flex items-center justify-center hover:from-pink-600 hover:to-rose-600 transition-all hover:scale-110 z-30"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Link>
          )}
        </>
      )}

      {/* 페르소나 탭 */}
      {myPageTab === 'persona' && (
        <PersonaManager />
      )}
    </>
  );
}
