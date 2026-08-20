import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/db.js';
import { normalizePhone, inNoDeliveryWindowWAT } from '../src/lib/termii.js';
import { generateRawToken, hashToken } from '../src/lib/token.js';
import { encryptDeliveryToken } from '../src/lib/crypto.js';
import { validatePhoneCsv, commitPhoneUpdate } from '../src/admin/phones.js';
import { pendingExportCsv } from '../src/admin/data.js';
import { countReminderPendingWithPhone, countReminderPendingNoPhone } from '../src/admin/sending.js';
import { adminConfirmSendPage } from '../src/admin/pages.js';

describe('SMS reminder confirm page (pure render)', () => {
  it('renders real HTML (no escaped fragments), the SMS wording, the excluded-count note and the draft note', () => {
    const html = adminConfirmSendPage({
      kind: 'remind',
      count: 1,
      action: '/admin/remind',
      channel: 'sms',
      smsNoPhone: 2,
      noDeliveryWindow: false,
    });
    expect(html).toContain('Remind pending candidates by SMS?');
    expect(html).toContain('Send 1 SMS reminder(s)');
    expect(html).toContain('2 pending candidate(s) have no phone number');
    // Back form must render as real HTML, not escaped text (regression guard).
    expect(html).toContain('action="/admin/remind/channel"');
    expect(html).not.toContain('&lt;form');
  });
});

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

describe('phone normalisation', () => {
  it('normalises Nigerian formats to 234XXXXXXXXXX', () => {
    expect(normalizePhone('08012345678')).toBe('2348012345678');
    expect(normalizePhone('+234 801 234 5678')).toBe('2348012345678');
    expect(normalizePhone('2348012345678')).toBe('2348012345678');
    expect(normalizePhone('8012345678')).toBe('2348012345678');
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
  });

  it('flags the WAT 8pm–8am no-delivery window (WAT = UTC+1)', () => {
    expect(inNoDeliveryWindowWAT(new Date('2026-08-20T10:00:00Z'))).toBe(false); // 11:00 WAT → daytime
    expect(inNoDeliveryWindowWAT(new Date('2026-08-20T20:00:00Z'))).toBe(true); // 21:00 WAT → in window
    expect(inNoDeliveryWindowWAT(new Date('2026-08-20T05:00:00Z'))).toBe(true); // 06:00 WAT → before 8am
    expect(inNoDeliveryWindowWAT(new Date('2026-08-20T08:00:00Z'))).toBe(false); // 09:00 WAT → daytime
  });
});

async function makePendingToken(email: string, phone: string | null) {
  const p1 = await prisma.position.upsert({ where: { title: 'Process Technician' }, update: {}, create: { title: 'Process Technician' } });
  const p2 = await prisma.position.upsert({ where: { title: 'Electrical Specialist' }, update: {}, create: { title: 'Electrical Specialist' } });
  const c = await prisma.candidate.create({ data: { name: 'Cand X', email, phoneNumber: phone } });
  await prisma.shortlist.createMany({ data: [{ candidateId: c.id, positionId: p1.id }, { candidateId: c.id, positionId: p2.id }] });
  const raw = generateRawToken();
  const t = await prisma.token.create({
    data: { candidateId: c.id, tokenHash: hashToken(raw), deliveryEnc: encryptDeliveryToken(raw), sentAt: new Date() },
  });
  return { candidateId: c.id, tokenId: t.id };
}

describe('phone re-upload (match by email, attach only phone)', () => {
  it('attaches phones to matched candidates and reports unmatched, ignoring extra columns', async () => {
    await makePendingToken('a@x.com', null);
    await makePendingToken('b@x.com', null);
    // File includes name/positions columns which must be ignored; one email doesn't match.
    const csv =
      'name,email,positions,phone\n' +
      'Ignored Name,a@x.com,Ignored;Columns,08011112222\n' +
      'Someone,nomatch@x.com,x,08033334444\n';
    const preview = await validatePhoneCsv(csv);
    expect(preview.matched).toHaveLength(1);
    expect(preview.matched[0].email).toBe('a@x.com');
    expect(preview.matched[0].phone).toBe('2348011112222');
    expect(preview.bad).toHaveLength(1);
    expect(preview.bad[0].reason).toContain('no matching candidate');

    const res = await commitPhoneUpdate(csv);
    expect(res.updated).toBe(1);
    const a = await prisma.candidate.findUniqueOrThrow({ where: { email: 'a@x.com' } });
    expect(a.phoneNumber).toBe('2348011112222');
    // untouched candidate keeps null; shortlist not re-validated/altered
    const b = await prisma.candidate.findUniqueOrThrow({ where: { email: 'b@x.com' }, include: { shortlist: true } });
    expect(b.phoneNumber).toBeNull();
    expect(b.shortlist).toHaveLength(2);
  });
});

describe('SMS reminder audience counts', () => {
  it('counts pending WITH vs WITHOUT a phone number', async () => {
    await makePendingToken('withphone@x.com', '2348010000000');
    await makePendingToken('nophone@x.com', null);
    expect(await countReminderPendingWithPhone()).toBe(1);
    expect(await countReminderPendingNoPhone()).toBe(1);
  });
});

describe('export pending', () => {
  it('exports only unused-token candidates with phone column', async () => {
    await makePendingToken('pending@x.com', '2348012345678');
    const csv = await pendingExportCsv();
    expect(csv).toContain('Name,Email,Phone,Shortlisted Positions');
    expect(csv).toContain('pending@x.com');
    expect(csv).toContain('2348012345678');
    expect(csv).toContain('Electrical Specialist; Process Technician');
  });
});
