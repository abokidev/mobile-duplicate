import { prisma } from '../lib/db.js';
import { generateRawToken, hashToken } from '../lib/token.js';
import { encryptDeliveryToken } from '../lib/crypto.js';

/**
 * Admin CSV upload → validation → commit (Admin Upload addendum §1).
 *
 * CSV columns: name, email, positions (positions = semicolon-separated titles that
 * must exactly match the seeded position titles). Validation runs BEFORE any write;
 * nothing is committed until the admin confirms. Bad rows are reported with reasons
 * and never block the good rows.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ParsedRow {
  rowNumber: number; // 1-based data row (excludes header)
  name: string;
  email: string;
  positions: string[];
}

export interface GoodRow extends ParsedRow {
  multi: boolean;
}

export interface BadRow {
  rowNumber: number;
  name: string;
  email: string;
  positionsRaw: string;
  reason: string;
}

export interface ValidationResult {
  totalRows: number;
  good: GoodRow[];
  bad: BadRow[];
  multiCount: number;
  singleCount: number;
}

/** Minimal CSV parser handling quoted fields and embedded commas/newlines. */
export function parseCsv(text: string): { header: string[]; rows: string[][] } {
  // Strip a leading UTF-8 BOM (Excel/Windows exports add one, which would
  // otherwise corrupt the first header cell).
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { rows.push(record); record = []; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') pushField();
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || record.length) { pushField(); pushRecord(); }
    } else field += ch;
  }
  if (field !== '' || record.length) { pushField(); pushRecord(); }
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  return { header, rows };
}

/**
 * Validate the CSV against the known position titles and existing candidates.
 * Pure except for the DB reads it needs (valid titles + existing emails); pass
 * those in so the core logic is unit-testable.
 */
export function validateRows(
  parsed: ParsedRow[],
  validTitles: Set<string>,
  existingEmails: Set<string>
): ValidationResult {
  const good: GoodRow[] = [];
  const bad: BadRow[] = [];
  const seenInFile = new Set<string>();

  for (const r of parsed) {
    const email = r.email.trim().toLowerCase();
    const reasons: string[] = [];

    if (!email) reasons.push('missing email');
    else if (!EMAIL_RE.test(email)) reasons.push('malformed email');

    if (email && seenInFile.has(email)) reasons.push('duplicate email (in file)');
    if (email && existingEmails.has(email)) reasons.push('duplicate email (already imported)');

    const positions = r.positions.map((p) => p.trim()).filter(Boolean);
    if (positions.length === 0) reasons.push('no positions listed');
    const unknown = positions.filter((p) => !validTitles.has(p));
    if (unknown.length > 0) reasons.push(`unknown position title: ${unknown.join(', ')}`);

    // Distinct positions only (a row listing the same title twice counts once).
    const distinct = Array.from(new Set(positions));

    if (email) seenInFile.add(email);

    if (reasons.length > 0) {
      bad.push({
        rowNumber: r.rowNumber,
        name: r.name,
        email: r.email,
        positionsRaw: r.positions.join('; '),
        reason: reasons.join('; '),
      });
      continue;
    }

    good.push({ rowNumber: r.rowNumber, name: r.name.trim(), email, positions: distinct, multi: distinct.length > 1 });
  }

  return {
    totalRows: parsed.length,
    good,
    bad,
    multiCount: good.filter((g) => g.multi).length,
    singleCount: good.filter((g) => !g.multi).length,
  };
}

