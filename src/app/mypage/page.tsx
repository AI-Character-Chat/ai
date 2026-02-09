'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 마이페이지는 이제 메인페이지의 탭으로 통합되었습니다.
export default function MyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?view=myworks');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="text-gray-500">리다이렉트 중...</div>
    </div>
  );
}
