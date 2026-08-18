import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../lib/db.js';
import {
  clearSessionCookie,
  createSession,
  destroySession,
  getAdminFromRequest,
  setSessionCookie,
  verifyPassword,
} from '../admin/auth.js';
import { getDashboardData, toCsv } from '../admin/data.js';
import { adminDashboardPage, adminLoginPage } from '../admin/pages.js';

function sendHtml(reply: FastifyReply, statusCode: number, body: string) {
  reply
    .code(statusCode)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store, private')
    .send(body);
}

export async function adminRoutes(app: FastifyInstance) {
  // Tighter rate limit on the login POST to slow credential stuffing.
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
    // Always run a verify to keep timing roughly constant whether or not the user exists.
    const ok = admin
      ? await verifyPassword(password, admin.passwordHash)
      : await verifyPassword(password, 'scrypt$00$00');

    if (!admin || !ok) {
      return sendHtml(reply, 401, adminLoginPage({ error: true }));
    }

    const sessionId = await createSession(admin.id);
    setSessionCookie(reply, sessionId);
    return reply.redirect('/admin');
  });

  app.post('/admin/logout', async (req, reply) => {
    await destroySession(req);
    clearSessionCookie(reply);
    return reply.redirect('/admin/login');
  });

  app.get('/admin', async (req, reply) => {
    const admin = await getAdminFromRequest(req);
    if (!admin) return reply.redirect('/admin/login');
    const data = await getDashboardData();
    return sendHtml(reply, 200, adminDashboardPage(data, admin));
  });

  app.get('/admin/export.csv', async (req, reply) => {
    const admin = await getAdminFromRequest(req);
    if (!admin) return reply.redirect('/admin/login');
    const data = await getDashboardData();
    const csv = toCsv(data);
    reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="position-preferences.csv"')
      .header('cache-control', 'no-store, private')
      .send(csv);
  });
}
