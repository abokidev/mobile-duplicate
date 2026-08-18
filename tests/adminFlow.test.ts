import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/admin/auth.js';
import { decryptDeliveryToken } from '../src/lib/crypto.js';

const POSITIONS = [
  'Process Technician',
  'Electrical Specialist',
  'ICSR Specialist',
  'Mechanical Specialist',
  'Instrument Specialist',
  'Maintenance Integrity Supervisor',
  'Maintenance Co-ordinator',
];

let app: FastifyInstance;
let cookie = '';

async function resetDb() {
  await prisma.event.deleteMany();
  await prisma.selection.deleteMany();
  await prisma.token.deleteMany();
  await prisma.shortlist.deleteMany();
  await prisma.candidate.deleteMany();
  await prisma.position.deleteMany();
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
}

function multipart(csv: string): { headers: Record<string, string>; payload: string } {
  const boundary = '----vitestboundary1234567890';
  const payload =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="candidates.csv"\r\n` +
    `Content-Type: text/csv\r\n\r\n` +
    `${csv}\r\n` +
    `--${boundary}--\r\n`;
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, cookie }, payload };
}

beforeAll(async () => {
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
  for (const title of POSITIONS) await prisma.position.create({ data: { title } });
  await prisma.adminUser.create({
    data: { email: 'admin@dragnet.test', passwordHash: await hashPassword('pw12345') },
  });
  // Log in and capture the signed session cookie.
  const res = await app.inject({
    method: 'POST',
    url: '/admin/login',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'email=admin@dragnet.test&password=pw12345',
  });
  const setCookie = res.headers['set-cookie'];
  const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie!;
  cookie = raw.split(';')[0];
  expect(res.statusCode).toBe(302);
});

const CSV =
  'name,email,positions\n' +
  'Adaeze Okafor,adaeze@example.com,Process Technician;Electrical Specialist\n' + // multi
  'Bem Aïcha,bem@example.com,Mechanical Specialist\n' + // single
  'Bad Row,not-an-email,Process Technician\n' + // error
  'Chidi Uzo,chidi@example.com,Unknown Role\n'; // error (unknown title)

describe('admin upload → preview → commit → tracking (in-process)', () => {
  it('requires auth for the dashboard', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/admin/login');
  });

  it('previews a CSV without writing anything', async () => {
    const res = await app.inject({ method: 'POST', url: '/admin/upload/preview', ...multipart(CSV) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Review before import');
    // 2 good (1 multi, 1 single), 2 bad
    expect(res.body).toContain('unknown position title');
    expect(res.body).toContain('malformed email');
    // Nested fragments must render as real HTML, not escaped text (regression guard).
    expect(res.body).toContain('action="/admin/upload/errors"');
    expect(res.body).toContain('<table class="dash-table">');
    // Nothing written yet.
    expect(await prisma.candidate.count()).toBe(0);
  });

  it('commits only the good rows and sets up tokens + auto-records singles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/upload/commit',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: `csv=${encodeURIComponent(CSV)}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Candidates imported');

    expect(await prisma.candidate.count()).toBe(2); // 2 bad skipped
    const multi = await prisma.candidate.findUnique({
      where: { email: 'adaeze@example.com' },
      include: { token: true, shortlist: true },
    });
    expect(multi?.token).toBeTruthy();
    expect(multi?.token?.deliveryEnc).toBeTruthy(); // raw retained (encrypted) for send
    expect(multi?.shortlist).toHaveLength(2);

    const single = await prisma.candidate.findUnique({
      where: { email: 'bem@example.com' },
      include: { token: true, selection: true },
    });
    expect(single?.token).toBeNull(); // no token, never emailed (FR6)
    expect(single?.selection?.source).toBe('auto_single_shortlist');
  });

  it('tracks page_visited and opened, and surfaces them on the dashboard', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/upload/commit',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: `csv=${encodeURIComponent(CSV)}`,
    });
    const token = await prisma.token.findFirstOrThrow({ include: { candidate: true } });
    const raw = decryptDeliveryToken(token.deliveryEnc!)!;
    expect(raw).toBeTruthy();

    // Pixel load → opened
    const px = await app.inject({ method: 'GET', url: `/e/${raw}/pixel.gif` });
    expect(px.statusCode).toBe(200);
    expect(px.headers['content-type']).toBe('image/gif');
    // Instructions load → page_visited
    const page = await app.inject({ method: 'GET', url: `/s/${raw}` });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('Hey Adaeze');

    const types = (await prisma.event.findMany({ where: { tokenId: token.id } })).map((e) => e.type).sort();
    expect(types).toContain('opened');
    expect(types).toContain('page_visited');

    const dash = await app.inject({ method: 'GET', url: '/admin', headers: { cookie } });
    expect(dash.statusCode).toBe(200);
    expect(dash.body).toContain('Visited');
    expect(dash.body).toContain('best-effort'); // honesty note about "opened"
  });

  it('reports the pending count on the send-invitations confirm step', async () => {
    await app.inject({
      method: 'POST',
      url: '/admin/upload/commit',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      payload: `csv=${encodeURIComponent(CSV)}`,
    });
    const res = await app.inject({ method: 'POST', url: '/admin/send/preview', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    // one multi-shortlisted candidate is awaiting its first email
    expect(res.body).toContain('Send invitation emails?');
    expect(res.body).toMatch(/email <strong>1<\/strong>/);
  });

  it('exports a CSV with the tracking columns', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/export.csv', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('Visited At (UTC)');
    expect(res.body).toContain('Reminders Sent');
  });
});
