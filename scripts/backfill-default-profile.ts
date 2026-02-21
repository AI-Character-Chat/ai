import { PrismaClient } from '@prisma/client';

const DEFAULT_PROFILE_IMAGE = '/default-profile.svg';
const prisma = new PrismaClient();

async function main() {
  // null 이미지 유저도 포함하여 업데이트
  const result = await prisma.user.updateMany({
    where: {
      OR: [
        { image: null },
        { image: { not: DEFAULT_PROFILE_IMAGE } },
      ],
    },
    data: {
      image: DEFAULT_PROFILE_IMAGE,
    },
  });

  console.log(`${result.count}명의 프로필 이미지를 기본 이미지로 업데이트`);

  // 검증
  const after = await prisma.user.findMany({ select: { id: true, name: true, image: true } });
  console.log('\n=== 최종 상태 ===');
  for (const u of after) {
    console.log(`  ${u.name || '(이름없음)'} | ${u.image}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
