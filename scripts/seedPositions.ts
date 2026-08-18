/**
 * Seed ONLY the 7 fixed positions (no demo data). Idempotent.
 *
 *   npm run seed:positions
 *
 * Required setup step: the admin CSV upload validates each candidate's position
 * titles against these rows, so they must exist before any upload. If the
 * positions table is empty, every uploaded title is reported as "unknown".
 */
import { prisma } from '../src/lib/db.js';
import { POSITION_TITLES } from '../src/lib/positions.js';

async function main() {
  for (const title of POSITION_TITLES) {
    await prisma.position.upsert({ where: { title }, update: {}, create: { title } });
  }
  const count = await prisma.position.count();
  console.log(`Seeded/verified ${POSITION_TITLES.length} positions. Positions table now has ${count} row(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
