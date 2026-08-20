import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { generateRawToken, hashToken } from '../src/lib/token.js';
import { encryptDeliveryToken } from '../src/lib/crypto.js';
import { getDashboardData } from '../src/admin/data.js';
import { countInitialPending, countReminderPending } from '../src/admin/sending.js';

async function resetDb() {
  await prisma.event.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.token.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
}

async function makeMultiCandidateWithToken() {
  const p1 = await prisma.position.create({ data: { title: 'Process Technician' } });
  const p2 = await prisma.position.create({ data: { title: 'Electrical Specialist' } });
  const c = await prisma.candidate.create({ data: { name: 'Jerry Ikechukwu', email: `j+${Date.now()}@x.com` } });
  await prisma.shortlist.createMany({
    data: [
      { candidateId: c.id, positionId: p1.id },
      { candidateId: c.id, positionId: p2.id },
    ],
  });
  const raw = generateRawToken();
  const token = await prisma.token.create({
    data: { candidateId: c.id, tokenHash: hashToken(raw), deliveryEnc: encryptDeliveryToken(raw) },
  });
  return { candidateId: c.id, tokenId: token.id };
}

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('send status is driven by token.sentAt (reliable), not the best-effort event', () => {
  it('before a send: pending, dashboard shows "not_sent"', async () => {
    await makeMultiCandidateWithToken();
    expect(await countInitialPending()).toBe(1);
    const data = await getDashboardData();
    expect(data.rows[0].stage).toBe('not_sent');
    expect(data.rows[0].sentAt).toBeNull();
  });

  it('backward-compatible: a candidate already marked sent via the OLD event (no sentAt) is unaffected', async () => {
    const { tokenId } = await makeMultiCandidateWithToken();
    // Simulate data written by an earlier version: a `sent` event, but sentAt null.
    await prisma.event.create({ data: { tokenId, type: 'sent' } });

    expect(await countInitialPending()).toBe(0); // NOT re-queued → no duplicate email
    expect(await countReminderPending()).toBe(1); // still reminder-eligible
    const data = await getDashboardData();
    expect(data.rows[0].stage).toBe('sent'); // dashboard still shows Sent
  });

  it('after sentAt is set (even with NO sent event): shows "Sent", not pending, and is reminder-eligible', async () => {
    const { tokenId } = await makeMultiCandidateWithToken();
    // Simulate what the send batch writes on success — the authoritative marker,
    // deliberately WITHOUT logging a `sent` event (the failure mode from prod).
    await prisma.token.update({ where: { id: tokenId }, data: { sentAt: new Date(), sentTemplate: 'message_2' } });

    expect(await countInitialPending()).toBe(0); // never re-sent → no duplicate email
    expect(await countReminderPending()).toBe(1); // sent + still unused → can be reminded

    const data = await getDashboardData();
    expect(data.rows[0].stage).toBe('sent');
    expect(data.rows[0].sentAt).not.toBeNull();
    expect(data.counters.sent).toBe(1);
    expect(data.counters.notSent).toBe(0);
  });
});
