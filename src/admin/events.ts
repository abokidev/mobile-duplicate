import type { EventType } from '@prisma/client';
import { prisma } from '../lib/db.js';

/** Record a timeline event for a token. Best-effort — never throws to callers. */
export async function logEvent(tokenId: number, type: EventType, detail?: string): Promise<void> {
  try {
    await prisma.event.create({ data: { tokenId, type, detail: detail ?? null } });
  } catch {
    // Tracking is best-effort; never let it break the candidate or send flow.
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
