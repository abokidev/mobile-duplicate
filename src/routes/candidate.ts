import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { loadCandidateByToken, recordSelection } from '../lib/selection.js';
import {
  confirmedPage,
  confirmPage,
  genericMessagePage,
  instructionsPage,
  selectionPage,
} from '../pages/candidate.js';

interface TokenParams {
  token: string;
}

function sendHtml(reply: FastifyReply, statusCode: number, body: string) {
  reply
    .code(statusCode)
    .header('content-type', 'text/html; charset=utf-8')
    // Never let a personal, tokenised page sit in a shared/proxy cache.
    .header('cache-control', 'no-store, no-cache, must-revalidate, private')
    .header('x-content-type-options', 'nosniff')
    .send(body);
}

function generic(reply: FastifyReply) {
  // FR8: identical generic message for invalid + already-used tokens. Return 200
  // so intermediaries/scanners cannot distinguish states by status code either.
  sendHtml(reply, 200, genericMessagePage());
}

function parsePositionId(body: unknown): number | null {
  if (!body || typeof body !== 'object') return null;
  const raw = (body as Record<string, unknown>).positionId;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function candidateRoutes(app: FastifyInstance) {
  // A gentle rate limit specifically on the token-lookup surface (NFR: blunt
  // brute-force guessing of valid tokens). Applied to every /s/:token* route.
  const lookupRateLimit = {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '1 minute',
      },
    },
  };

  // 1. Instructions page.
  app.get<{ Params: TokenParams }>('/s/:token', lookupRateLimit, async (req, reply) => {
    const candidate = await loadCandidateByToken(req.params.token);
    if (!candidate) return generic(reply);
    // Already used → generic message (FR8). Unused → instructions.
    if (candidate.existingSelection) return generic(reply);
    return sendHtml(reply, 200, instructionsPage(candidate, req.params.token));
  });

  // 2. Selection page. GET + POST both re-show it (reopen-resilient — NFR).
  const showSelection = async (req: FastifyRequest<{ Params: TokenParams }>, reply: FastifyReply) => {
    const candidate = await loadCandidateByToken(req.params.token);
    if (!candidate) return generic(reply);
    if (candidate.existingSelection) return generic(reply);
    return sendHtml(reply, 200, selectionPage(candidate, req.params.token));
  };
  app.get<{ Params: TokenParams }>('/s/:token/select', lookupRateLimit, showSelection);
  app.post<{ Params: TokenParams }>('/s/:token/select', lookupRateLimit, showSelection);

  // 3. Irreversibility check page.
  app.post<{ Params: TokenParams }>('/s/:token/confirm', lookupRateLimit, async (req, reply) => {
    const candidate = await loadCandidateByToken(req.params.token);
    if (!candidate) return generic(reply);
    if (candidate.existingSelection) return generic(reply);

    const positionId = parsePositionId(req.body);
    const chosen = positionId ? candidate.positions.find((p) => p.id === positionId) : undefined;
    if (!chosen) {
      // No / invalid selection: re-render the selection page with a prompt.
      return sendHtml(reply, 200, selectionPage(candidate, req.params.token, { error: true }));
    }
    return sendHtml(reply, 200, confirmPage(candidate, req.params.token, chosen));
  });

  // 4. Final write — the one-time-use transaction.
  app.post<{ Params: TokenParams }>('/s/:token/submit', lookupRateLimit, async (req, reply) => {
    const candidate = await loadCandidateByToken(req.params.token);
    if (!candidate) return generic(reply);

    const positionId = parsePositionId(req.body);
    if (!positionId) {
      if (candidate.existingSelection) return generic(reply);
      return sendHtml(reply, 200, selectionPage(candidate, req.params.token, { error: true }));
    }

    const result = await recordSelection({
      rawToken: req.params.token,
      positionId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    });

    if (!result.ok) {
      if (result.reason === 'invalid_token') return generic(reply);
      // invalid_position: chosen position wasn't on the shortlist. Re-render.
      const fresh = await loadCandidateByToken(req.params.token);
      if (!fresh || fresh.existingSelection) return generic(reply);
      return sendHtml(reply, 200, selectionPage(fresh, req.params.token, { error: true }));
    }

    return sendHtml(
      reply,
      200,
      confirmedPage(candidate, { title: result.positionTitle }, { alreadyRecorded: result.alreadyRecorded })
    );
  });
}
