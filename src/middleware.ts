import { NextRequest, NextResponse } from 'next/server';

// In-memory rate limit store (Edge Runtime 호환)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// 오래된 엔트리 정리
function cleanupStore() {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((value, key) => {
    if (now > value.resetTime) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach((key) => rateLimitStore.delete(key));
}

// Rate Limit 체크
function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): { success: boolean; remaining: number } {
  if (rateLimitStore.size > 10000) {
    cleanupStore();
  }

  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + windowMs });
    return { success: true, remaining: limit - 1 };
  }

  if (record.count >= limit) {
    return { success: false, remaining: 0 };
  }

  record.count++;
  return { success: true, remaining: limit - record.count };
}

// 엔드포인트별 Rate Limit 설정
function getRateLimitConfig(
  pathname: string,
  method: string
): { limit: number; windowMs: number } | null {
  const MINUTE = 60_000;

  // 채팅 메시지 전송 - 분당 10회
  if (pathname === '/api/chat' && method === 'PUT') {
    return { limit: 10, windowMs: MINUTE };
  }

  // 채팅 세션 생성 - 분당 5회
  if (pathname === '/api/chat' && method === 'POST') {
    return { limit: 5, windowMs: MINUTE };
  }

  // 이미지 생성 - 분당 5회 (비용 높음)
  if (pathname.startsWith('/api/generate-image')) {
    return { limit: 5, windowMs: MINUTE };
  }

  // 파일 업로드 - 분당 10회
  if (pathname.startsWith('/api/upload')) {
    return { limit: 10, windowMs: MINUTE };
  }

  // 기타 쓰기 API - 분당 30회
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && pathname.startsWith('/api/')) {
    return { limit: 30, windowMs: MINUTE };
  }

  // 읽기 API - 분당 60회
  if (method === 'GET' && pathname.startsWith('/api/')) {
    return { limit: 60, windowMs: MINUTE };
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // API 라우트만 처리
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // 인증 라우트는 제외 (NextAuth 내부 처리)
  if (pathname.startsWith('/api/auth/')) {
    return NextResponse.next();
  }

  const config = getRateLimitConfig(pathname, method);
  if (!config) {
    return NextResponse.next();
  }

  // IP 기반 키 생성
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const key = `${ip}:${pathname}:${method}`;

  const result = checkRateLimit(key, config.limit, config.windowMs);

  if (!result.success) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': config.limit.toString(),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Limit', config.limit.toString());
  response.headers.set('X-RateLimit-Remaining', result.remaining.toString());

  return response;
}

export const config = {
  matcher: '/api/:path*',
};
