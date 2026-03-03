'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import MainHeader from '@/components/MainHeader';
import PersonaModal from '@/components/PersonaModal';
import ProfileEditModal from '@/components/HomePage/ProfileEditModal';
import { useLayout } from '@/contexts/LayoutContext';
import { useProfile } from '@/components/HomePage/useProfile';
import type { Work } from '@/components/HomePage/types';
import WorksBrowseView from '@/components/HomePage/WorksBrowseView';
import MyWorksView from '@/components/HomePage/MyWorksView';
import WorkDetailModal from '@/components/HomePage/WorkDetailModal';

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { sidebarOpen, sidebarCollapsed } = useLayout();

  // 핵심 상태 (6개)
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [currentView, setCurrentView] = useState<'works' | 'myworks'>('works');
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [scrollToComments, setScrollToComments] = useState(false);

  // 프로필 커스텀 훅
  const {
    profileForm,
    setProfileForm,
    profileImage,
    profileSaving,
    profileImageUploading,
    profileImageInputRef,
    handleProfileImageChange,
    handleSaveProfile,
  } = useProfile(session);

  // 시간 표시 유틸리티
  const getTimeAgo = useCallback((dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '방금 전';
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString('ko-KR');
  }, []);

  // 초기 데이터 로드
  useEffect(() => {
    fetchWorks();

    // URL 쿼리 파라미터로 초기 뷰 설정
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'myworks') {
        setCurrentView('myworks');
      }
    }
  }, []);

  // URL의 workId 파라미터로 작품 상세 모달 열기
  useEffect(() => {
    if (typeof window !== 'undefined' && works.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const workId = params.get('workId');
      const scrollTo = params.get('scrollTo');
      if (workId) {
        const work = works.find((w) => w.id === workId);
        if (work) {
          setSelectedWork(work);
          if (scrollTo === 'comments') {
            setScrollToComments(true);
          }
          router.replace('/', { scroll: false });
        }
      }
    }
  }, [works, router]);

  const fetchWorks = async () => {
    try {
      const response = await fetch('/api/works?public=true');
      const data = await response.json();
      setWorks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch works:', error);
    } finally {
      setLoading(false);
    }
  };

  // 좋아요 변경 시 works 배열 동기화
  const handleLikeUpdate = useCallback((workId: string, liked: boolean) => {
    setWorks((prevWorks) =>
      prevWorks.map((w) =>
        w.id === workId
          ? { ...w, _count: { ...w._count, likes: liked ? w._count.likes + 1 : w._count.likes - 1 } }
          : w
      )
    );
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600 dark:text-gray-400">
          로딩 중...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <MainHeader
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          if (view === 'works') {
            window.history.replaceState({}, '', '/');
          }
        }}
        profileImage={profileImage}
        profileName={profileForm.nickname}
      />

      {/* Chat History Sidebar */}
      <ChatHistorySidebar />

      {/* Main Content Wrapper */}
      <div className={`pt-16 transition-all duration-300 ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}`}>
        <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
          {/* 작품 목록 뷰 */}
          {currentView === 'works' && (
            <WorksBrowseView
              works={works}
              onWorkSelect={setSelectedWork}
            />
          )}

          {/* 내 작품 뷰 */}
          {currentView === 'myworks' && (
            <MyWorksView
              session={session}
              status={status}
              profileImage={profileImage}
              profileForm={profileForm}
              onProfileEditOpen={() => setProfileEditOpen(true)}
              onViewChange={setCurrentView}
            />
          )}

          {/* Work Detail Modal */}
          {selectedWork && (
            <WorkDetailModal
              work={selectedWork}
              session={session}
              status={status}
              onClose={() => {
                setSelectedWork(null);
                setScrollToComments(false);
              }}
              onWorkSelect={setSelectedWork}
              onLikeUpdate={handleLikeUpdate}
              getTimeAgo={getTimeAgo}
              scrollToComments={scrollToComments}
            />
          )}

          {/* Profile Edit Modal */}
          {profileEditOpen && (
            <ProfileEditModal
              profileForm={profileForm}
              profileImage={profileImage}
              profileImageInputRef={profileImageInputRef}
              profileSaving={profileSaving}
              profileImageUploading={profileImageUploading}
              userEmail={session?.user?.email}
              onFormChange={setProfileForm}
              onImageChange={handleProfileImageChange}
              onSave={() => handleSaveProfile(() => {
                setProfileEditOpen(false);
                setCurrentView('myworks');
              })}
              onClose={() => setProfileEditOpen(false)}
            />
          )}

          {/* 페르소나 관리 모달 */}
          <PersonaModal
            isOpen={personaModalOpen}
            onClose={() => setPersonaModalOpen(false)}
            showSelectMode={false}
          />
        </main>
      </div>
    </div>
  );
}
