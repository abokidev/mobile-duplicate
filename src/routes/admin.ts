import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getAdminFromRequest,
  setSessionCookie,
  verifyPassword,
  type AdminIdentity,
} from '../admin/auth.js';
import { getDashboardData, toCsv } from '../admin/data.js';
import {
  adminBatchResultPage,
  adminConfirmSendPage,
  adminDashboardPage,
  adminImportResultPage,
  adminLoginPage,
  adminPreviewPage,
  adminUploadPage,
} from '../admin/pages.js';
import { commitImport, errorReportCsv, validateCsv } from '../admin/import.js';
import {
  countInitialPending,
  countReminderPending,
  sendInitialBatch,
  sendReminderBatch,
} from '../admin/sending.js';

function sendHtml(reply: FastifyReply, statusCode: number, body: string) {
  reply
    .code(statusCode)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store, private')
    .send(body);
}

async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<AdminIdentity | null> {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    reply.redirect('/admin/login');
    return null;
  }
  return admin;
}

function csvFromBody(body: unknown): string {
  const v = (body as Record<string, unknown> | null)?.csv;
  return typeof v === 'string' ? v : '';
}

export async function adminRoutes(app: FastifyInstance) {
  const loginRateLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.get('/admin/login', async (req, reply) => {
    if (await getAdminFromRequest(req)) return reply.redirect('/admin');
    return sendHtml(reply, 200, adminLoginPage());
  });

  app.post('/admin/login', loginRateLimit, async (req: FastifyRequest, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const admin = email ? await prisma.adminUser.findUnique({ where: { email } }) : null;
    const ok = admin
      ? await verifyPassword(password, admin.passwordHash)
      : await verifyPassword(password, 'scrypt$00$00');

    if (!admin || !ok) return sendHtml(reply, 401, adminLoginPage({ error: true }));

    setSessionCookie(reply, await createSession(admin.id));
    return reply.redirect('/admin');
  });

  app.post('/admin/logout', async (req, reply) => {
    await destroySession(req);
    clearSessionCookie(reply);
    return reply.redirect('/admin/login');
  });

  app.get('/admin', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const flash = typeof (req.query as Record<string, unknown>)?.flash === 'string'
      ? String((req.query as Record<string, unknown>).flash).slice(0, 200)
      : undefined;
    return sendHtml(reply, 200, adminDashboardPage(await getDashboardData(), admin, flash));
  });

  app.get('/admin/export.csv', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="position-preferences.csv"')
      .header('cache-control', 'no-store, private')
      .send(toCsv(await getDashboardData()));
  });

  // ── Upload ────────────────────────────────────────────────────────────────
  app.get('/admin/upload', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return sendHtml(reply, 200, adminUploadPage());
  });

  app.post('/admin/upload/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    let text = '';
    try {
      const file = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
      if (!file) return sendHtml(reply, 400, adminUploadPage({ error: 'No file was uploaded.' }));
      text = (await file.toBuffer()).toString('utf8');
    } catch {
      return sendHtml(reply, 400, adminUploadPage({ error: 'Could not read the uploaded file.' }));
    }
    try {
      const result = await validateCsv(text);
      return sendHtml(reply, 200, adminPreviewPage(result, text));
    } catch (err) {
      return sendHtml(reply, 400, adminUploadPage({ error: (err as Error).message }));
    }
  });

  app.post('/admin/upload/commit', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const text = csvFromBody(req.body);
    if (!text) return sendHtml(reply, 400, adminUploadPage({ error: 'Nothing to import.' }));
    try {
      const res = await commitImport(text);
      return sendHtml(reply, 200, adminImportResultPage(res));
    } catch (err) {
      return sendHtml(reply, 400, adminUploadPage({ error: (err as Error).message }));
    }
  });

  app.post('/admin/upload/errors', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const text = csvFromBody(req.body);
    const result = await validateCsv(text);
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="import-errors.csv"')
      .header('cache-control', 'no-store, private')
      .send(errorReportCsv(result));
  });

  // ── Send invitations ────────────────────────────────────────────────────────
  app.post('/admin/send/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const count = await countInitialPending();
    return sendHtml(reply, 200, adminConfirmSendPage({ kind: 'send', count, action: '/admin/send' }));
  });

  app.post('/admin/send', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    try {
      const res = await sendInitialBatch();
      return sendHtml(reply, 200, adminBatchResultPage('send', res));
    } catch (err) {
      return sendHtml(reply, 200, adminUploadPage({ error: `Send failed: ${(err as Error).message}` }));
    }
  });

  // ── Reminders ────────────────────────────────────────────────────────────────
  app.post('/admin/remind/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const count = await countReminderPending();
    return sendHtml(reply, 200, adminConfirmSendPage({ kind: 'remind', count, action: '/admin/remind' }));
  });

  app.post('/admin/remind', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    try {
      const res = await sendReminderBatch();
      return sendHtml(reply, 200, adminBatchResultPage('remind', res));
    } catch (err) {
      return sendHtml(reply, 200, adminUploadPage({ error: `Reminder send failed: ${(err as Error).message}` }));
    }
  });
}
