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
import { getDashboardData, pendingExportCsv, toCsv } from '../admin/data.js';
import {
  adminBatchStartedPage,
  adminChooseChannelPage,
  adminChooseTemplatePage,
  adminConfirmSendPage,
  adminDashboardPage,
  adminImportResultPage,
  adminLoginPage,
  adminPhonesPreviewPage,
  adminPhonesResultPage,
  adminPhonesUploadPage,
  adminPreviewPage,
  adminUploadPage,
} from '../admin/pages.js';
import type { MessageTemplate } from '../lib/email.js';
import { commitImport, errorReportCsv, validateCsv } from '../admin/import.js';
import { commitPhoneUpdate, phoneErrorReportCsv, validatePhoneCsv } from '../admin/phones.js';
import { POSITION_TITLES } from '../lib/positions.js';
import { loadEmailConfig, loadSmsConfig } from '../lib/env.js';
import { inNoDeliveryWindowWAT } from '../lib/termii.js';
import {
  countInitialPending,
  countReminderPending,
  countReminderPendingNoPhone,
  countReminderPendingWithPhone,
  isReminderRunning,
  isSendRunning,
  sendInitialBatch,
  sendReminderBatch,
  type ReminderChannel,
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
  // Accepted titles from the DB; if none are configured, show the canonical set
  // as a hint so the admin knows what to seed / match.
  async function acceptedTitles(): Promise<{ titles: string[]; configured: boolean }> {
    const rows = await prisma.position.findMany({ select: { title: true }, orderBy: { id: 'asc' } });
    if (rows.length === 0) return { titles: [...POSITION_TITLES], configured: false };
    return { titles: rows.map((r) => r.title), configured: true };
  }
  const NOT_CONFIGURED_MSG =
    'No positions are configured in the database yet, so every title will be rejected as “unknown”. ' +
    'Seed the 7 positions first (run: npm run seed:positions), then upload.';

  app.get('/admin/upload', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { titles, configured } = await acceptedTitles();
    return sendHtml(reply, 200, adminUploadPage({ validTitles: titles, error: configured ? undefined : NOT_CONFIGURED_MSG }));
  });

  app.post('/admin/upload/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const { titles, configured } = await acceptedTitles();
    // Guard the confusing all-unknown case before parsing.
    if (!configured) {
      return sendHtml(reply, 400, adminUploadPage({ validTitles: titles, error: NOT_CONFIGURED_MSG }));
    }
    let text = '';
    try {
      const file = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
      if (!file) return sendHtml(reply, 400, adminUploadPage({ validTitles: titles, error: 'No file was uploaded.' }));
      text = (await file.toBuffer()).toString('utf8');
    } catch {
      return sendHtml(reply, 400, adminUploadPage({ validTitles: titles, error: 'Could not read the uploaded file.' }));
    }
    try {
      const result = await validateCsv(text);
      return sendHtml(reply, 200, adminPreviewPage(result, text));
    } catch (err) {
      return sendHtml(reply, 400, adminUploadPage({ validTitles: titles, error: (err as Error).message }));
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

  // ── Export pending (SMS Reminder addendum §2) ────────────────────────────────
  app.get('/admin/export-pending.csv', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="pending-candidates.csv"')
      .header('cache-control', 'no-store, private')
      .send(await pendingExportCsv());
  });

  // ── Attach phone numbers (SMS Reminder addendum §3) ──────────────────────────
  app.get('/admin/phones', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return sendHtml(reply, 200, adminPhonesUploadPage());
  });

  app.post('/admin/phones/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    let text = '';
    try {
      const file = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
      if (!file) return sendHtml(reply, 400, adminPhonesUploadPage({ error: 'No file was uploaded.' }));
      text = (await file.toBuffer()).toString('utf8');
    } catch {
      return sendHtml(reply, 400, adminPhonesUploadPage({ error: 'Could not read the uploaded file.' }));
    }
    try {
      const result = await validatePhoneCsv(text);
      return sendHtml(reply, 200, adminPhonesPreviewPage(result, text));
    } catch (err) {
      return sendHtml(reply, 400, adminPhonesUploadPage({ error: (err as Error).message }));
    }
  });

  app.post('/admin/phones/commit', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const text = csvFromBody(req.body);
    if (!text) return sendHtml(reply, 400, adminPhonesUploadPage({ error: 'Nothing to update.' }));
    try {
      const res = await commitPhoneUpdate(text);
      return sendHtml(reply, 200, adminPhonesResultPage(res));
    } catch (err) {
      return sendHtml(reply, 400, adminPhonesUploadPage({ error: (err as Error).message }));
    }
  });

  app.post('/admin/phones/errors', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const result = await validatePhoneCsv(csvFromBody(req.body));
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="phone-update-errors.csv"')
      .header('cache-control', 'no-store, private')
      .send(phoneErrorReportCsv(result));
  });

  // ── Send invitations ────────────────────────────────────────────────────────
  const parseTemplate = (body: unknown): MessageTemplate => {
    const v = (body as Record<string, unknown> | null)?.template;
    return v === 'message_2' ? 'message_2' : 'message_1';
  };

  // Step 1: choose which approved message to send (Message Template Choice addendum).
  app.post('/admin/send/choose', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return sendHtml(reply, 200, adminChooseTemplatePage());
  });

  // Step 2: confirmation, carrying the chosen template through.
  app.post('/admin/send/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const template = parseTemplate(req.body);
    const count = await countInitialPending();
    return sendHtml(reply, 200, adminConfirmSendPage({ kind: 'send', count, action: '/admin/send', template }));
  });

  app.post('/admin/send', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    // Validate email config up front so a misconfiguration is shown immediately
    // rather than failing silently in the background.
    try {
      loadEmailConfig({ requireToken: true });
    } catch (err) {
      return sendHtml(reply, 200, adminUploadPage({ error: `Send failed: ${(err as Error).message}` }));
    }
    const template = parseTemplate(req.body);
    const alreadyRunning = isSendRunning();
    const count = alreadyRunning ? 0 : await countInitialPending();
    // Send in the background and return immediately — large lists must not block
    // the request (an nginx 504 otherwise). Progress shows on the dashboard, and
    // the batch is idempotent so it can be safely re-run to retry failures.
    if (!alreadyRunning) {
      void sendInitialBatch(template).catch((err) => app.log.error({ err }, 'initial send batch failed'));
    }
    return sendHtml(reply, 200, adminBatchStartedPage('send', count, alreadyRunning));
  });

  // ── Reminders ────────────────────────────────────────────────────────────────
  const parseChannel = (body: unknown): ReminderChannel => {
    const v = (body as Record<string, unknown> | null)?.channel;
    return v === 'sms' ? 'sms' : 'email';
  };

  // Step 1: choose channel (SMS Reminder addendum §4).
  app.post('/admin/remind/channel', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    return sendHtml(reply, 200, adminChooseChannelPage());
  });

  // Step 2: confirmation for the chosen channel.
  app.post('/admin/remind/preview', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const channel = parseChannel(req.body);
    if (channel === 'sms') {
      const count = await countReminderPendingWithPhone();
      const smsNoPhone = await countReminderPendingNoPhone();
      return sendHtml(
        reply,
        200,
        adminConfirmSendPage({
          kind: 'remind',
          count,
          action: '/admin/remind',
          channel: 'sms',
          smsNoPhone,
          noDeliveryWindow: inNoDeliveryWindowWAT(),
        })
      );
    }
    const count = await countReminderPending();
    return sendHtml(reply, 200, adminConfirmSendPage({ kind: 'remind', count, action: '/admin/remind', channel: 'email' }));
  });

  app.post('/admin/remind', async (req, reply) => {
    const admin = await requireAdmin(req, reply);
    if (!admin) return;
    const channel = parseChannel(req.body);
    try {
      if (channel === 'sms') loadSmsConfig();
      else loadEmailConfig({ requireToken: true });
    } catch (err) {
      return sendHtml(reply, 200, adminUploadPage({ error: `Reminder send failed: ${(err as Error).message}` }));
    }
    const alreadyRunning = isReminderRunning();
    const count = alreadyRunning
      ? 0
      : channel === 'sms'
        ? await countReminderPendingWithPhone()
        : await countReminderPending();
    if (!alreadyRunning) {
      void sendReminderBatch(channel).catch((err) => app.log.error({ err }, 'reminder batch failed'));
    }
    return sendHtml(reply, 200, adminBatchStartedPage('remind', count, alreadyRunning));
  });
}
