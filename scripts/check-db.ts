import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sessions = await prisma.chatSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { id: true, createdAt: true, turnCount: true, workId: true, userId: true }
  });
  console.log("=== Recent Sessions ===");
  sessions.forEach(s => console.log(JSON.stringify(s)));

  const s = sessions[0];
  if (s == null) return;

  const rels = await prisma.userCharacterRelationship.findMany({
    where: { userId: s.userId, workId: s.workId },
    select: { characterId: true, character: { select: { name: true } }, knownFacts: true, intimacyLevel: true, trust: true, affection: true, familiarity: true, sharedExperiences: true }
  });
  console.log("\n=== Character Relationships ===");
  rels.forEach(r => {
    const facts: string[] = JSON.parse(r.knownFacts || "[]");
    const name = r.character?.name ?? r.characterId;
    const exps: string[] = JSON.parse(r.sharedExperiences || "[]");
    console.log(`${name}: ${r.intimacyLevel} | trust:${r.trust} aff:${r.affection} fam:${r.familiarity} | knownFacts: ${facts.length}개 | sharedExp: ${exps.length}개`);
    facts.forEach((f, i) => console.log(`  [fact ${i}] ${f}`));
    exps.slice(0, 5).forEach((e, i) => console.log(`  [exp ${i}] ${e}`));
  });

  const memCount = await prisma.characterMemory.groupBy({
    by: ["characterId"],
    where: { userId: s.userId, workId: s.workId },
    _count: true
  });
  console.log("\n=== Character Memories Count ===");
  memCount.forEach(m => console.log(`characterId ${m.characterId}: ${m._count}개`));

  const mems = await prisma.characterMemory.findMany({
    where: { userId: s.userId, workId: s.workId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { characterId: true, interpretation: true, importance: true, memoryType: true, strength: true }
  });
  console.log("\n=== Recent 30 Memories ===");
  mems.forEach((m, i) => console.log(`[${i}] [${m.memoryType}] imp:${m.importance} str:${m.strength?.toFixed(2) ?? "?"} ${(m.interpretation ?? "").substring(0, 100)}`));

  await prisma.$disconnect();
}
main();
