import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const userId = "cmlnqotxe0000ppxgodun6kyp";
  const workId = "1a7d0cdd-12b6-42a9-9126-1edfe066e85a";

  const memories = await prisma.characterMemory.findMany({
    where: { userId, workId },
    include: { character: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  console.log(`=== CHARACTER MEMORIES (${memories.length}개) ===`);

  const byChar: Record<string, typeof memories> = {};
  for (const m of memories) {
    const name = m.character?.name || "unknown";
    if (!(name in byChar)) byChar[name] = [];
    byChar[name].push(m);
  }

  for (const [name, mems] of Object.entries(byChar)) {
    console.log(`\n--- ${name} (${mems.length}개) ---`);
    for (const m of mems) {
      const kw = JSON.parse(m.keywords || "[]") as string[];
      console.log(`[${m.memoryType}] imp=${m.importance.toFixed(2)} str=${m.strength.toFixed(2)} mentioned=${m.mentionedCount}`);
      console.log(`  해석: ${m.interpretation.substring(0, 150)}`);
      if (kw.length > 0) console.log(`  키워드: ${kw.slice(0, 5).join(", ")}`);
    }
  }

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
