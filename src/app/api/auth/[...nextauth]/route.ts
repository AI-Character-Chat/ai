/**
 * NextAuth.js API Route Handler
 * GET: OAuth 콜백 처리
 * POST: 로그인/로그아웃 처리
 */

import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
