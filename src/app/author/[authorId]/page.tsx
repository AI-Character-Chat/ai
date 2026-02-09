'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import MainHeader from '@/components/MainHeader';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import { useLayout } from '@/contexts/LayoutContext';

interface Author {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
  createdAt: string;
  followersCount: number;
  followingCount: number;
  worksCount: number;
}

interface Work {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  _count: {
    likes: number;
    chatSessions: number;
  };
  characters: {
    id: string;
    name: string;
    profileImage: string | null;
  }[];
}

interface Stats {
  totalChatSessions: number;
  rank: number;
  totalAuthors: number;
}

export default function AuthorPage() {
  const params = useParams();
  const authorId = params.authorId as string;
  const { data: session } = useSession();
  const router = useRouter();
  const { sidebarOpen, sidebarCollapsed } = useLayout();

  const [author, setAuthor] = useState<Author | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  useEffect(() => {
    if (authorId) {
      fetchAuthorData();
    }
  }, [authorId]);

  const fetchAuthorData = async () => {
    try {
      const response = await fetch(`/api/author/${authorId}`);
      if (!response.ok) {
        if (response.status === 404) {
          router.push('/');
          return;
        }
        throw new Error('Failed to fetch author');
      }
      const data = await response.json();
      setAuthor(data.author);
      setWorks(data.works);
      setStats(data.stats);
      setIsFollowing(data.isFollowing);
    } catch (error) {
      console.error('Failed to fetch author:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!session?.user) {
      router.push('/login');
      return;
    }

    setFollowLoading(true);
    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: authorId })
      });

      if (!response.ok) throw new Error('Failed to toggle follow');

      const data = await response.json();
      setIsFollowing(data.isFollowing);
      if (author) {
        setAuthor({
          ...author,
          followersCount: data.followersCount
        });
      }
    } catch (error) {
      console.error('Failed to toggle follow:', error);
    } finally {
      setFollowLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-lg text-gray-600 dark:text-gray-400">로딩 중...</div>
      </div>
    );
  }

  if (!author) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-lg text-gray-600 dark:text-gray-400">작가를 찾을 수 없습니다.</div>
      </div>
    );
  }

  const isOwnProfile = session?.user?.id === author.id;

  return (
    <div className="min-h-screen">
      {/* Header - 공통 컴포넌트 사용 (검색/알림 기능 내장) */}
      <MainHeader />

      {/* Chat History Sidebar - 공통 컴포넌트 (Context 사용) */}
      <ChatHistorySidebar />

      {/* Main Content Wrapper - 헤더 높이만큼 상단 패딩, 사이드바 열리면 왼쪽 여백 추가 */}
      <div className={`pt-16 transition-all duration-300 ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}`}>
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* 페이지 타이틀 & 뒤로가기 */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              aria-label="뒤로가기"
            >
              <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">작가 프로필</h1>
          </div>

          {/* 작가 정보 카드 */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              {/* 프로필 이미지 */}
              <div className="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {author.image ? (
                  <img
                    src={author.image}
                    alt={author.name || ''}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                    <span className="text-2xl font-bold text-white">
                      {author.name?.[0] || '?'}
                    </span>
                  </div>
                )}
              </div>

              {/* 작가 정보 */}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  {author.name || '알 수 없음'}
                </h2>
                {author.bio && (
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                    {author.bio}
                  </p>
                )}
              </div>

              {/* 팔로우 버튼 */}
              {!isOwnProfile && (
                <button
                  onClick={handleFollowToggle}
                  disabled={followLoading}
                  className={`px-5 py-2 rounded-full font-medium transition-colors flex-shrink-0 ${
                    isFollowing
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                      : 'bg-pink-500 text-white hover:bg-pink-600'
                  } disabled:opacity-50`}
                >
                  {followLoading ? (
                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : isFollowing ? (
                    '팔로잉'
                  ) : (
                    '팔로우'
                  )}
                </button>
              )}
            </div>

            {/* 팔로워/팔로잉 */}
            <div className="mt-4 flex items-center gap-6">
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {author.followersCount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">팔로워</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {author.followingCount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">팔로잉</p>
              </div>
            </div>
          </div>

          {/* 대화량 & 순위 */}
          {stats && (
            <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-5 mb-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">총 대화량</p>
                  <p className="text-2xl font-bold">{stats.totalChatSessions.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm opacity-90">작가 순위</p>
                  <p className="text-2xl font-bold">
                    {stats.rank > 0 ? (
                      <>
                        <span className="text-yellow-300">{stats.rank}</span>
                        <span className="text-base font-normal opacity-80">/{stats.totalAuthors}위</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 작품 목록 - 메인 페이지와 동일한 형식 */}
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
            작품 ({works.length})
          </h3>

          {works.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl">
              <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-gray-500 dark:text-gray-400">아직 공개된 작품이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {works.map((work) => (
                <Link
                  key={work.id}
                  href={`/chat/${work.id}`}
                  className="group bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all hover:scale-[1.02]"
                >
                  {/* Thumbnail - 정사각형 1:1 비율 */}
                  <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative">
                    {work.thumbnail ? (
                      <img
                        src={work.thumbnail}
                        alt={work.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    {/* Character avatars */}
                    <div className="absolute bottom-2 right-2 flex -space-x-2">
                      {work.characters.slice(0, 3).map((char) => (
                        <div
                          key={char.id}
                          className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-800 overflow-hidden"
                          title={char.name}
                        >
                          {char.profileImage ? (
                            <img
                              src={char.profileImage}
                              alt={char.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                              {char.name[0]}
                            </div>
                          )}
                        </div>
                      ))}
                      {work.characters.length > 3 && (
                        <div className="w-7 h-7 rounded-full bg-gray-500 border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs text-white">
                          +{work.characters.length - 3}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-3">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 truncate">
                      {work.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">
                      {work.description}
                    </p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1">
                      {work.tags.slice(0, 3).map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
