import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { env } from './lib/env.js';
import { prisma } from './lib/db.js';
import { candidateRoutes } from './routes/candidate.js';
import { adminRoutes } from './routes/admin.js';
import { genericMessagePage } from './pages/candidate.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function buildServer() {
  const app = Fastify({
    // Trust proxy so req.ip reflects the real client behind a load balancer (FR7),
    // and so secure cookies work behind HTTPS termination.
    trustProxy: env.trustProxy,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // Never log raw tokens or query strings that could contain them.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization'],
        remove: true,
      },
      serializers: {
        req(req) {
          // Log only the route path template, not the concrete URL (keeps raw
          // tokens out of logs — NFR: raw token never logged).
          return { method: req.method, url: (req as any).routeOptions?.url ?? '[redacted]' };
        },
      },
    },
  });

  await app.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
    // On throttle, render the same generic page rather than a raw JSON error
    // (consistent, non-leaky, and pleasant for a candidate who refreshes).
    // The builder is typed to return an object, but Fastify's send() handles the
    // HTML string fine; the onSend hook stamps the text/html content-type.
    errorResponseBuilder: (() => genericMessagePage()) as unknown as () => object,
  });

  await app.register(cookie, { secret: env.cookieSecret });
  await app.register(formbody);

  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'public'),
    prefix: '/assets/',
    cacheControl: true,
    maxAge: '1h',
  });

  // Baseline security headers on every response.
  app.addHook('onSend', async (_req, reply, payload) => {
    // Rate-limit rejections carry an HTML body (see errorResponseBuilder) — make
    // sure it is served as HTML, not text/plain.
    if (reply.statusCode === 429) {
      reply.header('content-type', 'text/html; charset=utf-8');
    }
    reply.header('x-frame-options', 'DENY');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header(
      'content-security-policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    );
    return payload;
  });

  await app.register(candidateRoutes);
  await app.register(adminRoutes);

  app.get('/healthz', async () => ({ ok: true }));

  app.get('/', async (_req, reply) => {
    // No index; the platform is reached only via a personal tokenised link.
    reply.code(404).header('content-type', 'text/html; charset=utf-8').send(genericMessagePage());
  });

  app.setNotFoundHandler((_req, reply) => {
    reply
      .code(404)
      .header('content-type', 'text/html; charset=utf-8')
      .header('cache-control', 'no-store')
      .send(genericMessagePage());
  });

  app.setErrorHandler((err: { statusCode?: number }, req, reply) => {
    req.log.error({ err }, 'request error');
    reply
      .code(err.statusCode && err.statusCode < 500 ? err.statusCode : 500)
      .header('content-type', 'text/html; charset=utf-8')
      .send(genericMessagePage());
  });

  return app;
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  buildServer()
    .then(async (app) => {
      await app.listen({ port: env.port, host: env.host });
      app.log.info(`Candidate flow: ${env.publicBaseUrl}/s/<token>`);
      app.log.info(`Admin:          ${env.publicBaseUrl}/admin`);
    })
    .catch(async (err) => {
      console.error(err);
      await prisma.$disconnect();
      process.exit(1);
    });

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  }
}
