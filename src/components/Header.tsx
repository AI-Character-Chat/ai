'use client';

/**
 * 헤더 컴포넌트
 * 로그인/로그아웃 버튼 및 유저 정보 표시
 */

import { useSession, signIn, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* 로고 */}
          <Link
            href="/"
            className="text-xl font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            SYNK Character Chat
          </Link>

          {/* 네비게이션 */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link
              href="/"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              작품 둘러보기
            </Link>
            <Link
              href="/studio"
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              스튜디오
            </Link>
            {session && (
              <Link
                href="/my-sessions"
                className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                내 채팅
              </Link>
            )}
          </nav>

          {/* 로그인/유저 정보 */}
          <div className="flex items-center">
            {status === 'loading' ? (
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            ) : session ? (
              <div className="flex items-center gap-3">
                {/* 유저 프로필 이미지 */}
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt={session.user.name || '프로필'}
                    width={32}
                    height={32}
                    className="rounded-full"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium">
                    {session.user?.name?.charAt(0) || 'U'}
                  </div>
                )}

                {/* 유저 이름 (데스크톱) */}
                <span className="hidden sm:block text-sm text-gray-700 dark:text-gray-300">
                  {session.user?.name}
                </span>

                {/* 로그아웃 버튼 */}
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button
                onClick={() => signIn()}
                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                로그인
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
