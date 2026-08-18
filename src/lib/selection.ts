import { Prisma } from '@prisma/client';
import { prisma } from './db.js';
import { hashToken } from './token.js';

export interface CandidateView {
  candidateId: number;
  firstName: string;
  fullName: string;
  email: string;
  /** Only the positions this candidate was personally shortlisted for (FR2). */
  positions: { id: number; title: string }[];
  /** An existing recorded selection, if any (token already used). */
  existingSelection: { positionId: number; positionTitle: string } | null;
}

/**
 * Resolve a raw token to the candidate and their server-side-filtered shortlist.
 * Returns null for any unknown token (FR8 — caller must not distinguish cases).
 *
 * This is a read-only lookup used to render pages. The authoritative one-time-use
 * guarantee lives in `recordSelection`, not here.
 */
export async function loadCandidateByToken(rawToken: string): Promise<CandidateView | null> {
  const tokenHash = hashToken(rawToken);

  const token = await prisma.token.findUnique({
    where: { tokenHash },
    include: {
      candidate: {
        include: {
          shortlist: { include: { position: true } },
          selection: { include: { position: true } },
        },
      },
    },
  });

  if (!token) return null;

  const c = token.candidate;
  const firstName = c.name.trim().split(/\s+/)[0] || c.name;

  return {
    candidateId: c.id,
    firstName,
    fullName: c.name,
    email: c.email,
    // Positions come exclusively from the candidate's own Shortlist rows.
    positions: c.shortlist
      .map((s) => ({ id: s.position.id, title: s.position.title }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    existingSelection: c.selection
      ? { positionId: c.selection.positionId, positionTitle: c.selection.position.title }
      : null,
  };
}

export type RecordResult =
  | { ok: true; positionId: number; positionTitle: string; alreadyRecorded: boolean }
  | { ok: false; reason: 'invalid_token' | 'invalid_position' };

/**
 * The one-time-use write (FR4).
 *
 * The check-token-unused → write-selection → mark-token-used sequence runs inside
 * ONE interactive transaction, guarded by a `SELECT ... FOR UPDATE` row lock on the
 * token row. Two concurrent submissions (double-click, two tabs, retried request)
 * serialise on that lock: the first commits `used` + a Selection; the second wakes,
 * re-reads the now-`used` status, and returns the already-recorded result without
 * writing a second Selection row.
 *
 * Note (Deadline Addendum): there is deliberately NO wall-clock deadline check here
 * or anywhere else. Tokens never expire.
 */
export async function recordSelection(params: {
  rawToken: string;
  positionId: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<RecordResult> {
  const tokenHash = hashToken(params.rawToken);

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Lock the token row. FOR UPDATE performs a current read: it sees the
      //    latest committed value and blocks any concurrent locker on this row.
      const rows = await tx.$queryRaw<
        { id: number; candidate_id: number; status: string }[]
      >(Prisma.sql`
        SELECT id, candidate_id, status
        FROM tokens
        WHERE token_hash = ${tokenHash}
        FOR UPDATE
      `);

      if (rows.length === 0) {
        return { ok: false, reason: 'invalid_token' } as const;
      }
      const tokenRow = rows[0];
      const candidateId = tokenRow.candidate_id;

      // 2. If the token is already used, re-show the recorded selection instead
      //    of writing again. This is the losing side of a concurrent submit, and
      //    also the "reopen after submitting" case.
      if (tokenRow.status === 'used') {
        const existing = await tx.selection.findUnique({
          where: { candidateId },
          include: { position: true },
        });
        if (existing) {
          return {
            ok: true,
            positionId: existing.positionId,
            positionTitle: existing.position.title,
            alreadyRecorded: true,
          } as const;
        }
        // Token used but no selection row — should never happen; treat as invalid.
        return { ok: false, reason: 'invalid_token' } as const;
      }

      // 3. Validate the chosen position is genuinely on this candidate's shortlist.
      //    Defends against a tampered/forged positionId in the POST body (FR2).
      const shortlisted = await tx.shortlist.findUnique({
        where: { candidateId_positionId: { candidateId, positionId: params.positionId } },
      });
      if (!shortlisted) {
        return { ok: false, reason: 'invalid_position' } as const;
      }

      // 4. Write the Selection row (audit trail: timestamp is defaulted; IP + UA — FR7).
      const selection = await tx.selection.create({
        data: {
          candidateId,
          positionId: params.positionId,
          ipAddress: params.ipAddress ?? null,
          userAgent: params.userAgent ?? null,
          source: 'candidate',
        },
        include: { position: true },
      });

      // 5. Flip the token used, in the SAME transaction.
      await tx.token.update({
        where: { id: tokenRow.id },
        data: { status: 'used', usedAt: new Date() },
      });

      return {
        ok: true,
        positionId: selection.positionId,
        positionTitle: selection.position.title,
        alreadyRecorded: false,
      } as const;
    });
  } catch (err) {
    // A unique-constraint violation on selections.candidate_id is the belt-and-braces
    // backstop to the row lock: if two writes ever raced past the lock, the DB rejects
    // the second. Re-read and return the recorded selection rather than surfacing an error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.selection.findUnique({
        where: { candidateId: (await resolveCandidateId(tokenHash)) ?? -1 },
        include: { position: true },
      });
      if (existing) {
        return {
          ok: true,
          positionId: existing.positionId,
          positionTitle: existing.position.title,
          alreadyRecorded: true,
        };
      }
    }
    throw err;
  }
}

async function resolveCandidateId(tokenHash: string): Promise<number | null> {
  const t = await prisma.token.findUnique({ where: { tokenHash }, select: { candidateId: true } });
  return t?.candidateId ?? null;
}
