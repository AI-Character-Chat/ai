'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import ChatHistorySidebar from '@/components/ChatHistorySidebar';
import MainHeader from '@/components/MainHeader';
import PersonaModal from '@/components/PersonaModal';
import PersonaManager from '@/components/PersonaManager';
import SearchModal from '@/components/HomePage/SearchModal';
import NotificationsModal from '@/components/HomePage/NotificationsModal';
import ProfileEditModal from '@/components/HomePage/ProfileEditModal';
import { useLayout } from '@/contexts/LayoutContext';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  order: number;
}

interface Opening {
  id: string;
  title: string;
  content: string;
  isDefault: boolean;
}

interface Author {
  id: string;
  name: string | null;
  image: string | null;
  bio: string | null;
}

interface Work {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  tags: string[];
  visibility: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  authorId: string | null;
  author: Author | null;
  characters: { id: string; name: string; profileImage: string | null }[];
  openings: Opening[];
  _count: {
    characters: number;
    openings: number;
    lorebook: number;
    chatSessions: number;
    likes: number;
  };
}

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  isPinned: boolean;
  likeCount: number;
  isLiked: boolean;
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  replies: Comment[];
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { sidebarOpen, sidebarCollapsed } = useLayout();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [showIntro, setShowIntro] = useState(false);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [openingDropdownOpen, setOpeningDropdownOpen] = useState(false);
  const [openingContentExpanded, setOpeningContentExpanded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Work[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<{
    id: string;
    type: string;
    title: string;
    content: string;
    link: string | null;
    isRead: boolean;
    createdAt: string;
  }[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [currentView, setCurrentView] = useState<'works' | 'myworks'>('works');
  const [myWorks, setMyWorks] = useState<Work[]>([]);
  const [myWorksLoading, setMyWorksLoading] = useState(false);
  const [myWorksSortBy, setMyWorksSortBy] = useState<'chatSessions' | 'likes' | 'newest' | 'oldest'>('newest');
  const [myWorksSortDropdownOpen, setMyWorksSortDropdownOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [personaModalOpen, setPersonaModalOpen] = useState(false);
  const [myPageTab, setMyPageTab] = useState<'works' | 'persona'>('works'); // 마이페이지 탭

  // 메인 탭 (홈/신작랭킹/랭킹)
  const [activeTab, setActiveTab] = useState<'home' | 'new-ranking' | 'ranking'>('home');
  const [rankingPeriod, setRankingPeriod] = useState<'realtime' | 'daily' | 'weekly' | 'monthly'>('realtime');
  const [trendingWorks, setTrendingWorks] = useState<Work[]>([]);
  const [newWorks, setNewWorks] = useState<Work[]>([]);
  const [rankingWorks, setRankingWorks] = useState<Work[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  // 배너
  const [banners, setBanners] = useState<Banner[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);

  // 작가의 다른 작품
  const [authorWorks, setAuthorWorks] = useState<Work[]>([]);

  // 작가 팔로우 상태
  const [isFollowingAuthor, setIsFollowingAuthor] = useState(false);
  const [authorFollowersCount, setAuthorFollowersCount] = useState(0);
  const [followLoading, setFollowLoading] = useState(false);

  // 댓글
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [scrollToComments, setScrollToComments] = useState(false);
  const commentsSectionRef = useRef<HTMLDivElement>(null);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [showEmojiPicker, setShowEmojiPicker] = useState<'comment' | 'reply' | null>(null);
  const [commentMenuOpen, setCommentMenuOpen] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportingCommentId, setReportingCommentId] = useState<string | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [profileForm, setProfileForm] = useState({
    nickname: '',
    bio: '',
    birthDate: '',
    gender: 'private' as 'male' | 'female' | 'private',
  });
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const profileImageInputRef = useRef<HTMLInputElement>(null);

  // 이어서 대화하기용 최근 세션
  const [recentSession, setRecentSession] = useState<{ id: string; workId: string } | null>(null);

  useEffect(() => {
    fetchWorks();
    fetchNotifications();
    fetchBanners();
    // 홈 탭 초기 데이터
    fetchTrendingWorks();
    fetchNewWorks();

    // URL 쿼리 파라미터로 초기 뷰 설정
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'myworks') {
        setCurrentView('myworks');
      }
    }
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
          // 댓글 섹션으로 스크롤 해야 하는 경우
          if (scrollTo === 'comments') {
            setScrollToComments(true);
          }
          // URL에서 파라미터 제거 (히스토리 정리)
          router.replace('/', { scroll: false });
        }
      }
    }
  }, [works]);

  // 댓글 섹션으로 스크롤
  useEffect(() => {
    if (scrollToComments && selectedWork && !commentsLoading && commentsSectionRef.current) {
      setTimeout(() => {
        commentsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setScrollToComments(false);
      }, 300);
    }
  }, [scrollToComments, selectedWork, commentsLoading]);

  // 배너 자동 슬라이드
  useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentBannerIndex((prev) => (prev + 1) % banners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [banners.length]);

  // 내 작품 탭으로 전환 시 데이터 로드
  useEffect(() => {
    if (currentView === 'myworks' && status === 'authenticated' && myWorks.length === 0) {
      fetchMyWorks();
    }
  }, [currentView, status]);

  // 프로필 폼 초기화 - API에서 데이터 가져오기
  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user) {
        try {
          const response = await fetch('/api/user/profile');
          if (response.ok) {
            const data = await response.json();
            setProfileForm({
              nickname: data.name || '',
              bio: data.bio || '',
              birthDate: data.birthDate ? data.birthDate.split('T')[0] : '',
              gender: data.gender || 'private',
            });
            setProfileImage(data.image || null);
          } else {
            // API 실패 시 세션 데이터 사용
            setProfileForm((prev) => ({
              ...prev,
              nickname: session.user?.name || '',
            }));
            setProfileImage(session.user?.image || null);
          }
        } catch (error) {
          console.error('Failed to fetch profile:', error);
          setProfileForm((prev) => ({
            ...prev,
            nickname: session.user?.name || '',
          }));
          setProfileImage(session.user?.image || null);
        }
      }
    };
    fetchProfile();
  }, [session]);

  // 프로필 이미지 업로드 핸들러
  const handleProfileImageChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 파일 크기 체크 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }

    // 이미지 타입 체크
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.');
      return;
    }

    setProfileImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setProfileImage(data.url);
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setProfileImageUploading(false);
    }
  }, []);

  // 프로필 저장 핸들러
  const handleSaveProfile = useCallback(async () => {
    setProfileSaving(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profileForm.nickname,
          image: profileImage,
          bio: profileForm.bio,
          birthDate: profileForm.birthDate || null,
          gender: profileForm.gender,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Profile save error:', errorData);
        throw new Error(errorData.error || 'Save failed');
      }

      // 모달 닫고 마이페이지로 돌아가기
      setProfileEditOpen(false);
      setCurrentView('myworks');

      // 프로필 정보 다시 로드
      const profileResponse = await fetch('/api/user/profile');
      if (profileResponse.ok) {
        const data = await profileResponse.json();
        setProfileForm({
          nickname: data.name || '',
          bio: data.bio || '',
          birthDate: data.birthDate ? data.birthDate.split('T')[0] : '',
          gender: data.gender || 'private',
        });
        setProfileImage(data.image || null);
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('프로필 저장에 실패했습니다.');
    } finally {
      setProfileSaving(false);
    }
  }, [profileForm, profileImage]);

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/notifications');
      const data = await response.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const markNotificationsAsRead = async () => {
    if (unreadCount === 0) return;
    try {
      await fetch('/api/notifications', { method: 'PATCH' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
    }
  };

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

  // 선택된 작품의 좋아요 상태 가져오기
  useEffect(() => {
    if (selectedWork) {
      setLikeCount(selectedWork._count.likes);
      fetchLikeStatus(selectedWork.id);
      // 기본 오프닝 선택
      const defaultOpening = selectedWork.openings.find((o) => o.isDefault);
      setSelectedOpeningId(defaultOpening?.id || selectedWork.openings[0]?.id || null);
      // 작가의 다른 작품 로드 및 팔로우 상태 확인
      if (selectedWork.authorId) {
        fetchAuthorWorks(selectedWork.authorId, selectedWork.id);
        fetchAuthorFollowStatus(selectedWork.authorId);
      } else {
        setAuthorWorks([]);
        setIsFollowingAuthor(false);
        setAuthorFollowersCount(0);
      }
      // 댓글 로드
      fetchComments(selectedWork.id);
      // 최근 세션 확인 (로그인한 경우)
      if (status === 'authenticated') {
        fetchRecentSession(selectedWork.id);
      } else {
        setRecentSession(null);
      }
    }
  }, [selectedWork, status]);

  // 해당 작품의 최근 채팅 세션 가져오기
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
    if (!selectedWork?.authorId) return;
    if (status !== 'authenticated') {
      alert('팔로우하려면 로그인이 필요합니다.');
      return;
    }

    setFollowLoading(true);
    try {
      const response = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: selectedWork.authorId })
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

  const fetchAuthorWorks = async (authorId: string, currentWorkId: string) => {
    try {
      const response = await fetch(`/api/works?authorId=${authorId}&public=true`);
      const data = await response.json();
      // 현재 작품 제외
      setAuthorWorks(Array.isArray(data) ? data.filter((w: Work) => w.id !== currentWorkId) : []);
    } catch (error) {
      console.error('Failed to fetch author works:', error);
      setAuthorWorks([]);
    }
  };

  // 댓글 조회
  const fetchComments = async (workId: string) => {
    setCommentsLoading(true);
    try {
      const response = await fetch(`/api/comments?workId=${workId}`);
      const data = await response.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to fetch comments:', error);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  // 댓글 작성
  const handleSubmitComment = async (parentId?: string) => {
    const content = parentId ? replyContent : newComment;
    if (!content.trim() || !selectedWork) return;

    setCommentSubmitting(true);
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workId: selectedWork.id,
          content: content.trim(),
          parentId: parentId || null,
        }),
      });

      if (response.ok) {
        // 댓글 목록 새로고침
        await fetchComments(selectedWork.id);
        setNewComment('');
        setReplyContent('');
        setReplyingTo(null);
      }
    } catch (error) {
      console.error('Failed to submit comment:', error);
    } finally {
      setCommentSubmitting(false);
    }
  };

  // 댓글 삭제
  const handleDeleteComment = async (commentId: string) => {
    if (!confirm('댓글을 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/comments?commentId=${commentId}`, {
        method: 'DELETE',
      });

      if (response.ok && selectedWork) {
        await fetchComments(selectedWork.id);
      }
    } catch (error) {
      console.error('Failed to delete comment:', error);
    }
  };

  // 댓글 고정/해제
  const handlePinComment = async (commentId: string, isPinned: boolean) => {
    try {
      const response = await fetch('/api/comments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, isPinned }),
      });

      if (response.ok && selectedWork) {
        await fetchComments(selectedWork.id);
      }
    } catch (error) {
      console.error('Failed to pin comment:', error);
    }
  };

  // 댓글 좋아요 토글
  const handleLikeComment = async (commentId: string) => {
    if (!session?.user) return;

    try {
      const response = await fetch('/api/comments/like', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId }),
      });

      if (response.ok) {
        const data = await response.json();
        // 로컬 상태 업데이트 (전체 새로고침 없이)
        setComments((prev) =>
          prev.map((comment) => {
            if (comment.id === commentId) {
              return { ...comment, isLiked: data.isLiked, likeCount: data.likeCount };
            }
            return {
              ...comment,
              replies: comment.replies.map((reply) =>
                reply.id === commentId
                  ? { ...reply, isLiked: data.isLiked, likeCount: data.likeCount }
                  : reply
              ),
            };
          })
        );
      }
    } catch (error) {
      console.error('Failed to like comment:', error);
    }
  };

  // 답글 펼침/접힘 토글
  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  // 이모지 삽입
  const insertEmoji = (emoji: string) => {
    if (showEmojiPicker === 'comment') {
      setNewComment((prev) => prev + emoji);
    } else if (showEmojiPicker === 'reply') {
      setReplyContent((prev) => prev + emoji);
    }
    setShowEmojiPicker(null);
  };

  // 자주 쓰는 이모지 목록
  const popularEmojis = ['😊', '😂', '❤️', '👍', '🔥', '😍', '🥺', '😭', '🤔', '👏', '🎉', '✨', '💕', '😘', '🥰', '😎'];

  // 신고 사유 목록
  const reportReasons = [
    { value: 'inappropriate', label: '선정적인 내용을 포함하고 있어요' },
    { value: 'profanity', label: '욕설을 포함하고 있어요' },
    { value: 'harassment', label: '불쾌한 대화를 포함하고 있어요' },
    { value: 'copyright', label: '저작권을 침해하고 있어요' },
    { value: 'other', label: '기타' },
  ];

  // 댓글 신고
  const handleReportComment = async () => {
    if (!reportingCommentId || !reportReason) return;

    setReportSubmitting(true);
    try {
      const response = await fetch('/api/comments/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: reportingCommentId,
          reason: reportReason,
          description: reportDescription,
        }),
      });

      if (response.ok) {
        alert('신고가 접수되었습니다.');
        setReportModalOpen(false);
        setReportingCommentId(null);
        setReportReason('');
        setReportDescription('');
      } else {
        alert('신고 접수에 실패했습니다.');
      }
    } catch (error) {
      console.error('Failed to report comment:', error);
      alert('신고 접수에 실패했습니다.');
    } finally {
      setReportSubmitting(false);
    }
  };

  // 검색 모달이 열릴 때 input에 포커스 & ESC 키로 닫기
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  // 검색 쿼리가 변경될 때 검색 실행
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results = works.filter(
      (work) =>
        work.title.toLowerCase().includes(query) ||
        work.description.toLowerCase().includes(query) ||
        work.tags.some((tag) => tag.toLowerCase().includes(query)) ||
        work.characters.some((char) => char.name.toLowerCase().includes(query))
    );
    setSearchResults(results);
  }, [searchQuery, works]);

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

  // 탭별 데이터 페칭
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
    if (!selectedWork || status !== 'authenticated') {
      alert('좋아요를 누르려면 로그인이 필요합니다.');
      return;
    }

    try {
      const response = await fetch(`/api/works/${selectedWork.id}/like`, {
        method: 'POST',
      });
      const data = await response.json();
      setIsLiked(data.liked);
      setLikeCount((prev) => (data.liked ? prev + 1 : prev - 1));

      // works 배열에서도 업데이트
      setWorks((prevWorks) =>
        prevWorks.map((w) =>
          w.id === selectedWork.id
            ? { ...w, _count: { ...w._count, likes: data.liked ? w._count.likes + 1 : w._count.likes - 1 } }
            : w
        )
      );
    } catch (error) {
      console.error('Failed to toggle like:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-gray-600 dark:text-gray-400">
          로딩 중...
        </div>
      </div>
    );
  }

  // 작품 카드 렌더링 헬퍼
  const renderWorkCard = (work: Work, rank?: number) => (
    <div
      key={work.id}
      onClick={() => setSelectedWork(work)}
      className="group bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-all hover:scale-[1.02] cursor-pointer"
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        {/* 순위 배지 */}
        {rank && (
          <div className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
            rank <= 3 ? 'bg-primary-600' : 'bg-gray-500'
          }`}>
            {rank}
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
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Header - 공통 컴포넌트 사용 (검색/알림 기능 내장) */}
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

      {/* Chat History Sidebar - 공통 컴포넌트 (Context 사용) */}
      <ChatHistorySidebar />

      {/* Main Content Wrapper - 헤더 높이만큼 상단 패딩, 사이드바 열리면 왼쪽 여백 추가 */}
      <div className={`pt-16 transition-all duration-300 ${sidebarOpen && !sidebarCollapsed ? 'lg:ml-80' : sidebarOpen && sidebarCollapsed ? 'lg:ml-16' : ''}`}>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* 작품 목록 뷰 */}
        {currentView === 'works' && (
          <>
            {/* 배너 섹션 - 홈 탭에서만 표시 */}
            {activeTab === 'home' && banners.length > 0 && (
              <div className="mb-8">
                <div className="relative overflow-hidden rounded-2xl bg-gray-200 dark:bg-gray-800" style={{ height: '180px' }}>
                  {/* 배너 슬라이드 */}
                  <div
                    className="flex transition-transform duration-500 ease-out h-full"
                    style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
                  >
                    {banners.map((banner) => (
                      <div key={banner.id} className="w-full flex-shrink-0 h-full">
                        {banner.linkUrl ? (
                          <a
                            href={banner.linkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-full h-full"
                          >
                            <img
                              src={banner.imageUrl}
                              alt={banner.title}
                              className="w-full h-full object-cover"
                            />
                          </a>
                        ) : (
                          <img
                            src={banner.imageUrl}
                            alt={banner.title}
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 이전/다음 버튼 */}
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

                  {/* 인디케이터 */}
                  {banners.length > 1 && (
                    <div className="absolute bottom-3 right-4 px-3 py-1 bg-black/50 rounded-full text-white text-xs">
                      {currentBannerIndex + 1} / {banners.length}
                    </div>
                  )}

                  {/* 도트 인디케이터 */}
                  {banners.length > 1 && (
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {banners.map((_, index) => (
                        <button
                          key={index}
                          onClick={() => setCurrentBannerIndex(index)}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            index === currentBannerIndex
                              ? 'bg-white'
                              : 'bg-white/50 hover:bg-white/70'
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
                {/* 급상승중인 신작 */}
                <section className="mb-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">급상승중인 신작</h3>
                  {trendingWorks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4">아직 급상승 신작이 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {trendingWorks.map((work) => renderWorkCard(work))}
                    </div>
                  )}
                </section>

                {/* 신작추천 */}
                <section className="mb-10">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">신작추천</h3>
                  {newWorks.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 py-4">아직 신작이 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {newWorks.map((work) => renderWorkCard(work))}
                    </div>
                  )}
                </section>

                {/* 전체 작품 */}
                <section>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">전체 작품</h3>
                  {works.length === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-gray-500 dark:text-gray-400 mb-4">아직 작품이 없습니다.</p>
                      <Link
                        href="/studio"
                        className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        첫 작품 만들기
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                      {works.map((work) => renderWorkCard(work))}
                    </div>
                  )}
                </section>
              </>
            )}

            {/* 신작랭킹 / 랭킹 탭 */}
            {(activeTab === 'new-ranking' || activeTab === 'ranking') && (
              <>
                {/* 기간 서브탭 */}
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

                {/* 랭킹 리스트 */}
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
                    {rankingWorks.map((work, index) => renderWorkCard(work, index + 1))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* 내 작품 뷰 */}
        {currentView === 'myworks' && (
          <>
            {/* 마이페이지 타이틀 & 뒤로가기 */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={() => setCurrentView('works')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="뒤로가기"
              >
                <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                마이페이지
              </h1>
            </div>

            {/* User Info - 상단에 배치 */}
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
                {/* Camera icon overlay */}
                <button
                  onClick={() => setProfileEditOpen(true)}
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
                onClick={() => setProfileEditOpen(true)}
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

                  {/* Sort Dropdown */}
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
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMyWorksSortDropdownOpen(false)}
                        />
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

            {/* My Works List - 검색 결과처럼 리스트 형식 */}
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
                    {/* Thumbnail */}
                    <div className="w-16 h-16 flex-shrink-0 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                      {work.thumbnail ? (
                        <img
                          src={work.thumbnail}
                          alt={work.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                      {/* Visibility Badge */}
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

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {work.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                        {work.description}
                      </p>
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

                    {/* Edit Button */}
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
        )}

        {/* Work Detail Modal */}
        {selectedWork && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => { setSelectedWork(null); setShowIntro(false); setOpeningDropdownOpen(false); }}
          >
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden shadow-2xl flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header - 고정 */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={() => { setSelectedWork(null); setShowIntro(false); setOpeningDropdownOpen(false); }}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">작품 상세</h2>
                <div className="w-10" /> {/* Spacer */}
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1">
                {/* Top Section: Thumbnail + Details */}
                <div className="flex flex-col md:flex-row">
                  {/* Left: Thumbnail + Author */}
                  <div className="md:w-1/2 p-6 flex-shrink-0">
                    <div className="aspect-square bg-gray-200 dark:bg-gray-800 rounded-xl overflow-hidden">
                      {selectedWork.thumbnail ? (
                        <img
                          src={selectedWork.thumbnail}
                          alt={selectedWork.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {/* 작가 정보 */}
                    {selectedWork.author && (
                      <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                        <div className="flex items-start gap-3">
                          {/* 프로필 이미지 - 클릭 시 작가 페이지로 이동 */}
                          <Link
                            href={`/author/${selectedWork.author.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                          >
                            {selectedWork.author.image ? (
                              <img
                                src={selectedWork.author.image}
                                alt={selectedWork.author.name || ''}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-sm text-gray-500 bg-gradient-to-br from-violet-500 to-purple-600">
                                <span className="text-white font-bold">
                                  {selectedWork.author.name?.[0] || '?'}
                                </span>
                              </div>
                            )}
                          </Link>

                          {/* 작가 정보 */}
                          <div className="flex-1 min-w-0">
                            <Link
                              href={`/author/${selectedWork.author.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-sm font-semibold text-gray-900 dark:text-white hover:text-pink-500 dark:hover:text-pink-400 transition-colors"
                            >
                              {selectedWork.author.name || '알 수 없음'}
                            </Link>
                            {selectedWork.author.bio && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">
                                {selectedWork.author.bio}
                              </p>
                            )}
                            {!selectedWork.author.bio && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">작가</p>
                            )}
                          </div>

                          {/* 팔로우 버튼 */}
                          {session?.user?.id !== selectedWork.author.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFollowToggle();
                              }}
                              disabled={followLoading}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors flex-shrink-0 ${
                                isFollowingAuthor
                                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                  : 'bg-pink-500 text-white hover:bg-pink-600'
                              } disabled:opacity-50`}
                            >
                              {followLoading ? (
                                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                              ) : isFollowingAuthor ? (
                                '팔로잉'
                              ) : (
                                '팔로우'
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: Details */}
                  <div className="md:w-1/2 p-6 flex flex-col">
                  {/* Title */}
                  <div className="flex items-start justify-between mb-3">
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                      {selectedWork.title}
                    </h1>
                    <button
                      onClick={handleLikeToggle}
                      className={`p-2 transition-colors ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                    >
                      <svg className="w-6 h-6" fill={isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                    </button>
                  </div>

                  {/* Stats - 총 대화수, 좋아요 */}
                  <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                    {/* 대화 아이콘 + 총 대화수 */}
                    <div className="flex items-center gap-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      <span>{selectedWork._count.chatSessions.toLocaleString()}</span>
                    </div>
                    <span>•</span>
                    {/* 하트 아이콘 + 좋아요 수 */}
                    <div className="flex items-center gap-1.5">
                      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                      </svg>
                      <span>{likeCount.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Characters & Update Date - 등장 캐릭터 & 업데이트 날짜 */}
                  {selectedWork.characters.length > 0 && (
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex -space-x-4">
                        {selectedWork.characters.slice(0, 8).map((char, index) => (
                          <div
                            key={char.id}
                            className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 border-2 border-white dark:border-gray-800 overflow-hidden hover:z-10 hover:scale-110 transition-transform"
                            style={{ zIndex: selectedWork.characters.length - index }}
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
                        {selectedWork._count.characters > 8 && (
                          <div
                            className="w-8 h-8 rounded-full bg-gray-600 border-2 border-white dark:border-gray-800 flex items-center justify-center text-xs text-white font-medium"
                            style={{ zIndex: 0 }}
                          >
                            +{selectedWork._count.characters - 8}
                          </div>
                        )}
                      </div>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        캐릭터 {selectedWork._count.characters}명
                      </span>
                      {/* 업데이트 날짜 */}
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        업데이트: {new Date(selectedWork.updatedAt).toLocaleDateString('ko-KR')}
                      </span>
                    </div>
                  )}

                  {/* Description */}
                  <div className="flex-1 mb-4 overflow-y-auto max-h-48">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line leading-relaxed text-sm">
                      {selectedWork.description || '설명이 없습니다.'}
                    </p>
                  </div>

                  {/* Tags */}
                  {selectedWork.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedWork.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full border border-gray-200 dark:border-gray-700"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Date Info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400 mb-6">
                    <span>생성일: {new Date(selectedWork.createdAt).toLocaleDateString('ko-KR')}</span>
                    {selectedWork.publishedAt && (
                      <span>론칭일: {new Date(selectedWork.publishedAt).toLocaleDateString('ko-KR')}</span>
                    )}
                  </div>

                  {/* Action Buttons */}
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
                      href={`/chat/${selectedWork.id}`}
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

                {/* Opening Scenarios - 드롭다운 선택 방식 */}
                {selectedWork.openings && selectedWork.openings.length > 0 && (
                  <div className="px-6 pb-6 border-t border-gray-200 dark:border-gray-700">
                    <div className="py-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        오프닝 시나리오
                      </h3>

                      {/* 드롭다운 선택 */}
                      <div className="relative">
                        <button
                          onClick={() => setOpeningDropdownOpen(!openingDropdownOpen)}
                          className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-between text-left hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        >
                          <span className="text-gray-900 dark:text-white font-medium">
                            {selectedWork.openings.find((o) => o.id === selectedOpeningId)?.title || '오프닝 선택'}
                          </span>
                          <svg
                            className={`w-5 h-5 text-gray-500 transition-transform ${openingDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {/* 드롭다운 메뉴 */}
                        {openingDropdownOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-gray-100 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg z-10 overflow-hidden">
                            {selectedWork.openings.map((opening) => (
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

                      {/* 선택된 오프닝 내용 표시 */}
                      {selectedOpeningId && (() => {
                        const selectedOpening = selectedWork.openings.find((o) => o.id === selectedOpeningId);
                        const content = selectedOpening?.content || '';
                        const isLongContent = content.length > 300;

                        return (
                          <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                            <div className="relative">
                              <p
                                className={`text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line leading-relaxed ${
                                  !openingContentExpanded && isLongContent ? 'line-clamp-5' : ''
                                }`}
                              >
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
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        이 작가의 작품들
                      </h3>
                    </div>
                    {/* 가로 스크롤 캐러셀 */}
                    <div className="relative group/carousel">
                      <div
                        className="flex gap-3 overflow-x-auto scrollbar-hide px-6 pb-2"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        {authorWorks.map((work) => (
                          <div
                            key={work.id}
                            onClick={() => {
                              setSelectedWork(work);
                              setOpeningContentExpanded(false);
                              setOpeningDropdownOpen(false);
                            }}
                            className="cursor-pointer group flex-shrink-0"
                            style={{ width: '140px' }}
                          >
                            {/* Thumbnail */}
                            <div className="aspect-[3/4] bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden relative">
                              {work.thumbnail ? (
                                <img
                                  src={work.thumbnail}
                                  alt={work.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-gray-400">
                                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                  </svg>
                                </div>
                              )}
                              {/* Stats Overlay */}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                                <div className="flex items-center gap-2 text-white text-xs">
                                  <span className="flex items-center gap-0.5">
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                      <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    {work._count.likes}
                                  </span>
                                  <span className="flex items-center gap-0.5">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                    {work._count.chatSessions}
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Title */}
                            <h4 className="mt-2 text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-pink-500 transition-colors">
                              {work.title}
                            </h4>
                            {/* Tags */}
                            <div className="flex flex-wrap gap-1 mt-1">
                              {work.tags.slice(0, 2).map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs text-gray-500 dark:text-gray-400"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* 우측 화살표 (작품이 5개 이상일 때만 표시) */}
                      {authorWorks.length > 4 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const container = e.currentTarget.parentElement?.querySelector('.overflow-x-auto');
                            if (container) {
                              container.scrollBy({ left: 300, behavior: 'smooth' });
                            }
                          }}
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
                <div ref={commentsSectionRef} className="pb-6 border-t border-gray-200 dark:border-gray-700">
                  <div className="py-4 px-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      댓글 {comments.length > 0 && `(${comments.length})`}
                    </h3>
                  </div>

                  {/* 댓글 작성 폼 */}
                  {session?.user ? (
                    <div className="px-6 pb-4">
                      <div className="flex gap-3">
                        <Link
                          href={`/author/${session.user.id}`}
                          className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {session.user.image ? (
                            <img
                              src={session.user.image}
                              alt={session.user.name || ''}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-violet-500 to-purple-600">
                              <span className="text-sm font-bold text-white">
                                {session.user.name?.[0] || '?'}
                              </span>
                            </div>
                          )}
                        </Link>
                        <div className="flex-1">
                          <div className="relative">
                            <textarea
                              value={newComment}
                              onChange={(e) => setNewComment(e.target.value)}
                              placeholder="댓글을 작성해주세요..."
                              className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                              rows={2}
                              maxLength={500}
                            />
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">{newComment.length}/500</span>
                              {/* 이모지 버튼 */}
                              <div className="relative">
                                <button
                                  onClick={() => setShowEmojiPicker(showEmojiPicker === 'comment' ? null : 'comment')}
                                  className="p-1.5 text-gray-500 hover:text-pink-500 transition-colors"
                                  title="이모지"
                                >
                                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </button>
                                {showEmojiPicker === 'comment' && (
                                  <>
                                    <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(null)} />
                                    <div className="absolute bottom-full left-0 mb-2 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 grid grid-cols-8 gap-1 w-64">
                                      {popularEmojis.map((emoji) => (
                                        <button
                                          key={emoji}
                                          onClick={() => insertEmoji(emoji)}
                                          className="p-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                          {emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleSubmitComment()}
                              disabled={!newComment.trim() || commentSubmitting}
                              className="px-4 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {commentSubmitting ? '작성 중...' : '등록'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="px-6 pb-4">
                      <div className="text-center py-4 bg-gray-100 dark:bg-gray-800 rounded-xl">
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                          댓글을 작성하려면 로그인이 필요합니다.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* 댓글 목록 */}
                  <div className="px-6">
                    {commentsLoading ? (
                      <div className="text-center py-8">
                        <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        아직 댓글이 없습니다. 첫 댓글을 작성해보세요!
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {comments.map((comment) => (
                          <div key={comment.id} className="space-y-3">
                            {/* 댓글 */}
                            <div className="flex gap-3">
                              <Link
                                href={`/author/${comment.user.id}`}
                                className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {comment.user.image ? (
                                  <img
                                    src={comment.user.image}
                                    alt={comment.user.name || ''}
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500">
                                    <span className="text-sm font-bold text-white">
                                      {comment.user.name?.[0] || '?'}
                                    </span>
                                  </div>
                                )}
                              </Link>
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    {comment.isPinned && (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 rounded-full text-xs font-medium">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                          <path d="M10 2a.75.75 0 01.75.75v5.59l1.95-2.1a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0L6.2 7.26a.75.75 0 111.1-1.02l1.95 2.1V2.75A.75.75 0 0110 2z" />
                                          <path d="M5.273 4.5a1.25 1.25 0 00-1.205.918l-1.523 5.52c-.006.02-.01.041-.015.062H6a1 1 0 01.894.553l.448.894a1 1 0 00.894.553h3.438a1 1 0 00.86-.49l.606-1.02A1 1 0 0114 11h3.47a1.318 1.318 0 00-.015-.062l-1.523-5.52a1.25 1.25 0 00-1.205-.918H5.273z" />
                                        </svg>
                                        고정됨
                                      </span>
                                    )}
                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                      {comment.user.name || '익명'}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {getTimeAgo(comment.createdAt)}
                                    </span>
                                  </div>
                                  {/* 더보기 메뉴 (점3개) - 오른쪽 끝 배치 */}
                                  <div className="relative">
                                    <button
                                      onClick={() => setCommentMenuOpen(commentMenuOpen === comment.id ? null : comment.id)}
                                      className="flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                      title="더보기"
                                    >
                                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                        <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                      </svg>
                                    </button>
                                    {commentMenuOpen === comment.id && (
                                      <>
                                        <div className="fixed inset-0 z-10" onClick={() => setCommentMenuOpen(null)} />
                                        <div className="absolute right-0 mt-1 w-32 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                                          {/* 고정/해제 - 작품 작성자만 */}
                                          {session?.user?.id === selectedWork?.authorId && (
                                            <button
                                              onClick={() => {
                                                setCommentMenuOpen(null);
                                                handlePinComment(comment.id, !comment.isPinned);
                                              }}
                                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                              <svg className="w-4 h-4" fill={comment.isPinned ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                              </svg>
                                              {comment.isPinned ? '고정 해제' : '댓글 고정'}
                                            </button>
                                          )}
                                          {/* 삭제 - 본인 또는 작가만 */}
                                          {(session?.user?.id === comment.user.id || session?.user?.id === selectedWork?.authorId) && (
                                            <button
                                              onClick={() => {
                                                setCommentMenuOpen(null);
                                                handleDeleteComment(comment.id);
                                              }}
                                              className="w-full px-4 py-2.5 text-left text-sm text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                              </svg>
                                              삭제
                                            </button>
                                          )}
                                          {/* 신고 - 로그인 사용자 */}
                                          {session?.user && session.user.id !== comment.user.id && (
                                            <button
                                              onClick={() => {
                                                setCommentMenuOpen(null);
                                                setReportingCommentId(comment.id);
                                                setReportModalOpen(true);
                                              }}
                                              className="w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                              </svg>
                                              신고하기
                                            </button>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <p className="text-gray-700 dark:text-gray-300 text-sm mt-1 whitespace-pre-wrap">
                                  {comment.content}
                                </p>
                                <div className="flex items-center gap-4 mt-2">
                                  {/* 좋아요 버튼 */}
                                  <button
                                    onClick={() => session?.user && handleLikeComment(comment.id)}
                                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                                      comment.isLiked ? 'text-pink-500' : 'text-gray-500 hover:text-pink-500'
                                    }`}
                                    title="좋아요"
                                  >
                                    <svg className="w-4 h-4" fill={comment.isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                    </svg>
                                    <span>{comment.likeCount || 0}</span>
                                  </button>
                                  {/* 답글 버튼 (아이콘 + 카운트) */}
                                  <button
                                    onClick={() => {
                                      if (comment.replies.length > 0) {
                                        toggleReplies(comment.id);
                                      }
                                      if (session?.user) {
                                        setReplyingTo(replyingTo === comment.id ? null : comment.id);
                                        // 답글 작성 시 답글 목록도 펼치기
                                        if (!expandedReplies.has(comment.id) && comment.replies.length > 0) {
                                          setExpandedReplies((prev) => new Set(prev).add(comment.id));
                                        }
                                      }
                                    }}
                                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                                      expandedReplies.has(comment.id) || replyingTo === comment.id
                                        ? 'text-pink-500'
                                        : 'text-gray-500 hover:text-pink-500'
                                    }`}
                                    title="답글"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                    </svg>
                                    <span>{comment.replies.length}</span>
                                  </button>
                                </div>

                                {/* 답글 작성 폼 */}
                                {replyingTo === comment.id && (
                                  <div className="mt-3">
                                    <div className="flex gap-2">
                                      <div className="flex-1 relative">
                                        <input
                                          type="text"
                                          value={replyContent}
                                          onChange={(e) => setReplyContent(e.target.value)}
                                          placeholder="답글을 작성해주세요..."
                                          className="w-full px-3 py-2 pr-10 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500"
                                          maxLength={500}
                                        />
                                        {/* 답글 이모지 버튼 */}
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                          <button
                                            onClick={() => setShowEmojiPicker(showEmojiPicker === 'reply' ? null : 'reply')}
                                            className="p-1 text-gray-500 hover:text-pink-500 transition-colors"
                                          >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                          </button>
                                          {showEmojiPicker === 'reply' && (
                                            <>
                                              <div className="fixed inset-0 z-10" onClick={() => setShowEmojiPicker(null)} />
                                              <div className="absolute bottom-full right-0 mb-2 p-2 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 z-20 grid grid-cols-8 gap-1 w-64">
                                                {popularEmojis.map((emoji) => (
                                                  <button
                                                    key={emoji}
                                                    onClick={() => insertEmoji(emoji)}
                                                    className="p-1.5 text-lg hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                                  >
                                                    {emoji}
                                                  </button>
                                                ))}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => handleSubmitComment(comment.id)}
                                        disabled={!replyContent.trim() || commentSubmitting}
                                        className="px-3 py-2 bg-pink-500 text-white rounded-lg text-sm font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        등록
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* 대댓글 목록 (토글로 펼침/접힘) */}
                            {comment.replies.length > 0 && expandedReplies.has(comment.id) && (
                              <div className="ml-10 mt-2 pl-4 border-l-2 border-pink-200 dark:border-pink-800/50 space-y-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-r-lg py-3 pr-3">
                                {comment.replies.map((reply) => (
                                  <div key={reply.id} className="flex gap-2.5">
                                    <Link
                                      href={`/author/${reply.user.id}`}
                                      className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-pink-500 transition-all"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {reply.user.image ? (
                                        <img
                                          src={reply.user.image}
                                          alt={reply.user.name || ''}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-400 to-gray-500">
                                          <span className="text-xs font-bold text-white">
                                            {reply.user.name?.[0] || '?'}
                                          </span>
                                        </div>
                                      )}
                                    </Link>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-gray-900 dark:text-white text-xs">
                                            {reply.user.name || '익명'}
                                          </span>
                                          <span className="text-xs text-gray-400">
                                            {getTimeAgo(reply.createdAt)}
                                          </span>
                                        </div>
                                        {/* 더보기 메뉴 (점3개) - 오른쪽 끝 배치 */}
                                        <div className="relative">
                                          <button
                                            onClick={() => setCommentMenuOpen(commentMenuOpen === reply.id ? null : reply.id)}
                                            className="flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                            title="더보기"
                                          >
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                                            </svg>
                                          </button>
                                          {commentMenuOpen === reply.id && (
                                            <>
                                              <div className="fixed inset-0 z-10" onClick={() => setCommentMenuOpen(null)} />
                                              <div className="absolute right-0 mt-1 w-28 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 overflow-hidden">
                                                {(session?.user?.id === reply.user.id || session?.user?.id === selectedWork?.authorId) && (
                                                  <button
                                                    onClick={() => {
                                                      setCommentMenuOpen(null);
                                                      handleDeleteComment(reply.id);
                                                    }}
                                                    className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    삭제
                                                  </button>
                                                )}
                                                {session?.user && session.user.id !== reply.user.id && (
                                                  <button
                                                    onClick={() => {
                                                      setCommentMenuOpen(null);
                                                      setReportingCommentId(reply.id);
                                                      setReportModalOpen(true);
                                                    }}
                                                    className="w-full px-3 py-2 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                                                  >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                    신고
                                                  </button>
                                                )}
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <p className="text-gray-700 dark:text-gray-300 text-sm mt-0.5 whitespace-pre-wrap">
                                        {reply.content}
                                      </p>
                                      <div className="flex items-center gap-3 mt-1.5">
                                        {/* 답글 좋아요 버튼 */}
                                        <button
                                          onClick={() => session?.user && handleLikeComment(reply.id)}
                                          className={`flex items-center gap-1 text-xs transition-colors ${
                                            reply.isLiked ? 'text-pink-500' : 'text-gray-400 hover:text-pink-500'
                                          }`}
                                          title="좋아요"
                                        >
                                          <svg className="w-3.5 h-3.5" fill={reply.isLiked ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                          </svg>
                                          <span>{reply.likeCount || 0}</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 댓글 신고 모달 */}
        {reportModalOpen && (
          <div
            className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
            onClick={() => {
              setReportModalOpen(false);
              setReportingCommentId(null);
              setReportReason('');
              setReportDescription('');
            }}
          >
            <div
              className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 헤더 */}
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">댓글 신고하기</h3>
                <button
                  onClick={() => {
                    setReportModalOpen(false);
                    setReportingCommentId(null);
                    setReportReason('');
                    setReportDescription('');
                  }}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 본문 */}
              <div className="p-5">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  댓글의 신고 사유를 선택해주세요
                </p>

                {/* 신고 사유 라디오 */}
                <div className="space-y-3">
                  {reportReasons.map((reason) => (
                    <label
                      key={reason.value}
                      className="flex items-center gap-3 cursor-pointer group"
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        reportReason === reason.value
                          ? 'border-pink-500 bg-pink-500'
                          : 'border-gray-300 dark:border-gray-600 group-hover:border-pink-400'
                      }`}>
                        {reportReason === reason.value && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <input
                        type="radio"
                        name="reportReason"
                        value={reason.value}
                        checked={reportReason === reason.value}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="sr-only"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{reason.label}</span>
                    </label>
                  ))}
                </div>

                {/* 기타 사유 입력 */}
                {reportReason === 'other' && (
                  <div className="mt-4">
                    <textarea
                      value={reportDescription}
                      onChange={(e) => setReportDescription(e.target.value)}
                      placeholder="신고 사유를 입력해주세요"
                      className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-pink-500 resize-none"
                      rows={4}
                      maxLength={500}
                    />
                  </div>
                )}
              </div>

              {/* 제출 버튼 */}
              <div className="p-5 pt-0">
                <button
                  onClick={handleReportComment}
                  disabled={!reportReason || (reportReason === 'other' && !reportDescription.trim()) || reportSubmitting}
                  className="w-full py-3 bg-pink-500 text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {reportSubmitting ? '제출 중...' : '제출'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Modal */}
        {searchOpen && (
          <SearchModal
            searchQuery={searchQuery}
            searchResults={searchResults}
            searchInputRef={searchInputRef}
            onClose={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }}
            onQueryChange={setSearchQuery}
            onSelectWork={(work) => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); setSelectedWork(work); }}
          />
        )}

        {/* Notification Modal */}
        {notificationOpen && (
          <NotificationsModal
            notifications={notifications}
            onClose={() => setNotificationOpen(false)}
            onNavigate={(path) => router.push(path)}
            getTimeAgo={getTimeAgo}
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
            onSave={handleSaveProfile}
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
