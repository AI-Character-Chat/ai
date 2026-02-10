import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import createLogger from '@/lib/logger';

const log = createLogger('admin/settings');

/**
 * 사이트 설정 조회 (관리자 전용)
 * GET /api/admin/settings
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const settings = await prisma.siteSetting.findMany({
      orderBy: { key: 'asc' },
    });

    return NextResponse.json({ settings });
  } catch (error) {
    log.error('설정 조회 실패', error);
    return NextResponse.json({ error: '설정 조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * 사이트 설정 생성/수정 (관리자 전용)
 * PUT /api/admin/settings
 * body: { key, value, description? }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { key, value, description } = body;

    if (!key || value === undefined) {
      return NextResponse.json({ error: 'key와 value가 필요합니다.' }, { status: 400 });
    }

    const setting = await prisma.siteSetting.upsert({
      where: { key },
      create: { key, value: String(value), description },
      update: { value: String(value), ...(description !== undefined && { description }) },
    });

    return NextResponse.json({ success: true, setting });
  } catch (error) {
    log.error('설정 저장 실패', error);
    return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * 사이트 설정 삭제 (관리자 전용)
 * DELETE /api/admin/settings?key=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
    if (user?.role !== 'admin') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (!key) {
      return NextResponse.json({ error: 'key가 필요합니다.' }, { status: 400 });
    }

    await prisma.siteSetting.delete({ where: { key } });
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('설정 삭제 실패', error);
    return NextResponse.json({ error: '설정 삭제에 실패했습니다.' }, { status: 500 });
  }
}