/** Turn raw CSV text into ParsedRow[] (header-driven column mapping). */
export function rowsFromCsv(text: string): ParsedRow[] {
  const { header, rows } = parseCsv(text);
  const idx = {
    name: header.indexOf('name'),
    email: header.indexOf('email'),
    positions: header.indexOf('positions'),
  };
  if (idx.email < 0 || idx.positions < 0) {
    throw new Error('CSV must have columns: name, email, positions');
  }
  return rows
    .filter((r) => r.some((c) => c.trim() !== '')) // skip blank lines
    .map((r, i) => ({
      rowNumber: i + 1,
      name: (r[idx.name] ?? '').trim(),
      email: (r[idx.email] ?? '').trim(),
      positions: (r[idx.positions] ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
    }));
}

/** Run full validation against live DB state. */
export async function validateCsv(text: string): Promise<ValidationResult> {
  const parsed = rowsFromCsv(text);
  const positions = await prisma.position.findMany({ select: { title: true } });
  const validTitles = new Set(positions.map((p) => p.title));
  const existing = await prisma.candidate.findMany({ select: { email: true } });
  const existingEmails = new Set(existing.map((c) => c.email.toLowerCase()));
  return validateRows(parsed, validTitles, existingEmails);
}

export interface CommitResult {
  candidatesCreated: number;
  tokensCreated: number;
  autoRecorded: number;
  skippedBad: number;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Commit the good rows (Admin Upload addendum §1 "On confirm"):
 *   - multi-shortlisted → Candidate + Shortlist + Token (hash stored; raw kept
 *     encrypted for the separated send/reminders, purged on submission).
 *   - single-shortlisted → Candidate + Shortlist + auto Selection (FR6), no token.
 * No emails are sent here — send is a separate, explicit action.
 *
 * Bulk-inserts in chunks so large lists (1000s of candidates) commit in a couple
 * of round-trips per chunk instead of one transaction per row — otherwise the
 * request would exceed the reverse-proxy timeout (observed as an nginx 504).
 */
export async function commitImport(text: string): Promise<CommitResult> {
  const result = await validateCsv(text);
  const positions = await prisma.position.findMany({ select: { id: true, title: true } });
  const idByTitle = new Map(positions.map((p) => [p.title, p.id]));

  let candidatesCreated = 0;
  let tokensCreated = 0;
  let autoRecorded = 0;

  // Chunk to keep each transaction short and each bulk query within DB limits.
  const CHUNK = 250;
  for (const rows of chunk(result.good, CHUNK)) {
    await prisma.$transaction(
      async (tx) => {
        // Skip any email that already exists (validation flags these, but re-check
        // guards a race between validate and commit).
        const emails = rows.map((r) => r.email);
        const existing = new Set(
          (await tx.candidate.findMany({ where: { email: { in: emails } }, select: { email: true } })).map(
            (c) => c.email
          )
        );
        const fresh = rows.filter((r) => !existing.has(r.email));
        if (fresh.length === 0) return;

        await tx.candidate.createMany({
          data: fresh.map((r) => ({ name: r.name, email: r.email })),
          skipDuplicates: true,
        });
        const created = await tx.candidate.findMany({
          where: { email: { in: fresh.map((r) => r.email) } },
          select: { id: true, email: true },
        });
        const idByEmail = new Map(created.map((c) => [c.email, c.id]));
        candidatesCreated += created.length;

        const shortlistData: { candidateId: number; positionId: number }[] = [];
        const tokenData: { candidateId: number; tokenHash: string; deliveryEnc: string }[] = [];
        const selectionData: { candidateId: number; positionId: number; source: string }[] = [];

        for (const r of fresh) {
          const candidateId = idByEmail.get(r.email);
          if (candidateId == null) continue;
          const positionIds = r.positions.map((t) => idByTitle.get(t)!).filter((v) => v != null);
          if (positionIds.length === 0) continue;
          for (const positionId of positionIds) shortlistData.push({ candidateId, positionId });
          if (r.multi) {
            const raw = generateRawToken();
            tokenData.push({ candidateId, tokenHash: hashToken(raw), deliveryEnc: encryptDeliveryToken(raw) });
            tokensCreated++;
          } else {
            selectionData.push({ candidateId, positionId: positionIds[0], source: 'auto_single_shortlist' });
            autoRecorded++;
          }
        }

        if (shortlistData.length) await tx.shortlist.createMany({ data: shortlistData });
        if (tokenData.length) await tx.token.createMany({ data: tokenData });
        if (selectionData.length) await tx.selection.createMany({ data: selectionData });
      },
      { timeout: 120_000, maxWait: 20_000 }
    );
  }

  return { candidatesCreated, tokensCreated, autoRecorded, skippedBad: result.bad.length };
}

/** Build the downloadable error-report CSV from a validation result. */
export function errorReportCsv(result: ValidationResult): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = ['row,name,email,positions,reason'];
  for (const b of result.bad) {
    lines.push([String(b.rowNumber), b.name, b.email, b.positionsRaw, b.reason].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
