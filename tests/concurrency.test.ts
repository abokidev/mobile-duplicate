import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { generateRawToken, hashToken } from '../src/lib/token.js';
import { loadCandidateByToken, recordSelection } from '../src/lib/selection.js';

/**
 * Proves the "exactly one selection, ever" guarantee (FR4, non-negotiable #2).
 *
 * These tests run against a real MySQL/InnoDB database (TEST_DATABASE_URL). The
 * guarantee depends on `SELECT ... FOR UPDATE` row locking inside an interactive
 * transaction, which SQLite / an in-memory fake cannot faithfully reproduce.
 */

async function resetDb() {
  // Order respects FK constraints.
  await prisma.event.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.token.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
}

async function makeCandidateWithToken(positionTitles: string[]) {
  const positions = [];
  for (const title of positionTitles) {
    positions.push(await prisma.position.create({ data: { title } }));
  }
  const candidate = await prisma.candidate.create({
    data: { name: 'Test Candidate', email: `test+${Date.now()}@example.com` },
  });
  for (const p of positions) {
    await prisma.shortlist.create({
      data: { candidateId: candidate.id, positionId: p.id },
    });
  }
  const rawToken = generateRawToken();
  await prisma.token.create({
    data: { candidateId: candidate.id, tokenHash: hashToken(rawToken) },
  });
  return { candidate, positions, rawToken };
}

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('one-time-use selection under concurrency', () => {
  it('lets exactly ONE of many concurrent submissions write a selection', async () => {
    const { candidate, positions, rawToken } = await makeCandidateWithToken([
      'Field Engineer',
      'Process Engineer',
      'Petroleum Engineer',
    ]);

    const N = 25;
    // Fire N submissions concurrently. Vary the chosen position across requests so
    // that if the lock failed, we'd also see conflicting positions recorded.
    const attempts = Array.from({ length: N }, (_, i) =>
      recordSelection({
        rawToken,
        positionId: positions[i % positions.length].id,
        ipAddress: `10.0.0.${i}`,
        userAgent: `agent-${i}`,
      })
    );

    const results = await Promise.all(attempts);

    // Every attempt resolves successfully (no user-visible error), but exactly one
    // is the "fresh" write; the rest observe the already-recorded selection.
    const fresh = results.filter((r) => r.ok && r.alreadyRecorded === false);
    const echoed = results.filter((r) => r.ok && r.alreadyRecorded === true);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(fresh).toHaveLength(1);
    expect(echoed).toHaveLength(N - 1);

    // Exactly one Selection row exists for the candidate.
    const selections = await prisma.selection.findMany({ where: { candidateId: candidate.id } });
    expect(selections).toHaveLength(1);

    // All attempts agree on the single recorded position (the winner's).
    const recordedPositionId = selections[0].positionId;
    const uniquePositions = new Set(results.map((r) => (r.ok ? r.positionId : -1)));
    expect(uniquePositions).toEqual(new Set([recordedPositionId]));

    // The token is now used.
    const token = await prisma.token.findUniqueOrThrow({ where: { candidateId: candidate.id } });
    expect(token.status).toBe('used');
    expect(token.usedAt).not.toBeNull();
  });

  it('is idempotent on retry: a second submit re-shows the recorded choice, no new row', async () => {
    const { candidate, positions, rawToken } = await makeCandidateWithToken([
      'Field Engineer',
      'Process Engineer',
    ]);

    const first = await recordSelection({ rawToken, positionId: positions[0].id });
    expect(first.ok && first.alreadyRecorded).toBe(false);

    // Retry with a DIFFERENT position — must not change or duplicate anything.
    const second = await recordSelection({ rawToken, positionId: positions[1].id });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.alreadyRecorded).toBe(true);
      expect(second.positionId).toBe(positions[0].id); // original choice stands
    }

    const selections = await prisma.selection.findMany({ where: { candidateId: candidate.id } });
    expect(selections).toHaveLength(1);
    expect(selections[0].positionId).toBe(positions[0].id);
  });

  it('records the audit trail (IP + user agent) on the selection (FR7)', async () => {
    const { candidate, positions, rawToken } = await makeCandidateWithToken(['Field Engineer', 'Geoscientist']);
    await recordSelection({
      rawToken,
      positionId: positions[0].id,
      ipAddress: '203.0.113.7',
      userAgent: 'Mozilla/5.0 test',
    });
    const sel = await prisma.selection.findUniqueOrThrow({ where: { candidateId: candidate.id } });
    expect(sel.ipAddress).toBe('203.0.113.7');
    expect(sel.userAgent).toBe('Mozilla/5.0 test');
    expect(sel.source).toBe('candidate');
  });
});

describe('token validation and position visibility', () => {
  it('rejects an unknown token as invalid (FR8)', async () => {
    const result = await recordSelection({ rawToken: 'not-a-real-token', positionId: 1 });
    expect(result).toEqual({ ok: false, reason: 'invalid_token' });
  });

  it('rejects a position the candidate was not shortlisted for (FR2 defence)', async () => {
    const { rawToken } = await makeCandidateWithToken(['Field Engineer', 'Process Engineer']);
    // A position that exists but is NOT on this candidate's shortlist.
    const other = await prisma.position.create({ data: { title: 'Not On Shortlist' } });
    const result = await recordSelection({ rawToken, positionId: other.id });
    expect(result).toEqual({ ok: false, reason: 'invalid_position' });
    // Nothing written.
    const count = await prisma.selection.count();
    expect(count).toBe(0);
  });

  it('exposes only the candidate’s shortlisted positions (FR2)', async () => {
    const { rawToken } = await makeCandidateWithToken(['Field Engineer', 'Process Engineer']);
    // A 7th position that exists globally but is not on this shortlist.
    await prisma.position.create({ data: { title: 'Unrelated Position' } });

    const view = await loadCandidateByToken(rawToken);
    expect(view).not.toBeNull();
    const titles = view!.positions.map((p) => p.title).sort();
    expect(titles).toEqual(['Field Engineer', 'Process Engineer']);
    expect(view!.firstName).toBe('Test');
  });

  it('returns null for an unknown token lookup (FR8 — caller shows generic)', async () => {
    const view = await loadCandidateByToken('does-not-exist');
    expect(view).toBeNull();
  });
});
