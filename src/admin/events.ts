import type { EventType } from '@prisma/client';
import { prisma } from '../lib/db.js';

/** Record a timeline event for a token. Best-effort — never throws to callers. */
export async function logEvent(
  tokenId: number,
  type: EventType,
  detail?: string | null,
  messageTemplate?: string | null
): Promise<void> {
  try {
    await prisma.event.create({
      data: { tokenId, type, detail: detail ?? null, messageTemplate: messageTemplate ?? null },
    });
  } catch (err) {
    // Tracking is best-effort; never let it break the candidate or send flow. But
    // surface it so schema drift (e.g. an unapplied migration) is diagnosable —
    // the authoritative send status lives on the token, not on this event.
    console.error(`[events] failed to log ${type} for token ${tokenId}:`, (err as Error).message);
  }
}

/** Record an event only if the token has none of that type yet (idempotent stages). */
export async function logEventOnce(tokenId: number, type: EventType, detail?: string): Promise<void> {
  try {
    const existing = await prisma.event.findFirst({ where: { tokenId, type }, select: { id: true } });
    if (!existing) {
      await prisma.event.create({ data: { tokenId, type, detail: detail ?? null } });
    }
  } catch {
    // best-effort
  }
}
