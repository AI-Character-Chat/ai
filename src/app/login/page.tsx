'use client';

/**
 * 로그인 페이지
 * Google / Kakao 소셜 로그인 지원
 */

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// Google 아이콘
function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// Kakao 아이콘
function KakaoIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path
        fill="#000000"
        d="M12 3C6.477 3 2 6.463 2 10.691c0 2.65 1.734 4.974 4.38 6.308-.144.522-.925 3.358-.961 3.584 0 0-.02.166.087.228.107.063.233.013.233.013.307-.042 3.548-2.313 4.107-2.707.7.1 1.424.152 2.154.152 5.523 0 10-3.463 10-7.578C22 6.463 17.523 3 12 3z"
      />
    </svg>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 w-full max-w-md">
        {/* 로고 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            SYNK Character Chat
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI 캐릭터와 대화를 시작하세요
          </p>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-600 dark:text-red-400 text-sm text-center">
              {error === 'OAuthAccountNotLinked'
                ? '이미 다른 방법으로 가입된 계정입니다.'
                : '로그인 중 오류가 발생했습니다. 다시 시도해주세요.'}
            </p>
          </div>
        )}

        {/* 소셜 로그인 버튼들 */}
        <div className="space-y-4">
          {/* Kakao 로그인 */}
          <button
            onClick={() => signIn('kakao', { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-[#FEE500] hover:bg-[#F5DC00] transition-colors"
          >
            <KakaoIcon />
            <span className="text-[#191919] font-medium">
              카카오로 계속하기
            </span>
          </button>

          {/* Google 로그인 */}
          <button
            onClick={() => signIn('google', { callbackUrl })}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
          >
            <GoogleIcon />
            <span className="text-gray-700 dark:text-gray-200 font-medium">
              Google로 계속하기
            </span>
          </button>
        </div>

        {/* 구분선 */}
        <div className="my-6 flex items-center">
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
          <span className="px-4 text-sm text-gray-500 dark:text-gray-400">
            또는
          </span>
          <div className="flex-1 border-t border-gray-200 dark:border-gray-700" />
        </div>

        {/* 비로그인 사용 */}
        <a
          href="/"
          className="block w-full text-center py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 transition-colors"
        >
          로그인 없이 둘러보기
        </a>

        {/* 안내 문구 */}
        <p className="mt-6 text-xs text-gray-500 dark:text-gray-500 text-center">
          로그인하면 채팅 기록이 저장되어
          <br />
          언제든지 이어서 대화할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
