import { prisma } from '../lib/db.js';
import { env, loadEmailConfig } from '../lib/env.js';
import { decryptDeliveryToken } from '../lib/crypto.js';
import { sendViaZeptoMail } from '../lib/zeptomail.js';
import { logEvent } from './events.js';
import {
  candidateEmailHtml,
  candidateEmailSubject,
  candidateEmailText,
} from '../lib/email.js';
import {
  reminderEmailHtml,
  reminderEmailSubject,
  reminderEmailText,
} from '../lib/reminderEmail.js';

export interface SendContext {
  tokenId: number;
  name: string;
  email: string;
  raw: string;
  titles: string[];
}

function urlsFor(raw: string) {
  return {
    selectionUrl: `${env.publicBaseUrl}/s/${raw}`,
    pixelUrl: `${env.publicBaseUrl}/e/${raw}/pixel.gif`,
  };
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name || 'there';
}

/** Tokens awaiting their INITIAL send: raw still retained and no successful `sent` yet. */
async function loadInitialPending(): Promise<SendContext[]> {
  const tokens = await prisma.token.findMany({
    where: {
      deliveryEnc: { not: null },
      events: { none: { type: 'sent' } },
    },
    include: { candidate: { include: { shortlist: { include: { position: true } } } } },
  });
  return toContexts(tokens);
}

/** Tokens eligible for a REMINDER: already sent, still unused (no selection). */
async function loadReminderPending(): Promise<SendContext[]> {
  const tokens = await prisma.token.findMany({
    where: {
      status: 'unused',
      deliveryEnc: { not: null },
      events: { some: { type: 'sent' } },
    },
    include: { candidate: { include: { shortlist: { include: { position: true } } } } },
  });
  return toContexts(tokens);
}

function toContexts(
  tokens: {
    id: number;
    deliveryEnc: string | null;
    candidate: { name: string; email: string; shortlist: { position: { title: string } }[] };
  }[]
): SendContext[] {
  const out: SendContext[] = [];
  for (const t of tokens) {
    if (!t.deliveryEnc) continue;
    const raw = decryptDeliveryToken(t.deliveryEnc);
    if (!raw) continue; // cannot rebuild the link; skip (surfaced as failure count)
    out.push({
      tokenId: t.id,
      name: t.candidate.name,
      email: t.candidate.email,
      raw,
      titles: t.candidate.shortlist.map((s) => s.position.title).sort((a, b) => a.localeCompare(b)),
    });
  }
  return out;
}

export async function countInitialPending(): Promise<number> {
  return prisma.token.count({
    where: { deliveryEnc: { not: null }, events: { none: { type: 'sent' } } },
  });
}

export async function countReminderPending(): Promise<number> {
  return prisma.token.count({
    where: { status: 'unused', deliveryEnc: { not: null }, events: { some: { type: 'sent' } } },
  });
}

export interface BatchResult {
  attempted: number;
  succeeded: number;
  failed: number;
  errors: { email: string; error: string }[];
}

// In-process guards so a second click while a batch is still running cannot
// double-send (each batch only targets tokens without a prior `sent`, but a
// token mid-flight has not been marked yet).
let initialRunning = false;
let reminderRunning = false;

export function isSendRunning(): boolean {
  return initialRunning;
}
export function isReminderRunning(): boolean {
  return reminderRunning;
}

/** Initial email batch (Admin Upload addendum §1 "Send"). */
export async function sendInitialBatch(): Promise<BatchResult> {
  if (initialRunning) return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  initialRunning = true;
  try {
    return await runInitialBatch();
  } finally {
    initialRunning = false;
  }
}

async function runInitialBatch(): Promise<BatchResult> {
  const cfg = loadEmailConfig({ requireToken: true });
  const pending = await loadInitialPending();
  const result: BatchResult = { attempted: pending.length, succeeded: 0, failed: 0, errors: [] };

  for (const ctx of pending) {
    const { selectionUrl, pixelUrl } = urlsFor(ctx.raw);
    const res = await sendViaZeptoMail(cfg, {
      toAddress: ctx.email,
      toName: ctx.name,
      subject: candidateEmailSubject(ctx.titles),
      htmlBody: candidateEmailHtml({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl, pixelUrl }),
      textBody: candidateEmailText({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl }),
    });
    if (res.ok) {
      await logEvent(ctx.tokenId, 'sent');
      // NB: deliveryEnc is intentionally retained (for reminders/resend) until the
      // candidate submits, at which point recordSelection purges it.
      result.succeeded++;
    } else {
      await logEvent(ctx.tokenId, 'send_failed', res.error);
      result.failed++;
      result.errors.push({ email: ctx.email, error: res.error });
    }
  }
  return result;
}

/** Reminder batch (Admin Upload addendum §3). */
export async function sendReminderBatch(): Promise<BatchResult> {
  if (reminderRunning) return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  reminderRunning = true;
  try {
    return await runReminderBatch();
  } finally {
    reminderRunning = false;
  }
}

async function runReminderBatch(): Promise<BatchResult> {
  const cfg = loadEmailConfig({ requireToken: true });
  const pending = await loadReminderPending();
  const result: BatchResult = { attempted: pending.length, succeeded: 0, failed: 0, errors: [] };

  for (const ctx of pending) {
    const { selectionUrl, pixelUrl } = urlsFor(ctx.raw);
    const res = await sendViaZeptoMail(cfg, {
      toAddress: ctx.email,
      toName: ctx.name,
      subject: reminderEmailSubject(),
      htmlBody: reminderEmailHtml({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl, pixelUrl }),
      textBody: reminderEmailText({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl }),
    });
    if (res.ok) {
      await prisma.token.update({
        where: { id: ctx.tokenId },
        data: { reminderCount: { increment: 1 }, lastReminderSentAt: new Date() },
      });
      result.succeeded++;
    } else {
      result.failed++;
      result.errors.push({ email: ctx.email, error: res.error });
    }
  }
  return result;
}
