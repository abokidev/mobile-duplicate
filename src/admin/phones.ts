import { prisma } from '../lib/db.js';
import { normalizePhone } from '../lib/termii.js';
import { parseCsv } from './import.js';

/**
 * Phone-number re-upload (SMS Reminder addendum §3). This is an UPDATE keyed by
 * email, not a new import: it attaches phone numbers to existing candidates and
 * ignores every other column. Rows whose email matches no candidate are reported
 * as errors — never used to create a candidate. No shortlist/position validation.
 */

export interface PhoneRow {
  rowNumber: number;
  email: string;
  phoneRaw: string;
}

export interface PhoneMatch {
  email: string;
  candidateId: number;
  phone: string; // normalised
}

export interface PhoneBadRow {
  rowNumber: number;
  email: string;
  phoneRaw: string;
  reason: string;
}

export interface PhoneValidation {
  totalRows: number;
  matched: PhoneMatch[];
  bad: PhoneBadRow[];
}

/** Parse rows from a phone-update CSV. Requires `email` and a phone column. */
export function phoneRowsFromCsv(text: string): PhoneRow[] {
  const { header, rows } = parseCsv(text);
  const emailIdx = header.indexOf('email');
  const phoneIdx = header.indexOf('phone') >= 0 ? header.indexOf('phone') : header.indexOf('phone_number');
  if (emailIdx < 0 || phoneIdx < 0) {
    throw new Error('CSV must have columns: email and phone (other columns are ignored)');
  }
  return rows
    .filter((r) => r.some((c) => c.trim() !== ''))
    .map((r, i) => ({
      rowNumber: i + 1,
      email: (r[emailIdx] ?? '').trim(),
      phoneRaw: (r[phoneIdx] ?? '').trim(),
    }));
}

export async function validatePhoneCsv(text: string): Promise<PhoneValidation> {
  const parsed = phoneRowsFromCsv(text);
  const emails = parsed.map((r) => r.email.toLowerCase()).filter(Boolean);
  const existing = await prisma.candidate.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map(existing.map((c) => [c.email.toLowerCase(), c.id]));

  const matched: PhoneMatch[] = [];
  const bad: PhoneBadRow[] = [];
  const seen = new Set<string>();

  for (const r of parsed) {
    const email = r.email.toLowerCase();
    const reasons: string[] = [];
    if (!email) reasons.push('missing email');
    const phone = normalizePhone(r.phoneRaw);
    if (!r.phoneRaw) reasons.push('missing phone number');
    else if (!phone) reasons.push('invalid phone number');
    const candidateId = email ? idByEmail.get(email) : undefined;
    if (email && candidateId == null) reasons.push('no matching candidate for this email');
    if (email && seen.has(email)) reasons.push('duplicate email (in file)');
    if (email) seen.add(email);

    if (reasons.length > 0 || candidateId == null || !phone) {
      bad.push({ rowNumber: r.rowNumber, email: r.email, phoneRaw: r.phoneRaw, reason: reasons.join('; ') || 'skipped' });
      continue;
    }
    matched.push({ email, candidateId, phone });
  }

  return { totalRows: parsed.length, matched, bad };
}

export interface PhoneCommitResult {
  updated: number;
  unmatched: number;
}

export async function commitPhoneUpdate(text: string): Promise<PhoneCommitResult> {
  const result = await validatePhoneCsv(text);
  let updated = 0;
  const CHUNK = 250;
  for (let i = 0; i < result.matched.length; i += CHUNK) {
    const chunk = result.matched.slice(i, i + CHUNK);
    await prisma.$transaction(
      chunk.map((m) =>
        prisma.candidate.update({ where: { id: m.candidateId }, data: { phoneNumber: m.phone } })
      )
    );
    updated += chunk.length;
  }
  return { updated, unmatched: result.bad.length };
}

export function phoneErrorReportCsv(result: PhoneValidation): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['row,email,phone,reason'];
  for (const b of result.bad) {
    lines.push([String(b.rowNumber), b.email, b.phoneRaw, b.reason].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
