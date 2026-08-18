import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { commitImport } from '../src/admin/import.js';
import { POSITION_TITLES } from '../src/lib/positions.js';

async function resetDb() {
  await prisma.event.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.token.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
}

beforeEach(async () => {
  await resetDb();
  for (const title of POSITION_TITLES) await prisma.position.create({ data: { title } });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('bulk import (large lists)', () => {
  it('commits hundreds of rows in one fast pass with correct counts', async () => {
    const N = 600;
    const lines = ['name,email,positions'];
    for (let i = 0; i < N; i++) {
      const multi = i % 2 === 0;
      const positions = multi ? 'Process Technician;Electrical Specialist' : 'Mechanical Specialist';
      lines.push(`Candidate ${i},cand${i}@example.com,${positions}`);
    }
    const csv = lines.join('\n') + '\n';

    const res = await commitImport(csv);
    expect(res.candidatesCreated).toBe(N);
    expect(res.tokensCreated).toBe(N / 2); // multi
    expect(res.autoRecorded).toBe(N / 2); // single

    // DB reflects it: multi candidates have a token + 2 shortlist rows, singles a selection.
    expect(await prisma.candidate.count()).toBe(N);
    expect(await prisma.token.count()).toBe(N / 2);
    expect(await prisma.selection.count()).toBe(N / 2);
    expect(await prisma.shortlist.count()).toBe((N / 2) * 2 + (N / 2) * 1);

    // Every issued token retains its encrypted delivery copy for the send step.
    const tokens = await prisma.token.findMany({ take: 5 });
    for (const t of tokens) expect(t.deliveryEnc).toBeTruthy();
  });

  it('re-running the same import is idempotent (existing emails skipped, no duplicates)', async () => {
    const csv =
      'name,email,positions\n' +
      'Ada,ada@example.com,Process Technician;Electrical Specialist\n' +
      'Bem,bem@example.com,Mechanical Specialist\n';
    const first = await commitImport(csv);
    expect(first.candidatesCreated).toBe(2);
    const second = await commitImport(csv);
    expect(second.candidatesCreated).toBe(0); // both already exist → skipped
    expect(await prisma.candidate.count()).toBe(2);
  });
});
