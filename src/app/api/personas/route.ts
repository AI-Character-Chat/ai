import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// 페르소나 목록 조회
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const personas = await prisma.persona.findMany({
      where: { userId: session.user.id },
      orderBy: [
        { isDefault: 'desc' }, // 기본 프로필 먼저
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json({ personas });
  } catch (error) {
    console.error('Failed to fetch personas:', error);
    return NextResponse.json({ error: '페르소나 목록을 불러오는데 실패했습니다.' }, { status: 500 });
  }
}

// 페르소나 생성
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { name, age, gender, description, isDefault } = await request.json();

    if (!name || name.length > 20) {
      return NextResponse.json({ error: '닉네임은 1~20자로 입력해주세요.' }, { status: 400 });
    }

    if (description && description.length > 1000) {
      return NextResponse.json({ error: '상세정보는 최대 1000자까지 입력 가능합니다.' }, { status: 400 });
    }

    // 기본 프로필 설정 시 기존 기본 프로필 해제
    if (isDefault) {
      await prisma.persona.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    // 첫 페르소나인 경우 자동으로 기본 프로필 설정
    const existingCount = await prisma.persona.count({
      where: { userId: session.user.id },
    });

    const persona = await prisma.persona.create({
      data: {
        userId: session.user.id,
        name,
        age: age ? parseInt(age) : null,
        gender: gender || 'private',
        description: description || null,
        isDefault: existingCount === 0 ? true : isDefault || false,
      },
    });

    return NextResponse.json({ persona });
  } catch (error) {
    console.error('Failed to create persona:', error);
    return NextResponse.json({ error: '페르소나 생성에 실패했습니다.' }, { status: 500 });
  }
}

// 페르소나 수정
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { id, name, age, gender, description, isDefault } = await request.json();

    if (!id) {
      return NextResponse.json({ error: '페르소나 ID가 필요합니다.' }, { status: 400 });
    }

    if (!name || name.length > 20) {
      return NextResponse.json({ error: '닉네임은 1~20자로 입력해주세요.' }, { status: 400 });
    }

    if (description && description.length > 1000) {
      return NextResponse.json({ error: '상세정보는 최대 1000자까지 입력 가능합니다.' }, { status: 400 });
    }

    // 본인 페르소나인지 확인
    const existingPersona = await prisma.persona.findUnique({
      where: { id },
    });

    if (!existingPersona || existingPersona.userId !== session.user.id) {
      return NextResponse.json({ error: '페르소나를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기본 프로필 설정 시 기존 기본 프로필 해제
    if (isDefault && !existingPersona.isDefault) {
      await prisma.persona.updateMany({
        where: { userId: session.user.id, isDefault: true },
        data: { isDefault: false },
      });
    }

    const persona = await prisma.persona.update({
      where: { id },
      data: {
        name,
        age: age ? parseInt(age) : null,
        gender: gender || 'private',
        description: description || null,
        isDefault: isDefault || false,
      },
    });

    return NextResponse.json({ persona });
  } catch (error) {
    console.error('Failed to update persona:', error);
    return NextResponse.json({ error: '페르소나 수정에 실패했습니다.' }, { status: 500 });
  }
}

// 페르소나 삭제
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '페르소나 ID가 필요합니다.' }, { status: 400 });
    }

    // 본인 페르소나인지 확인
    const existingPersona = await prisma.persona.findUnique({
      where: { id },
    });

    if (!existingPersona || existingPersona.userId !== session.user.id) {
      return NextResponse.json({ error: '페르소나를 찾을 수 없습니다.' }, { status: 404 });
    }

    await prisma.persona.delete({
      where: { id },
    });

    // 삭제한 페르소나가 기본이었다면 첫 번째 페르소나를 기본으로 설정
    if (existingPersona.isDefault) {
      const firstPersona = await prisma.persona.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
      });

      if (firstPersona) {
        await prisma.persona.update({
          where: { id: firstPersona.id },
          data: { isDefault: true },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete persona:', error);
    return NextResponse.json({ error: '페르소나 삭제에 실패했습니다.' }, { status: 500 });
  }
}
