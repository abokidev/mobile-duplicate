/**
 * Seed reference + demo data.
 *
 *   npm run seed
 *
 * Idempotent — safe to re-run. Seeds:
 *   - the 7 fixed positions (PLACEHOLDER titles — replace with the client's
 *     confirmed titles before the real send; see README "Assumptions"),
 *   - a small set of demo candidates with shortlist rows that exercise both the
 *     multi-shortlisted path (emailed) and the single-shortlisted path (FR6),
 *   - a demo admin user for the dashboard.
 *
 * Token issuance and single-shortlist auto-recording are performed separately by
 * `scripts/issueTokens.ts` (the data-prep step).
 */
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/admin/auth.js';
import { POSITION_TITLES } from '../src/lib/positions.js';

// The 7 fixed positions, in the exact order from POSITIONS_SEED.md (single
// source of truth in src/lib/positions.ts).
const POSITIONS = POSITION_TITLES;

// Demo candidates for local verification only. The real candidate → position
// Shortlist mapping is outstanding and will be provided separately before send;
// replace these when it arrives. `shortlist` lists the titles each was shortlisted for.
const DEMO_CANDIDATES: { name: string; email: string; shortlist: string[] }[] = [
  { name: 'Adaeze Okonkwo', email: 'adaeze.okonkwo@example.com', shortlist: ['Process Technician', 'Electrical Specialist', 'Instrument Specialist'] },
  { name: 'Chukwuemeka Balogun', email: 'chukwuemeka.balogun@example.com', shortlist: ['Mechanical Specialist', 'Maintenance Co-ordinator'] },
  { name: 'Fatima Ibrahim', email: 'fatima.ibrahim@example.com', shortlist: ['ICSR Specialist', 'Instrument Specialist', 'Electrical Specialist'] },
  { name: 'Oluwaseun Adeyemi', email: 'oluwaseun.adeyemi@example.com', shortlist: ['Process Technician', 'Maintenance Integrity Supervisor'] },
  // Single-shortlist candidates — never emailed; auto-recorded at data-prep (FR6).
  { name: 'Ngozi Eze', email: 'ngozi.eze@example.com', shortlist: ['Mechanical Specialist'] },
  { name: 'Ibrahim Sani', email: 'ibrahim.sani@example.com', shortlist: ['Maintenance Co-ordinator'] },
];

async function main() {
  // 1. Positions.
  for (const title of POSITIONS) {
    await prisma.position.upsert({ where: { title }, update: {}, create: { title } });
  }
  const positions = await prisma.position.findMany();
  const byTitle = new Map(positions.map((p) => [p.title, p.id]));

  // 2. Candidates + shortlist.
  for (const dc of DEMO_CANDIDATES) {
    const candidate = await prisma.candidate.upsert({
      where: { email: dc.email },
      update: { name: dc.name },
      create: { name: dc.name, email: dc.email },
    });
    for (const title of dc.shortlist) {
      const positionId = byTitle.get(title);
      if (!positionId) throw new Error(`Unknown position in seed: ${title}`);
      await prisma.shortlist.upsert({
        where: { candidateId_positionId: { candidateId: candidate.id, positionId } },
        update: {},
        create: { candidateId: candidate.id, positionId },
      });
    }
  }

  // 3. Demo admin (FR9 stand-in). Override via ADMIN_EMAIL / ADMIN_PASSWORD.
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@dragnet-solutions.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe!2026';
  const existing = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!existing) {
    await prisma.adminUser.create({
      data: { email: adminEmail, passwordHash: await hashPassword(adminPassword) },
    });
    console.log(`Created demo admin: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log(`Admin already exists: ${adminEmail}`);
  }

  const counts = {
    positions: await prisma.position.count(),
    candidates: await prisma.candidate.count(),
    shortlist: await prisma.shortlist.count(),
  };
  console.log('Seed complete:', counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
