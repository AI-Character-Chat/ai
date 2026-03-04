'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { Work } from './types';
import CommentsSection from './CommentsSection';

interface WorkDetailModalProps {
  work: Work;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: { user?: any } | null;
  status: string;
  onClose: () => void;
  onWorkSelect: (work: Work) => void;
  onLikeUpdate: (workId: string, liked: boolean) => void;
  getTimeAgo: (dateString: string) => string;
  scrollToComments?: boolean;
}

export default function WorkDetailModal({
  work,
  session,
  status,
  onClose,
  onWorkSelect,
  onLikeUpdate,
  getTimeAgo,
  scrollToComments,
}: WorkDetailModalProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(work._count.likes);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [openingDropdownOpen, setOpeningDropdownOpen] = useState(false);
  const [openingContentExpanded, setOpeningContentExpanded] = useState(false);
  const [authorWorks, setAuthorWorks] = useState<Work[]>([]);
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const [, setAuthorFollowersCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);
  const [recentSession, setRecentSession] = useState<{ id: string; workId: string } | null>(null);

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 작품 변경 시 상태 초기화 및 데이터 로드
  useEffect(() => {
    setLikeCount(work._count.likes);
    setOpeningDropdownOpen(false);
    setOpeningContentExpanded(false);
    fetchLikeStatus(work.id);

    const defaultOpening = work.openings.find((o) => o.isDefault);
    setSelectedOpeningId(defaultOpening?.id || work.openings[0]?.id || null);

    if (work.authorId) {
      fetchAuthorWorks(work.authorId, work.id);
      fetchAuthorFollowStatus(work.authorId);
    } else {
      setAuthorWorks([]);
      setIsFollowingAuthor(false);
      setAuthorFollowersCount(0);
    }

    if (status === 'authenticated') {
      fetchRecentSession(work.id);
    } else {
      setRecentSession(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch 함수들은 안정적, work 변경 시에만 실행
  }, [work.id, work._count.likes, work.authorId, work.openings, status]);

  const fetchLikeStatus = async (workId: string) => {
    try {
      const response = await fetch(`/api/works/${workId}/like`);
      const data = await response.json();
      setIsLiked(data.isLiked);
      setLikeCount(data.likeCount);
    } catch (error) {
      console.error('Failed to fetch like status:', error);
    }
  };

  const handleLikeToggle = async () => {
    if (status !== 'authenticated') {
      alert('좋아요를 누르려면 로그인이 필요합니다.');
      return;
    }

    try {
      const response = await fetch(`/api/works/${work.id}/like`, { method: 'POST' });
      const data = await response.json();
      setIsLiked(data.liked);
      setLikeCount((prev) => (data.liked ? prev + 1 : prev - 1));
      onLikeUpdate(work.id, data.liked);
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  const fetchAuthorWorks = async (authorId: string, currentWorkId: string) => {
    try {
      const response = await fetch(`/api/works?authorId=${authorId}&public=true`);
      const data = await response.json();
      setAuthorWorks(Array.isArray(data) ? data.filter((w: Work) => w.id !== currentWorkId) : []);
    } catch (error) {
      console.error('Failed to fetch author works:', error);
      setAuthorWorks([]);
    }
  };

  const fetchAuthorFollowStatus = async (authorId: string) => {
    try {
      const response = await fetch(`/api/follow?userId=${authorId}`);
      const data = await response.json();
      setIsFollowingAuthor(data.isFollowing);
      setAuthorFollowersCount(data.followersCount);
    } catch (error) {
      console.error('Failed to fetch follow status:', error);
    }
  };

  const handleFollowToggle = async () => {
    if (!work.authorId) return;
    if (status !== 'authenticated') {
      alert('팔로우하려면 로그인이 필요합니다.');
      return;
    }

    setFollowLoading(true);
    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: work.authorId }),
      });

      if (!response.ok) throw new Error('Failed to toggle follow');

      const data = await response.json();
      setIsFollowingAuthor(data.isFollowing);
      setAuthorFollowersCount(data.followersCount);
    } catch (error) {
      console.error('Failed to toggle follow:', error);
    } finally {
      setFollowLoading(false);
    }
  };

  const fetchRecentSession = async (workId: string) => {
    try {
      const response = await fetch(`/api/user/sessions?workId=${workId}&limit=1`);
      const data = await response.json();
      if (data.sessions && data.sessions.length > 0) {
        setRecentSession({ id: data.sessions[0].id, workId: data.sessions[0].workId });
      } else {
        setRecentSession(null);
      }
    } catch (error) {
      console.error('Failed to fetch recent session:', error);
      setRecentSession(null);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-detail-title"
        className="bg-white dark:bg-gray-900 rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - 고정 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h2 id="work-detail-title" className="text-lg font-semibold text-gray-900 dark:text-white">작품 상세</h2>
          <div className="w-10" />
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1">
          {/* Top Section: Thumbnail + Details */}
          <div className="flex flex-col md:flex-row">
            {/* Left: Thumbnail + Author */}
            <div className="md:w-1/2 p-6 flex-shrink-0">
              <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden">
                {work.thumbnail ? (
                  <img src={work.thumbnail} alt={work.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                )}
              </div>
              {/* 작가 정보 */}
              {work.author && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                  <div className="flex items-start gap-3">
                    <Link
                      href={`/author/${work.author.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                    >
                      {work.author.image ? (
                        <img src={work.author.image} alt={work.author.name || ''} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm text-gray-500 bg-gradient-to-br from-violet-500 to-purple-600">
                          <span className="text-white font-bold">{work.author.name?.[0] || '?'}</span>
                        </div>
                      )}
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/author/${work.author.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm font-semibold text-gray-900 dark:text-white hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
                      >
                        {work.author.name || '알 수 없음'}
                      </Link>
                      {work.author.bio ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{work.author.bio}</p>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">작가</p>
                      )}
                    </div>
                    {session?.user?.id !== work.author.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleFollowToggle(); }}
                        disabled={followLoading}
                        aria-label={isFollowingAuthor ? `${work.author?.name} 팔로우 취소` : `${work.author?.name} 팔로우`}
                        aria-pressed={isFollowingAuthor}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
                          isFollowingAuthor
                            ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                            : 'bg-pink-500 text-white hover:bg-pink-600'
                        } disabled:opacity-50`}
                      >
                        {followLoading ? (
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : isFollowingAuthor ? '팔로잉' : '팔로우'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Details */}
            <div className="md:w-1/2 p-6 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{work.title}</h1>
                <button
                  onClick={handleLikeToggle}
                  aria-label={isLiked ? '좋아요 취소' : '좋아요'}
                  aria-pressed={isLiked}
                  className={`p-2 transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                >
                  <svg className="w-6 h-6" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                <div className="flex items-center gap-1.5">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <span>{work._count.chatSessions.toLocaleString()}</span>
                </div>
                <span>•</span>
                <div className="flex items-center gap-1.5">
                  <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span>{likeCount.toLocaleString()}</span>
                </div>
              </div>

              {work.characters.length > 0 && (
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex -space-x-4">
                    {work.characters.slice(0, 8).map((char, index) => (
                      <div
                        key={char.id}
                        className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-800 overflow-hidden hover:z-10 hover:scale-110 transition-transform"
                        style={{ zIndex: work.characters.length - index }}
                        title={char.name}
                      >
                        {char.profileImage ? (
                          <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-gray-500 bg-gray-200 dark:bg-gray-700">
                            {char.name[0]}
                          </div>
                        )}
                      </div>
                    ))}
                    {work._count.characters > 8 && (
                      <div
                        className="w-8 h-8 rounded-full bg-gray-600 border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs text-white font-medium"
                        style={{ zIndex: 0 }}
                      >
                        +{work._count.characters - 8}
                      </div>
                    )}
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    캐릭터 {work._count.characters}명
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    업데이트: {new Date(work.updatedAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              )}

              <div className="flex-1 mb-4 overflow-y-auto max-h-48">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed text-sm">
                  {work.description || '설명이 없습니다.'}
                </p>
              </div>

              {work.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {work.tags.map((tag, index) => (
                    <span key={index} className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-700">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-6">
                <span>생성일: {new Date(work.createdAt).toLocaleDateString('ko-KR')}</span>
                {work.publishedAt && (
                  <span>론칭일: {new Date(work.publishedAt).toLocaleDateString('ko-KR')}</span>
                )}
              </div>

              <div className="flex gap-3 mt-auto">
                {recentSession ? (
                  <Link
                    href={`/chat/${recentSession.workId}?session=${recentSession.id}`}
                    className="flex-1 py-3 text-center bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    이어서 대화하기
                  </Link>
                ) : (
                  <button
                    disabled
                    className="flex-1 py-3 text-center bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 font-semibold rounded-xl cursor-not-allowed"
                    title="이전 대화 기록이 없습니다"
                  >
                    이어서 대화하기
                  </button>
                )}
                <Link
                  href={`/chat/${work.id}`}
                  className="flex-1 py-3 text-center bg-gradient-to-r from-pink-500 to-rose-500 text-white font-semibold rounded-xl hover:from-pink-600 hover:to-rose-600 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  새로 대화하기
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>

          {/* Opening Scenarios */}
          {work.openings && work.openings.length > 0 && (
            <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
              <div className="py-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">오프닝 시나리오</h3>
                <div className="relative">
                  <button
                    onClick={() => setOpeningDropdownOpen(!openingDropdownOpen)}
                    className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between text-left hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <span className="text-gray-900 dark:text-white font-medium">
                      {work.openings.find((o) => o.id === selectedOpeningId)?.title || '오프닝 선택'}
                    </span>
                    <svg className={`w-5 h-5 text-gray-500 transition-transform ${openingDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openingDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-10 overflow-hidden">
                      {work.openings.map((opening) => (
                        <button
                          key={opening.id}
                          onClick={() => {
                            setSelectedOpeningId(opening.id);
                            setOpeningDropdownOpen(false);
                            setOpeningContentExpanded(false);
                          }}
                          className={`w-full px-4 py-3 text-left flex items-center gap-2 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                            selectedOpeningId === opening.id ? 'bg-gray-200 dark:bg-gray-700' : ''
                          }`}
                        >
                          {selectedOpeningId === opening.id && (
                            <svg className="w-4 h-4 text-pink-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          <span className={`text-gray-900 dark:text-white ${selectedOpeningId !== opening.id ? 'ml-6' : ''}`}>
                            {opening.title}
                          </span>
                          {opening.isDefault && (
                            <span className="px-2 py-0.5 text-xs bg-pink-100 dark:bg-pink-900 text-pink-600 dark:text-pink-300 rounded-full ml-auto">
                              기본
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {selectedOpeningId && (() => {
                  const selectedOpening = work.openings.find((o) => o.id === selectedOpeningId);
                  const content = selectedOpening?.content || '';
                  const isLongContent = content.length > 300;

                  return (
                    <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                      <div className="relative">
                        <p className={`text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed ${
                          !openingContentExpanded && isLongContent ? 'line-clamp-5' : ''
                        }`}>
                          {content}
                        </p>
                        {!openingContentExpanded && isLongContent && (
                          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-gray-50 dark:from-gray-800/50 to-transparent" />
                        )}
                      </div>
                      {isLongContent && (
                        <button
                          onClick={() => setOpeningContentExpanded(!openingContentExpanded)}
                          className="mt-3 w-full py-2 text-sm text-pink-500 hover:text-pink-600 dark:text-pink-400 dark:hover:text-pink-300 font-medium flex items-center justify-center gap-1 border border-pink-200 dark:border-pink-800 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-colors"
                        >
                          {openingContentExpanded ? (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                              접기
                            </>
                          ) : (
                            <>
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                              펼치기
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 이 작가의 작품들 */}
          {authorWorks.length > 0 && (
            <div className="pb-6 border-t border-gray-200 dark:border-gray-700">
              <div className="py-4 px-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">이 작가의 작품들</h3>
              </div>
              <div className="relative group/carousel">
                <div
                  className="flex gap-3 overflow-x-auto scrollbar-hide px-6 pb-2"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {authorWorks.map((aw) => (
                    <div
                      key={aw.id}
                      onClick={() => {
                        onWorkSelect(aw);
                      }}
                      className="cursor-pointer group flex-shrink-0"
                      style={{ width: '140px' }}
                    >
                      <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                        {aw.thumbnail ? (
                          <img src={aw.thumbnail} alt={aw.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <div className="flex items-center gap-2 text-white text-xs">
                            <span className="flex items-center gap-0.5">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                              </svg>
                              {aw._count.likes}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                              {aw._count.chatSessions}
                            </span>
                          </div>
                        </div>
                      </div>
                      <h4 className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-pink-500 transition-colors">
                        {aw.title}
                      </h4>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {aw.tags.slice(0, 2).map((tag, idx) => (
                          <span key={idx} className="text-xs text-gray-500 dark:text-gray-400">#{tag}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                {authorWorks.length > 4 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const container = e.currentTarget.parentElement?.querySelector('.overflow-x-auto');
                      if (container) {
                        container.scrollBy({ left: 300, behavior: 'smooth' });
                      }
                    }}
                    aria-label="다음 작품 보기"
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-lg flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors opacity-0 group-hover/carousel:opacity-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 댓글 섹션 */}
          <CommentsSection
            workId={work.id}
            authorId={work.authorId}
            session={session}
            getTimeAgo={getTimeAgo}
            scrollToComments={scrollToComments}
          />
        </div>
      </div>
    </div>
  );
}
