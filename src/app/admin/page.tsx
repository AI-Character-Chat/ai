'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import MemoryAnalysisTab from './components/MemoryAnalysisTab';

interface Banner {
  id: string;
  title: string;
  imageUrl: string;
  linkUrl: string | null;
  order: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: string;
  isPinned: boolean;
  isActive: boolean;
  viewCount: number;
  createdAt: string;
}

interface Stats {
  overview: {
    totalUsers: number;
    totalWorks: number;
    totalChatSessions: number;
    totalMessages: number;
    publicWorks: number;
    pendingReports: number;
  };
  growth: {
    newUsersToday: number;
    newUsersWeek: number;
    newWorksToday: number;
    newWorksWeek: number;
    newChatsToday: number;
    newChatsWeek: number;
  };
  topWorks: {
    id: string;
    title: string;
    thumbnail: string | null;
    _count: { likes: number; chatSessions: number };
  }[];
}

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  createdAt: string;
  _count: { works: number; chatSessions: number };
}

interface Report {
  id: string;
  reporterId: string | null;
  targetType: string;
  targetId: string;
  reason: string;
  description: string | null;
  status: string;
  adminNote: string | null;
  createdAt: string;
}

interface SiteSetting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

type Tab = 'dashboard' | 'banners' | 'announcements' | 'users' | 'reports' | 'settings' | 'memory';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  // Dashboard
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  // Banners
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannersLoading, setBannersLoading] = useState(true);
  const [bannerModalOpen, setBannerModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [bannerForm, setBannerForm] = useState({
    title: '',
    imageUrl: '',
    linkUrl: '',
    order: 0,
    isActive: true,
    startDate: '',
    endDate: ''
  });
  const bannerImageInputRef = useRef<HTMLInputElement>(null);
  const [bannerImageUploading, setBannerImageUploading] = useState(false);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(true);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    type: 'normal',
    isPinned: false,
    isActive: true
  });

  // Users
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [usersTotalPages, setUsersTotalPages] = useState(1);

  // Reports
  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);
  const [reportsFilter, setReportsFilter] = useState('');
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reportAdminNote, setReportAdminNote] = useState('');

  // Settings
  const [siteSettings, setSiteSettings] = useState<SiteSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingForm, setSettingForm] = useState({ key: '', value: '', description: '' });
  const [settingEditing, setSettingEditing] = useState(false);

  // 관리자 권한 체크
  useEffect(() => {
    const checkAdminRole = async () => {
      if (status === 'loading') return;
      if (!session?.user?.email) {
        router.push('/login');
        return;
      }

      try {
        const response = await fetch('/api/user/profile');
        const data = await response.json();
        if (data.role !== 'admin') {
          setIsAdmin(false);
          return;
        }
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
      }
    };

    checkAdminRole();
  }, [session, status, router]);

  // 데이터 로드
  useEffect(() => {
    if (isAdmin) {
      if (activeTab === 'dashboard') fetchStats();
      if (activeTab === 'banners') fetchBanners();
      if (activeTab === 'announcements') fetchAnnouncements();
      if (activeTab === 'users') fetchUsers();
      if (activeTab === 'reports') fetchReports();
      if (activeTab === 'settings') fetchSettings();
    }
  }, [isAdmin, activeTab]);

  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch('/api/admin/stats');
      if (!response.ok) return;
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchBanners = async () => {
    setBannersLoading(true);
    try {
      const response = await fetch('/api/admin/banners?admin=true');
      const data = await response.json();
      setBanners(data);
    } catch (error) {
      console.error('Failed to fetch banners:', error);
    } finally {
      setBannersLoading(false);
    }
  };

  const fetchAnnouncements = async () => {
    setAnnouncementsLoading(true);
    try {
      const response = await fetch('/api/admin/announcements?admin=true');
      const data = await response.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setAnnouncementsLoading(false);
    }
  };

  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const response = await fetch(`/api/admin/users?page=${usersPage}&search=${userSearch}`);
      const data = await response.json();
      setUsers(data.users);
      setUsersTotalPages(data.totalPages);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchReports = async () => {
    setReportsLoading(true);
    try {
      const statusParam = reportsFilter ? `&status=${reportsFilter}` : '';
      const response = await fetch(`/api/admin/reports?page=${reportsPage}${statusParam}`);
      const data = await response.json();
      setReports(data.reports);
      setReportsTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch reports:', error);
    } finally {
      setReportsLoading(false);
    }
  };

  const handleUpdateReport = async (id: string, newStatus: string) => {
    try {
      const response = await fetch('/api/admin/reports', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, adminNote: reportAdminNote || undefined }),
      });
      if (response.ok) {
        fetchReports();
        setEditingReport(null);
        setReportAdminNote('');
      }
    } catch (error) {
      console.error('Failed to update report:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      rejected: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    const labels: Record<string, string> = {
      pending: '대기중', reviewing: '검토중', resolved: '처리완료', rejected: '반려',
    };
    return <span className={`px-2 py-1 text-xs rounded-full ${styles[status] || styles.pending}`}>{labels[status] || status}</span>;
  };

  const fetchSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      setSiteSettings(data.settings || []);
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleSaveSetting = async () => {
    if (!settingForm.key.trim() || !settingForm.value.trim()) {
      alert('키와 값을 입력해주세요.');
      return;
    }
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingForm),
      });
      if (response.ok) {
        fetchSettings();
        setSettingForm({ key: '', value: '', description: '' });
        setSettingEditing(false);
      }
    } catch (error) {
      console.error('Failed to save setting:', error);
    }
  };

  const handleDeleteSetting = async (key: string) => {
    if (!confirm(`"${key}" 설정을 삭제하시겠습니까?`)) return;
    try {
      const response = await fetch(`/api/admin/settings?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
      if (response.ok) fetchSettings();
    } catch (error) {
      console.error('Failed to delete setting:', error);
    }
  };

  // 배너 이미지 업로드
  const handleBannerImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('이미지 크기는 5MB 이하여야 합니다.');
      return;
    }

    setBannerImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      setBannerForm({ ...bannerForm, imageUrl: data.url });
    } catch (error) {
      console.error('Failed to upload image:', error);
      alert('이미지 업로드에 실패했습니다.');
    } finally {
      setBannerImageUploading(false);
    }
  };

  // 배너 저장
  const handleSaveBanner = async () => {
    if (!bannerForm.title || !bannerForm.imageUrl) {
      alert('제목과 이미지는 필수입니다.');
      return;
    }

    try {
      const method = editingBanner ? 'PUT' : 'POST';
      const body = editingBanner
        ? { id: editingBanner.id, ...bannerForm }
        : bannerForm;

      const response = await fetch('/api/admin/banners', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Save failed');

      setBannerModalOpen(false);
      setEditingBanner(null);
      setBannerForm({
        title: '',
        imageUrl: '',
        linkUrl: '',
        order: 0,
        isActive: true,
        startDate: '',
        endDate: ''
      });
      fetchBanners();
    } catch (error) {
      console.error('Failed to save banner:', error);
      alert('배너 저장에 실패했습니다.');
    }
  };

  // 배너 삭제
  const handleDeleteBanner = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/banners?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Delete failed');

      fetchBanners();
    } catch (error) {
      console.error('Failed to delete banner:', error);
      alert('배너 삭제에 실패했습니다.');
    }
  };

  // 공지사항 저장
  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title || !announcementForm.content) {
      alert('제목과 내용은 필수입니다.');
      return;
    }

    try {
      const method = editingAnnouncement ? 'PUT' : 'POST';
      const body = editingAnnouncement
        ? { id: editingAnnouncement.id, ...announcementForm }
        : announcementForm;

      const response = await fetch('/api/admin/announcements', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Save failed');

      setAnnouncementModalOpen(false);
      setEditingAnnouncement(null);
      setAnnouncementForm({
        title: '',
        content: '',
        type: 'normal',
        isPinned: false,
        isActive: true
      });
      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to save announcement:', error);
      alert('공지사항 저장에 실패했습니다.');
    }
  };

  // 공지사항 삭제
  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const response = await fetch(`/api/admin/announcements?id=${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Delete failed');

      fetchAnnouncements();
    } catch (error) {
      console.error('Failed to delete announcement:', error);
      alert('공지사항 삭제에 실패했습니다.');
    }
  };

  // 사용자 역할 변경
  const handleChangeUserRole = async (userId: string, newRole: string) => {
    if (!confirm(`정말 이 사용자의 역할을 ${newRole === 'admin' ? '관리자' : '일반 사용자'}로 변경하시겠습니까?`)) return;

    try {
      const response = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: userId, role: newRole })
      });

      if (!response.ok) throw new Error('Update failed');

      fetchUsers();
    } catch (error) {
      console.error('Failed to update user role:', error);
      alert('역할 변경에 실패했습니다.');
    }
  };

  // 권한 체크 로딩
  if (status === 'loading' || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-lg text-gray-600 dark:text-gray-400">로딩 중...</div>
      </div>
    );
  }

  // 권한 없음
  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 text-center max-w-md">
          <svg className="w-16 h-16 mx-auto text-red-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">접근 권한이 없습니다</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">관리자만 접근 가능한 페이지입니다.</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-xl font-bold text-primary-600">
                SYNK
              </Link>
              <span className="text-gray-400">|</span>
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white">운영자 페이지</h1>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">{session?.user?.email}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {[
            { id: 'dashboard', label: '대시보드', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
            { id: 'banners', label: '배너 관리', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'announcements', label: '공지사항', icon: 'M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z' },
            { id: 'users', label: '사용자 관리', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
            { id: 'reports', label: '신고 관리', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z' },
            { id: 'settings', label: '사이트 설정', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z' },
            { id: 'memory', label: '메모리 분석', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {statsLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : stats && (
              <>
                {/* Overview Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">총 사용자</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overview.totalUsers.toLocaleString()}</p>
                    <p className="text-xs text-green-500">+{stats.growth.newUsersToday} 오늘</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">총 작품</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overview.totalWorks.toLocaleString()}</p>
                    <p className="text-xs text-green-500">+{stats.growth.newWorksToday} 오늘</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">공개 작품</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overview.publicWorks.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">총 채팅</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overview.totalChatSessions.toLocaleString()}</p>
                    <p className="text-xs text-green-500">+{stats.growth.newChatsToday} 오늘</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">총 메시지</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.overview.totalMessages.toLocaleString()}</p>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <p className="text-sm text-gray-500 dark:text-gray-400">대기 중 신고</p>
                    <p className="text-2xl font-bold text-red-500">{stats.overview.pendingReports}</p>
                  </div>
                </div>

                {/* Top Works */}
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">인기 작품 TOP 5</h3>
                  <div className="space-y-3">
                    {stats.topWorks.map((work, index) => (
                      <div key={work.id} className="flex items-center gap-4">
                        <span className="w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 flex items-center justify-center text-sm font-bold">
                          {index + 1}
                        </span>
                        <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 overflow-hidden">
                          {work.thumbnail ? (
                            <img src={work.thumbnail} alt={work.title} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{work.title}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4 text-red-400" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            {work._count.likes}
                          </span>
                          <span className="flex items-center gap-1">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                            {work._count.chatSessions}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Banners Tab */}
        {activeTab === 'banners' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">배너 목록</h2>
              <button
                onClick={() => {
                  setEditingBanner(null);
                  setBannerForm({
                    title: '',
                    imageUrl: '',
                    linkUrl: '',
                    order: banners.length,
                    isActive: true,
                    startDate: '',
                    endDate: ''
                  });
                  setBannerModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                배너 추가
              </button>
            </div>

            {bannersLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : banners.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 dark:text-gray-400">등록된 배너가 없습니다.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {banners.map((banner) => (
                  <div
                    key={banner.id}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
                  >
                    <div className="w-40 h-20 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                      <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white">{banner.title}</h3>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          banner.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {banner.isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      {banner.linkUrl && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                          링크: {banner.linkUrl}
                        </p>
                      )}
                      <p className="text-xs text-gray-400">
                        순서: {banner.order}
                        {banner.startDate && ` | 시작: ${new Date(banner.startDate).toLocaleDateString('ko-KR')}`}
                        {banner.endDate && ` | 종료: ${new Date(banner.endDate).toLocaleDateString('ko-KR')}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingBanner(banner);
                          setBannerForm({
                            title: banner.title,
                            imageUrl: banner.imageUrl,
                            linkUrl: banner.linkUrl || '',
                            order: banner.order,
                            isActive: banner.isActive,
                            startDate: banner.startDate ? banner.startDate.split('T')[0] : '',
                            endDate: banner.endDate ? banner.endDate.split('T')[0] : ''
                          });
                          setBannerModalOpen(true);
                        }}
                        className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteBanner(banner.id)}
                        className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Announcements Tab */}
        {activeTab === 'announcements' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">공지사항 목록</h2>
              <button
                onClick={() => {
                  setEditingAnnouncement(null);
                  setAnnouncementForm({
                    title: '',
                    content: '',
                    type: 'normal',
                    isPinned: false,
                    isActive: true
                  });
                  setAnnouncementModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                공지 추가
              </button>
            </div>

            {announcementsLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : announcements.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 dark:text-gray-400">등록된 공지사항이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className="flex items-center gap-4 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {announcement.isPinned && (
                          <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 rounded-full">
                            고정
                          </span>
                        )}
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          announcement.type === 'important'
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : announcement.type === 'maintenance'
                            ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        }`}>
                          {announcement.type === 'important' ? '중요' : announcement.type === 'maintenance' ? '점검' : '일반'}
                        </span>
                        <span className={`px-2 py-0.5 text-xs rounded-full ${
                          announcement.isActive
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                        }`}>
                          {announcement.isActive ? '활성' : '비활성'}
                        </span>
                      </div>
                      <h3 className="font-medium text-gray-900 dark:text-white">{announcement.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{announcement.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(announcement.createdAt).toLocaleDateString('ko-KR')} | 조회 {announcement.viewCount}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingAnnouncement(announcement);
                          setAnnouncementForm({
                            title: announcement.title,
                            content: announcement.content,
                            type: announcement.type,
                            isPinned: announcement.isPinned,
                            isActive: announcement.isActive
                          });
                          setAnnouncementModalOpen(true);
                        }}
                        className="p-2 text-gray-500 hover:text-primary-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDeleteAnnouncement(announcement.id)}
                        className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">사용자 목록</h2>
              <div className="flex gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="이름 또는 이메일 검색..."
                  className="flex-1 sm:w-64 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500"
                />
                <button
                  onClick={fetchUsers}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  검색
                </button>
              </div>
            </div>

            {usersLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl">
                <p className="text-gray-500 dark:text-gray-400">사용자를 찾을 수 없습니다.</p>
              </div>
            ) : (
              <>
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">사용자</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">역할</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden lg:table-cell">작품/채팅</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden sm:table-cell">가입일</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">관리</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                                {user.image ? (
                                  <img src={user.image} alt={user.name || ''} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                                    {user.name?.[0] || '?'}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">{user.name || '이름 없음'}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'admin'
                                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                            }`}>
                              {user.role === 'admin' ? '관리자' : '사용자'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                            {user._count.works} / {user._count.chatSessions}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden sm:table-cell">
                            {new Date(user.createdAt).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => handleChangeUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                                user.role === 'admin'
                                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300'
                                  : 'bg-purple-100 text-purple-600 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-400'
                              }`}
                            >
                              {user.role === 'admin' ? '권한 해제' : '관리자 부여'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {usersTotalPages > 1 && (
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => setUsersPage(Math.max(1, usersPage - 1))}
                      disabled={usersPage === 1}
                      className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50"
                    >
                      이전
                    </button>
                    <span className="px-3 py-1 text-gray-600 dark:text-gray-400">
                      {usersPage} / {usersTotalPages}
                    </span>
                    <button
                      onClick={() => setUsersPage(Math.min(usersTotalPages, usersPage + 1))}
                      disabled={usersPage === usersTotalPages}
                      className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50"
                    >
                      다음
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            {/* 필터 */}
            <div className="flex gap-2 flex-wrap">
              {[
                { value: '', label: '전체' },
                { value: 'pending', label: '대기중' },
                { value: 'reviewing', label: '검토중' },
                { value: 'resolved', label: '처리완료' },
                { value: 'rejected', label: '반려' },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setReportsFilter(f.value); setReportsPage(1); }}
                  className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                    reportsFilter === f.value
                      ? 'bg-primary-600 text-white'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {reportsLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-12 text-gray-500">신고가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.id} className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {getStatusBadge(report.status)}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {report.targetType} | {new Date(report.createdAt).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900 dark:text-white">{report.reason}</p>
                        {report.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{report.description}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-1">대상 ID: {report.targetId}</p>
                        {report.adminNote && (
                          <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">관리자 메모: {report.adminNote}</p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {report.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateReport(report.id, 'reviewing')}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                            >
                              검토
                            </button>
                            <button
                              onClick={() => handleUpdateReport(report.id, 'rejected')}
                              className="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                              반려
                            </button>
                          </>
                        )}
                        {report.status === 'reviewing' && (
                          <button
                            onClick={() => handleUpdateReport(report.id, 'resolved')}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                          >
                            처리완료
                          </button>
                        )}
                        <button
                          onClick={() => { setEditingReport(report); setReportAdminNote(report.adminNote || ''); }}
                          className="px-2 py-1 text-xs bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        >
                          메모
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Pagination */}
                {reportsTotalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    <button
                      onClick={() => setReportsPage(Math.max(1, reportsPage - 1))}
                      disabled={reportsPage === 1}
                      className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50"
                    >
                      이전
                    </button>
                    <span className="px-3 py-1 text-gray-600 dark:text-gray-400">{reportsPage} / {reportsTotalPages}</span>
                    <button
                      onClick={() => setReportsPage(Math.min(reportsTotalPages, reportsPage + 1))}
                      disabled={reportsPage === reportsTotalPages}
                      className="px-3 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-50"
                    >
                      다음
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 관리자 메모 모달 */}
            {editingReport && (
              <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setEditingReport(null)}>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">관리자 메모</h3>
                  <textarea
                    value={reportAdminNote}
                    onChange={(e) => setReportAdminNote(e.target.value)}
                    placeholder="처리 내용을 기록하세요..."
                    rows={4}
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 resize-none"
                  />
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => setEditingReport(null)} className="flex-1 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg">취소</button>
                    <button
                      onClick={() => handleUpdateReport(editingReport.id, editingReport.status)}
                      className="flex-1 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                      저장
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* 설정 추가/수정 폼 */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
              <h3 className="font-medium text-gray-900 dark:text-white mb-3">
                {settingEditing ? '설정 수정' : '새 설정 추가'}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={settingForm.key}
                  onChange={(e) => setSettingForm({ ...settingForm, key: e.target.value })}
                  placeholder="키 (예: maintenance_mode)"
                  disabled={settingEditing}
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 disabled:opacity-50"
                />
                <input
                  type="text"
                  value={settingForm.value}
                  onChange={(e) => setSettingForm({ ...settingForm, value: e.target.value })}
                  placeholder="값"
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
                <input
                  type="text"
                  value={settingForm.description}
                  onChange={(e) => setSettingForm({ ...settingForm, description: e.target.value })}
                  placeholder="설명 (선택)"
                  className="px-3 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:border-primary-500"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSaveSetting}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm"
                >
                  {settingEditing ? '수정' : '추가'}
                </button>
                {settingEditing && (
                  <button
                    onClick={() => { setSettingForm({ key: '', value: '', description: '' }); setSettingEditing(false); }}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>

            {/* 설정 목록 */}
            {settingsLoading ? (
              <div className="text-center py-12 text-gray-500">로딩 중...</div>
            ) : siteSettings.length === 0 ? (
              <div className="text-center py-12 text-gray-500">설정이 없습니다. 위에서 추가해주세요.</div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">키</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">값</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">설명</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {siteSettings.map((setting) => (
                      <tr key={setting.id}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900 dark:text-white">{setting.key}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{setting.value}</td>
                        <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell">{setting.description || '-'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => {
                                setSettingForm({ key: setting.key, value: setting.value, description: setting.description || '' });
                                setSettingEditing(true);
                              }}
                              className="px-2 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded hover:bg-blue-200"
                            >
                              수정
                            </button>
                            <button
                              onClick={() => handleDeleteSetting(setting.key)}
                              className="px-2 py-1 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded hover:bg-red-200"
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {/* Memory Analysis Tab */}
        {activeTab === 'memory' && (
          <MemoryAnalysisTab />
        )}
      </div>

      {/* Banner Modal */}
      {bannerModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setBannerModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                {editingBanner ? '배너 수정' : '배너 추가'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    제목 (관리용) *
                  </label>
                  <input
                    type="text"
                    value={bannerForm.title}
                    onChange={(e) => setBannerForm({ ...bannerForm, title: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="배너 제목"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    배너 이미지 * (권장: 1048×180px)
                  </label>
                  <input
                    type="file"
                    ref={bannerImageInputRef}
                    onChange={handleBannerImageUpload}
                    accept="image/*"
                    className="hidden"
                  />
                  {bannerForm.imageUrl ? (
                    <div className="relative">
                      <img
                        src={bannerForm.imageUrl}
                        alt="Banner preview"
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <button
                        onClick={() => bannerImageInputRef.current?.click()}
                        className="absolute bottom-2 right-2 px-3 py-1 bg-black/50 text-white text-sm rounded-lg hover:bg-black/70"
                      >
                        변경
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => bannerImageInputRef.current?.click()}
                      disabled={bannerImageUploading}
                      className="w-full h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg flex items-center justify-center text-gray-500 hover:border-primary-500 hover:text-primary-500 transition-colors"
                    >
                      {bannerImageUploading ? '업로드 중...' : '이미지 업로드'}
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    클릭 시 이동 URL
                  </label>
                  <input
                    type="url"
                    value={bannerForm.linkUrl}
                    onChange={(e) => setBannerForm({ ...bannerForm, linkUrl: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="https://..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      노출 순서
                    </label>
                    <input
                      type="number"
                      value={bannerForm.order}
                      onChange={(e) => setBannerForm({ ...bannerForm, order: parseInt(e.target.value) || 0 })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bannerForm.isActive}
                        onChange={(e) => setBannerForm({ ...bannerForm, isActive: e.target.checked })}
                        className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">활성화</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      시작일
                    </label>
                    <input
                      type="date"
                      value={bannerForm.startDate}
                      onChange={(e) => setBannerForm({ ...bannerForm, startDate: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      종료일
                    </label>
                    <input
                      type="date"
                      value={bannerForm.endDate}
                      onChange={(e) => setBannerForm({ ...bannerForm, endDate: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setBannerModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveBanner}
                  className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Announcement Modal */}
      {announcementModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setAnnouncementModalOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                {editingAnnouncement ? '공지사항 수정' : '공지사항 추가'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    제목 *
                  </label>
                  <input
                    type="text"
                    value={announcementForm.title}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                    placeholder="공지사항 제목"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    내용 *
                  </label>
                  <textarea
                    value={announcementForm.content}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, content: e.target.value })}
                    rows={6}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white resize-none"
                    placeholder="공지사항 내용"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    유형
                  </label>
                  <select
                    value={announcementForm.type}
                    onChange={(e) => setAnnouncementForm({ ...announcementForm, type: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="normal">일반</option>
                    <option value="important">중요</option>
                    <option value="maintenance">점검</option>
                  </select>
                </div>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={announcementForm.isPinned}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, isPinned: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">상단 고정</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={announcementForm.isActive}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, isActive: e.target.checked })}
                      className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">활성화</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setAnnouncementModalOpen(false)}
                  className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveAnnouncement}
                  className="flex-1 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  저장
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
