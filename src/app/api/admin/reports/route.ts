import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

/**
 * 신고 목록 조회 (관리자 전용)
 * GET /api/admin/reports?status=pending&page=1&limit=20
 */
export async function GET(request: NextRequest) {
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
    const status = searchParams.get('status') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.report.count({ where }),
    ]);

    return NextResponse.json({
      reports,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Admin reports fetch error:', error);
    return NextResponse.json({ error: '신고 목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * 신고 상태 업데이트 (관리자 전용)
 * PUT /api/admin/reports
 * body: { id, status, adminNote }
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
    const { id, status: newStatus, adminNote } = body;

    if (!id || !newStatus) {
      return NextResponse.json({ error: 'id와 status가 필요합니다.' }, { status: 400 });
    }

    const validStatuses = ['pending', 'reviewing', 'resolved', 'rejected'];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json({ error: '유효하지 않은 상태입니다.' }, { status: 400 });
    }

    const report = await prisma.report.update({
      where: { id },
      data: {
        status: newStatus,
        ...(adminNote !== undefined && { adminNote }),
      },
    });

    return NextResponse.json({ success: true, report });
  } catch (error) {
    console.error('Admin report update error:', error);
    return NextResponse.json({ error: '신고 상태 업데이트에 실패했습니다.' }, { status: 500 });
  }
}
