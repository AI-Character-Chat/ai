'use client';

/**
 * NextAuth.js SessionProvider 래퍼 컴포넌트
 * 클라이언트 컴포넌트에서 useSession 훅 사용을 위해 필요
 */

import { SessionProvider } from 'next-auth/react';

export default function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
