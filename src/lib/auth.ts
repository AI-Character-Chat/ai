/**
 * NextAuth.js 인증 설정
 * Google + Kakao 소셜 로그인 지원
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Kakao from 'next-auth/providers/kakao';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { PrismaClient } from '@prisma/client';

// Prisma Client with Session model mapping
const prisma = new PrismaClient().$extends({
  model: {
    // AuthSession 테이블을 Session으로 매핑
  },
});

// 기본 Prisma 클라이언트 (원본)
const basePrisma = new PrismaClient();

// SYNK 시그니처 기본 프로필 이미지
export const DEFAULT_PROFILE_IMAGE = '/default-profile.svg';

// 커스텀 어댑터 - AuthSession 테이블 사용
const customAdapter = {
  ...PrismaAdapter(basePrisma as never),

  // 첫 가입 시 기본 프로필 이미지 강제 설정
  async createUser(data: { name?: string | null; email?: string | null; emailVerified?: Date | null; image?: string | null }) {
    return basePrisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        emailVerified: data.emailVerified,
        image: DEFAULT_PROFILE_IMAGE, // OAuth 이미지 무시, 항상 기본 프로필
      },
    });
  },

  // Session 관련 메서드 오버라이드 (AuthSession 테이블 사용)
  async createSession(data: { sessionToken: string; userId: string; expires: Date }) {
    const session = await basePrisma.authSession.create({
      data: {
        sessionToken: data.sessionToken,
        userId: data.userId,
        expires: data.expires,
      },
    });
    return session;
  },

  async getSessionAndUser(sessionToken: string) {
    const result = await basePrisma.authSession.findUnique({
      where: { sessionToken },
      include: { user: true },
    });

    if (!result) return null;

    return {
      session: {
        sessionToken: result.sessionToken,
        userId: result.userId,
        expires: result.expires,
      },
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email ?? '',
        emailVerified: result.user.emailVerified,
        image: result.user.image,
      },
    };
  },

  async updateSession(data: { sessionToken: string; expires?: Date }) {
    const session = await basePrisma.authSession.update({
      where: { sessionToken: data.sessionToken },
      data: data.expires ? { expires: data.expires } : {},
    });
    return session;
  },

  async deleteSession(sessionToken: string) {
    await basePrisma.authSession.delete({
      where: { sessionToken },
    });
  },
};

// Provider 목록 구성
const providers: any[] = [
  Kakao({
    clientId: process.env.AUTH_KAKAO_ID!,
    clientSecret: process.env.AUTH_KAKAO_SECRET!,
  }),
];

// Google OAuth 키가 설정된 경우에만 추가
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_ID !== 'your-google-client-id') {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: customAdapter as never,
  providers,
  callbacks: {
    async signIn({ user }) {
      // 로그인 시 이미지가 없으면 기본 프로필로 설정
      if (user.id) {
        const dbUser = await basePrisma.user.findUnique({ where: { id: user.id }, select: { image: true } });
        if (!dbUser?.image) {
          await basePrisma.user.update({
            where: { id: user.id },
            data: { image: DEFAULT_PROFILE_IMAGE },
          });
        }
      }
      return true;
    },
    async session({ session, user }) {
      // 세션에 유저 ID + role 추가
      if (session.user) {
        session.user.id = user.id;
        const dbUser = await basePrisma.user.findUnique({ where: { id: user.id }, select: { role: true, image: true } });
        (session.user as any).role = dbUser?.role || 'user';
        // 항상 DB의 이미지 사용 (OAuth 이미지 대신 기본 프로필)
        session.user.image = dbUser?.image || DEFAULT_PROFILE_IMAGE;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  // Vercel 등 리버스 프록시 환경에서 호스트 신뢰
  trustHost: true,
  // 디버그 모드 (개발 환경에서만)
  debug: process.env.NODE_ENV === 'development',
});

// 타입 확장 (TypeScript)
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }
}
