import { prisma } from '../lib/db.js';

export type CandidateStage =
  | 'auto_recorded'
  | 'not_sent'
  | 'send_failed'
  | 'sent'
  | 'opened'
  | 'visited'
  | 'submitted';

export interface DashboardRow {
  candidateId: number;
  name: string;
  email: string;
  shortlisted: string[];
  multiShortlisted: boolean;
  selectedPosition: string | null;
  source: string | null;
  selectedAt: Date | null;

  // Tracking (multi-shortlisted candidates with a token).
  hasToken: boolean;
  stage: CandidateStage;
  sentAt: Date | null;
  sendFailedAt: Date | null;
  sendError: string | null;
  openedAt: Date | null;
  visitedAt: Date | null;
  submittedAt: Date | null;
  reminderCount: number;
  lastReminderSentAt: Date | null;
}

export interface DashboardData {
  counters: {
    totalCandidates: number;
    totalMultiShortlisted: number;
    responded: number;
    pending: number;
    autoRecordedSingle: number;
    notSent: number;
    sent: number;
    opened: number;
    visited: number;
    sendFailed: number;
    reminded: number;
  };
  rows: DashboardRow[];
}

function earliest(dates: (Date | null | undefined)[]): Date | null {
  const valid = dates.filter((d): d is Date => !!d);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}

export async function getDashboardData(): Promise<DashboardData> {
  const candidates = await prisma.candidate.findMany({
    orderBy: { name: 'asc' },
    include: {
      shortlist: { include: { position: true } },
      selection: { include: { position: true } },
      token: { include: { events: true } },
    },
  });

  const rows: DashboardRow[] = candidates.map((c) => {
    const shortlisted = c.shortlist.map((s) => s.position.title).sort((a, b) => a.localeCompare(b));
    const multi = shortlisted.length > 1;
    const events = c.token?.events ?? [];

    const evAt = (type: string) => earliest(events.filter((e) => e.type === type).map((e) => e.occurredAt));
    // Sent status comes from the authoritative token marker (reliable), falling
    // back to the audit event only if the column predates a candidate's send.
    const sentAt = c.token?.sentAt ?? evAt('sent');
    const openedAt = evAt('opened');
    const visitedAt = evAt('page_visited');
    const submittedAt = c.selection?.selectedAt ?? evAt('submitted');
    const failEvents = events.filter((e) => e.type === 'send_failed');
    const sendFailedAt = earliest(failEvents.map((e) => e.occurredAt));
    const sendError = failEvents.length ? failEvents[failEvents.length - 1].detail ?? 'send failed' : null;

    let stage: CandidateStage;
    if (!multi) stage = 'auto_recorded';
    else if (submittedAt) stage = 'submitted';
    else if (visitedAt) stage = 'visited';
    else if (openedAt) stage = 'opened';
    else if (sentAt) stage = 'sent';
    else if (sendFailedAt) stage = 'send_failed';
    else stage = 'not_sent';

    return {
      candidateId: c.id,
      name: c.name,
      email: c.email,
      shortlisted,
      multiShortlisted: multi,
      selectedPosition: c.selection?.position.title ?? null,
      source: c.selection?.source ?? null,
      selectedAt: c.selection?.selectedAt ?? null,
      hasToken: !!c.token,
      stage,
      sentAt,
      sendFailedAt: sentAt ? null : sendFailedAt, // a later success clears the failed state
      sendError: sentAt ? null : sendError,
      openedAt,
      visitedAt,
      submittedAt,
      reminderCount: c.token?.reminderCount ?? 0,
      lastReminderSentAt: c.token?.lastReminderSentAt ?? null,
    };
  });

  const multi = rows.filter((r) => r.multiShortlisted);
  const responded = multi.filter((r) => r.submittedAt).length;

  return {
    counters: {
      totalCandidates: rows.length,
      totalMultiShortlisted: multi.length,
      responded,
      pending: multi.length - responded,
      autoRecordedSingle: rows.filter((r) => r.stage === 'auto_recorded').length,
      notSent: multi.filter((r) => r.stage === 'not_sent').length,
      sent: multi.filter((r) => !!r.sentAt).length,
      opened: multi.filter((r) => !!r.openedAt).length,
      visited: multi.filter((r) => !!r.visitedAt).length,
      sendFailed: multi.filter((r) => r.stage === 'send_failed').length,
      reminded: multi.filter((r) => r.reminderCount > 0).length,
    },
    rows,
  };
}

function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replace(/"/g, '""')}"`;
  return guarded;
}

const iso = (d: Date | null) => (d ? d.toISOString() : '');

/**
 * "Export Pending" (SMS Reminder addendum §2): candidates with no selection yet
 * (token still unused) — the list the admin needs phone numbers for. Columns:
 * name, email, phone, shortlisted position(s).
 */
export async function pendingExportCsv(): Promise<string> {
  const candidates = await prisma.candidate.findMany({
    where: { token: { is: { status: 'unused' } } },
    include: { shortlist: { include: { position: true } } },
    orderBy: { name: 'asc' },
  });
  const header = ['Name', 'Email', 'Phone', 'Shortlisted Positions'];
  const lines = [header.map(csvCell).join(',')];
  for (const c of candidates) {
    const positions = c.shortlist.map((s) => s.position.title).sort((a, b) => a.localeCompare(b)).join('; ');
    lines.push([csvCell(c.name), csvCell(c.email), csvCell(c.phoneNumber ?? ''), csvCell(positions)].join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/** CSV export (FR10 + addendum tracking columns). */
export function toCsv(data: DashboardData): string {
  const header = [
    'Name',
    'Email',
    'Shortlisted Positions',
    'Selected Position',
    'Stage',
    'Recorded Via',
    'Sent At (UTC)',
    'Send Failed At (UTC)',
    'Opened At (UTC)',
    'Visited At (UTC)',
    'Submitted At (UTC)',
    'Reminders Sent',
    'Last Reminder At (UTC)',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of data.rows) {
    lines.push(
      [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.shortlisted.join('; ')),
        csvCell(r.selectedPosition),
        csvCell(r.stage),
        csvCell(r.source),
        csvCell(iso(r.sentAt)),
        csvCell(iso(r.sendFailedAt)),
        csvCell(iso(r.openedAt)),
        csvCell(iso(r.visitedAt)),
        csvCell(iso(r.submittedAt)),
        csvCell(String(r.reminderCount)),
        csvCell(iso(r.lastReminderSentAt)),
      ].join(',')
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
