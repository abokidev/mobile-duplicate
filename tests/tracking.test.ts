import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { generateRawToken, hashToken } from '../src/lib/token.js';
import { encryptDeliveryToken, decryptDeliveryToken } from '../src/lib/crypto.js';
import { recordSelection } from '../src/lib/selection.js';

async function resetDb() {
  await prisma.event.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.token.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
}

beforeEach(resetDb);
afterAll(async () => {
  await prisma.$disconnect();
});

describe('delivery-token encryption', () => {
  it('round-trips the raw token and rejects tampering', () => {
    const raw = generateRawToken();
    const enc = encryptDeliveryToken(raw);
    expect(enc).not.toContain(raw);
    expect(decryptDeliveryToken(enc)).toBe(raw);
    expect(decryptDeliveryToken('v1:aaa:bbb:ccc')).toBeNull();
    expect(decryptDeliveryToken('garbage')).toBeNull();
  });
});

describe('submission purges the retained token and logs the timeline', () => {
  it('clears deliveryEnc and records a submitted event on submit', async () => {
    const pos = await prisma.position.createMany({
      data: [{ title: 'Process Technician' }, { title: 'Electrical Specialist' }],
    });
    expect(pos.count).toBe(2);
    const positions = await prisma.position.findMany();
    const candidate = await prisma.candidate.create({
      data: { name: 'Ada Test', email: `ada+${Date.now()}@x.com` },
    });
    for (const p of positions) {
      await prisma.shortlist.create({ data: { candidateId: candidate.id, positionId: p.id } });
    }
    const raw = generateRawToken();
    const token = await prisma.token.create({
      data: {
        candidateId: candidate.id,
        tokenHash: hashToken(raw),
        deliveryEnc: encryptDeliveryToken(raw),
      },
    });
    // Simulate the "sent" event the batch would log.
    await prisma.event.create({ data: { tokenId: token.id, type: 'sent' } });

    const res = await recordSelection({ rawToken: raw, positionId: positions[0].id, ipAddress: '1.2.3.4' });
    expect(res.ok).toBe(true);

    const after = await prisma.token.findUniqueOrThrow({ where: { id: token.id } });
    expect(after.status).toBe('used');
    expect(after.deliveryEnc).toBeNull(); // retained raw purged on submission

    const submitted = await prisma.event.findMany({ where: { tokenId: token.id, type: 'submitted' } });
    expect(submitted).toHaveLength(1);
  });
});
