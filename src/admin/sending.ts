import { prisma } from '../lib/db.js';
import { env, loadEmailConfig, loadSmsConfig } from '../lib/env.js';
import { decryptDeliveryToken } from '../lib/crypto.js';
import { sendViaZeptoMail } from '../lib/zeptomail.js';
import { sendViaTermii } from '../lib/termii.js';
import { smsReminderText } from '../lib/smsReminder.js';
import { logEvent } from './events.js';
import {
  candidateEmailHtml,
  candidateEmailSubject,
  candidateEmailText,
  type MessageTemplate,
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
  phone: string | null;
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

// "Already sent" = the reliable sent_at marker is set, OR (backward-compatible)
// a `sent` event was recorded by an earlier version. Honouring the old event means
// candidates already marked sent are never re-emailed after this upgrade — no
// backfill required, nothing changes for them.
const ALREADY_SENT = { OR: [{ sentAt: { not: null } }, { events: { some: { type: 'sent' as const } } }] };
const NOT_YET_SENT = { sentAt: null, events: { none: { type: 'sent' as const } } };

/** Tokens awaiting their INITIAL send: raw still retained and not sent by either signal. */
async function loadInitialPending(): Promise<SendContext[]> {
  const tokens = await prisma.token.findMany({
    where: {
      deliveryEnc: { not: null },
      ...NOT_YET_SENT,
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
      ...ALREADY_SENT,
    },
    include: { candidate: { include: { shortlist: { include: { position: true } } } } },
  });
  return toContexts(tokens);
}

function toContexts(
  tokens: {
    id: number;
    deliveryEnc: string | null;
    candidate: { name: string; email: string; phoneNumber: string | null; shortlist: { position: { title: string } }[] };
  }[]
): SendContext[] {
  const out: SendContext[] = [];
  for (const t of tokens) {
    if (!t.deliveryEnc) continue;
    const raw = decryptDeliveryToken(t.deliveryEnc);
    if (!raw) continue; // cannot rebuild the link; skip (surfaced as failure count)
    const phone = t.candidate.phoneNumber && t.candidate.phoneNumber.trim() !== '' ? t.candidate.phoneNumber : null;
    out.push({
      tokenId: t.id,
      name: t.candidate.name,
      email: t.candidate.email,
      phone,
      raw,
      titles: t.candidate.shortlist.map((s) => s.position.title).sort((a, b) => a.localeCompare(b)),
    });
  }
  return out;
}

export async function countInitialPending(): Promise<number> {
  return prisma.token.count({
    where: { deliveryEnc: { not: null }, ...NOT_YET_SENT },
  });
}

export async function countReminderPending(): Promise<number> {
  return prisma.token.count({
    where: { status: 'unused', deliveryEnc: { not: null }, ...ALREADY_SENT },
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

/** Initial email batch (Admin Upload addendum §1 "Send"). Uses the chosen template. */
export async function sendInitialBatch(template: MessageTemplate = 'message_1'): Promise<BatchResult> {
  if (initialRunning) return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  initialRunning = true;
  try {
    return await runInitialBatch(template);
  } finally {
    initialRunning = false;
  }
}

async function runInitialBatch(template: MessageTemplate): Promise<BatchResult> {
  const cfg = loadEmailConfig({ requireToken: true });
  const pending = await loadInitialPending();
  const result: BatchResult = { attempted: pending.length, succeeded: 0, failed: 0, errors: [] };

  for (const ctx of pending) {
    const { selectionUrl, pixelUrl } = urlsFor(ctx.raw);
    const res = await sendViaZeptoMail(cfg, {
      toAddress: ctx.email,
      toName: ctx.name,
      subject: candidateEmailSubject(ctx.titles),
      htmlBody: candidateEmailHtml({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl, pixelUrl, template }),
      textBody: candidateEmailText({ firstName: firstNameOf(ctx.name), positionTitles: ctx.titles, selectionUrl, template }),
    });
    if (res.ok) {
      // Authoritative, reliable marker (NOT the best-effort event) — this is what
      // the dashboard and the "who still needs sending" query read, so a tracking
      // failure can never re-send a delivered email or mislabel it "Not sent".
      // NB: deliveryEnc is intentionally retained (for reminders/resend) until the
      // candidate submits, at which point recordSelection purges it.
      try {
        await prisma.token.update({
          where: { id: ctx.tokenId },
          data: { sentAt: new Date(), sentTemplate: template },
        });
        result.succeeded++;
      } catch (err) {
        result.failed++;
        result.errors.push({ email: ctx.email, error: `sent but not recorded: ${(err as Error).message}` });
      }
      // Best-effort audit timeline entry (never blocks the send).
      await logEvent(ctx.tokenId, 'sent', null, template);
    } else {
      await logEvent(ctx.tokenId, 'send_failed', res.error);
      result.failed++;
      result.errors.push({ email: ctx.email, error: res.error });
    }
  }
  return result;
}

export type ReminderChannel = 'email' | 'sms';

/** Pending reminders that have a phone number on file (SMS-eligible). */
export async function countReminderPendingWithPhone(): Promise<number> {
  return prisma.token.count({
    where: {
      status: 'unused',
      deliveryEnc: { not: null },
      ...ALREADY_SENT,
      candidate: { phoneNumber: { not: null } },
    },
  });
}

/** Pending reminders with NO phone number (excluded from an SMS send). */
export async function countReminderPendingNoPhone(): Promise<number> {
  return prisma.token.count({
    where: {
      status: 'unused',
      deliveryEnc: { not: null },
      ...ALREADY_SENT,
      candidate: { phoneNumber: null },
    },
  });
}

/** Reminder batch — Email (existing) or SMS (SMS Reminder addendum §4). */
export async function sendReminderBatch(channel: ReminderChannel = 'email'): Promise<BatchResult> {
  if (reminderRunning) return { attempted: 0, succeeded: 0, failed: 0, errors: [] };
  reminderRunning = true;
  try {
    return channel === 'sms' ? await runSmsReminderBatch() : await runReminderBatch();
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

async function runSmsReminderBatch(): Promise<BatchResult> {
  const cfg = loadSmsConfig();
  // Only candidates who are pending AND have a phone number.
  const pending = (await loadReminderPending()).filter((c) => c.phone);
  const result: BatchResult = { attempted: pending.length, succeeded: 0, failed: 0, errors: [] };

  for (const ctx of pending) {
    const { selectionUrl } = urlsFor(ctx.raw);
    const res = await sendViaTermii(cfg, { to: ctx.phone!, message: smsReminderText(selectionUrl) });
    if (res.ok) {
      await prisma.token.update({
        where: { id: ctx.tokenId },
        data: { reminderCount: { increment: 1 }, lastReminderSentAt: new Date() },
      });
      await logEvent(ctx.tokenId, 'sms_sent');
      result.succeeded++;
    } else {
      await logEvent(ctx.tokenId, 'sms_failed', res.error);
      result.failed++;
      result.errors.push({ email: ctx.email, error: res.error });
    }
    // Gentle rate limit for the per-recipient loop (bulk endpoint can't carry
    // per-candidate links). ~10/sec.
    await new Promise((r) => setTimeout(r, 100));
  }
  return result;
}
