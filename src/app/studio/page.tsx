'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Work {
  id: string;
  title: string;
  description: string;
  visibility: string;
  _count: {
    characters: number;
    openings: number;
  };
  updatedAt: string;
}

export default function StudioPage() {
  const router = useRouter();
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchWorks();
  }, []);

  const fetchWorks = async () => {
    try {
      const response = await fetch('/api/works');
      const data = await response.json();
      setWorks(data);
    } catch (error) {
      console.error('Failed to fetch works:', error);
    } finally {
      setLoading(false);
    }
  };

  const createNewWork = async () => {
    setCreating(true);
    try {
      const response = await fetch('/api/works', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '새 작품',
          description: '작품 설명을 입력해주세요.',
        }),
      });
      const work = await response.json();
      router.push(`/studio/${work.id}`);
    } catch (error) {
      console.error('Failed to create work:', error);
      alert('작품 생성에 실패했습니다.');
    } finally {
      setCreating(false);
    }
  };

  const deleteWork = async (workId: string) => {
    if (!confirm('정말 이 작품을 삭제하시겠습니까?')) return;

    try {
      await fetch(`/api/works/${workId}`, { method: 'DELETE' });
      setWorks(works.filter((w) => w.id !== workId));
    } catch (error) {
      console.error('Failed to delete work:', error);
      alert('작품 삭제에 실패했습니다.');
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

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                창작자 스튜디오
              </h1>
            </div>
            <button
              onClick={createNewWork}
              disabled={creating}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {creating ? '생성 중...' : '+ 새 작품'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {works.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">✨</div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              첫 작품을 만들어보세요!
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6">
              AI 캐릭터와 대화할 수 있는 작품을 만들 수 있습니다.
            </p>
            <button
              onClick={createNewWork}
              disabled={creating}
              className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {creating ? '생성 중...' : '작품 만들기'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {works.map((work) => (
              <div
                key={work.id}
                onClick={() => router.push(`/studio/${work.id}`)}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {work.title}
                    </h3>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        work.visibility === 'public'
                          ? 'bg-green-100 text-green-700'
                          : work.visibility === 'unlisted'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {work.visibility === 'public'
                        ? '공개'
                        : work.visibility === 'unlisted'
                        ? '링크 공유'
                        : '비공개'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    {work.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span>캐릭터 {work._count.characters}명</span>
                    <span>오프닝 {work._count.openings}개</span>
                    <span>
                      수정: {new Date(work.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteWork(work.id); }}
                    className="px-4 py-2 text-red-600 border border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
