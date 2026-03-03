'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import type { Work, Banner } from './types';

interface WorksBrowseViewProps {
  works: Work[];
  onWorkSelect: (work: Work) => void;
}

export default function WorksBrowseView({ works, onWorkSelect }: WorksBrowseViewProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'new-ranking' | 'ranking'>('home');
  const [rankingPeriod, setRankingPeriod] = useState<'realtime' | 'daily' | 'weekly' | 'monthly'>('realtime');
  const [trendingWorks, setTrendingWorks] = useState<Work[]>([]);
  const [newWorks, setNewWorks] = useState<Work[]>([]);
  const [rankingWorks, setRankingWorks] = useState<Work[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'trending' | 'new' | 'all' | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  const trendingScrollRef = useRef<HTMLDivElement>(null);
  const newWorksScrollRef = useRef<HTMLDivElement>(null);
  const allWorksScrollRef = useRef<HTMLDivElement>(null);

  // 배너 로드
  useEffect(() => {
    fetchBanners();
  }, []);

  // 탭/기간 변경 시 데이터 페칭
  useEffect(() => {
    if (activeTab === 'home') {
      fetchTrendingWorks();
      fetchNewWorks();
    } else {
      fetchRankingWorks(activeTab, rankingPeriod);
    }
  }, [activeTab, rankingPeriod]);

  // 배너 자동 슬라이드
  useEffect(() => {
    if (banners.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [banners.length]);

  const fetchTrendingWorks = async () => {
    try {
      const response = await fetch('/api/works?public=true&tab=home-trending&limit=10');
      const data = await response.json();
      setTrendingWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch trending works:', error);
    }
  };

  const fetchNewWorks = async () => {
    try {
      const response = await fetch('/api/works?public=true&tab=home-new&limit=10');
      const data = await response.json();
      setNewWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch new works:', error);
    }
  };

  const fetchRankingWorks = async (tab: 'new-ranking' | 'ranking', period: string) => {
    setTabLoading(true);
    try {
      const response = await fetch(`/api/works?public=true&tab=${tab}&period=${period}&limit=20`);
      const data = await response.json();
      setRankingWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch ranking works:', error);
    } finally {
      setTabLoading(false);
    }
  };

  const fetchBanners = async () => {
    try {
      const response = await fetch('/api/admin/banners');
      const data = await response.json();
      setBanners(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch banners:', error);
    }
  };

  const renderWorkCard = (work: Work, rank?: number) => (
    <div
      key={work.id}
      onClick={() => onWorkSelect(work)}
      className="group bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all hover:scale-[1.02] cursor-pointer"
    >
      <div className="aspect-square bg-gray-200 dark:bg-gray-700 relative">
        {work.thumbnail ? (
          <img src={work.thumbnail} alt={work.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {rank && (
          <div className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            rank <= 3 ? 'bg-primary-600' : 'bg-gray-500'
          }`}>
            {rank}
          </div>
        )}
        <div className="absolute bottom-2 right-2 flex -space-x-2">
          {work.characters.slice(0, 3).map((char) => (
            <div
              key={char.id}
              className="w-7 h-7 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-800 overflow-hidden"
              title={char.name}
            >
              {char.profileImage ? (
                <img src={char.profileImage} alt={char.name} className="w-full h-full object-cover" />
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
      <div className="p-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1 truncate">{work.title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{work.description}</p>
        <div className="flex flex-wrap gap-1">
          {work.tags.slice(0, 3).map((tag, index) => (
            <span key={index} className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );

  const renderScrollSection = (
    title: string,
    sectionWorks: Work[],
    sectionKey: 'trending' | 'new' | 'all',
    scrollRef: React.RefObject<HTMLDivElement | null>,
    emptyMessage: string
  ) => (
    <section className={sectionKey !== 'all' ? 'mb-10' : ''}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
        {sectionWorks.length > 5 && (
          <button
            onClick={() => setExpandedSection(expandedSection === sectionKey ? null : sectionKey)}
            className="text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            {expandedSection === sectionKey ? '접기' : '더보기'}
          </button>
        )}
      </div>
      {sectionWorks.length === 0 ? (
        sectionKey === 'all' ? (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400 mb-4">{emptyMessage}</p>
            <Link
              href="/studio"
              className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              첫 작품 만들기
            </Link>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-4">{emptyMessage}</p>
        )
      ) : expandedSection === sectionKey ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {sectionWorks.map((w) => renderWorkCard(w))}
        </div>
      ) : (
        <div className="relative group/scroll">
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {sectionWorks.map((w) => (
              <div key={w.id} className="flex-shrink-0 w-[calc((100%-64px)/5)] min-w-[150px]">
                {renderWorkCard(w)}
              </div>
            ))}
          </div>
          {sectionWorks.length > 5 && (
            <>
              <button
                onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: 'smooth' })}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-3 w-8 h-8 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity z-10"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: 'smooth' })}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 w-8 h-8 bg-white dark:bg-gray-800 rounded-full shadow-lg flex items-center justify-center opacity-0 group-hover/scroll:opacity-100 transition-opacity z-10"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );

  return (
    <>
      {/* 배너 섹션 - 홈 탭에서만 표시 */}
      {activeTab === 'home' && banners.length > 0 && (
        <div className="mb-8">
          <div className="relative overflow-hidden rounded-2xl bg-gray-200 dark:bg-gray-800" style={{ height: '180px' }}>
            <div
              className="flex transition-transform duration-500 ease-out h-full"
              style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
            >
              {banners.map((banner) => (
                <div key={banner.id} className="w-full flex-shrink-0 h-full">
                  {banner.linkUrl ? (
                    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="block w-full h-full">
                      <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                    </a>
                  ) : (
                    <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                  )}
                </div>
              ))}
            </div>
            {banners.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentBannerIndex((prev) => (prev - 1 + banners.length) % banners.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentBannerIndex((prev) => (prev + 1) % banners.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/30 hover:bg-black/50 text-white rounded-full flex items-center justify-center transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}
            {banners.length > 1 && (
              <div className="absolute bottom-3 right-4 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                {currentBannerIndex + 1} / {banners.length}
              </div>
            )}
            {banners.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                {banners.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentBannerIndex(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentBannerIndex ? 'bg-white' : 'bg-white/50 hover:bg-white/70'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 메인 탭 */}
      <div className="flex gap-6 border-b border-gray-200 dark:border-gray-700 mb-6">
        {(['home', 'new-ranking', 'ranking'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {{ home: '홈', 'new-ranking': '신작랭킹', ranking: '랭킹' }[tab]}
          </button>
        ))}
      </div>

      {/* 홈 탭 */}
      {activeTab === 'home' && (
        <>
          {renderScrollSection('급상승중인 신작', trendingWorks, 'trending', trendingScrollRef, '아직 급상승 신작이 없습니다.')}
          {renderScrollSection('신작추천', newWorks, 'new', newWorksScrollRef, '아직 신작이 없습니다.')}
          {renderScrollSection('전체 작품', works, 'all', allWorksScrollRef, '아직 작품이 없습니다.')}
        </>
      )}

      {/* 신작랭킹 / 랭킹 탭 */}
      {(activeTab === 'new-ranking' || activeTab === 'ranking') && (
        <>
          <div className="flex gap-2 mb-6">
            {(['realtime', 'daily', 'weekly', 'monthly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRankingPeriod(p)}
                className={`px-4 py-1.5 rounded-full text-sm transition-colors ${
                  rankingPeriod === p
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {{ realtime: '실시간', daily: '일간', weekly: '주간', monthly: '월간' }[p]}
              </button>
            ))}
          </div>

          {tabLoading ? (
            <div className="text-center py-12">
              <div className="inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
            </div>
          ) : rankingWorks.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
              해당 기간에 랭킹 데이터가 없습니다.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {rankingWorks.map((w, index) => renderWorkCard(w, index + 1))}
            </div>
          )}
        </>
      )}
    </>
  );
}
