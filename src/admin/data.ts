import { prisma } from '../lib/db.js';

export interface DashboardRow {
  candidateId: number;
  name: string;
  email: string;
  shortlisted: string[];
  multiShortlisted: boolean;
  selectedPosition: string | null;
  source: string | null;
  selectedAt: Date | null;
}

export interface DashboardData {
  counters: {
    totalMultiShortlisted: number;
    responded: number;
    pending: number;
    autoRecordedSingle: number;
    totalCandidates: number;
  };
  rows: DashboardRow[];
}

/**
 * Full dashboard dataset. Multi-shortlisted candidates are those with more than
 * one shortlist row (they were emailed a token). Single-shortlist candidates are
 * auto-recorded at data-prep time (FR6) and appear with source `auto_single_shortlist`.
 */
export async function getDashboardData(): Promise<DashboardData> {
  const candidates = await prisma.candidate.findMany({
    orderBy: { name: 'asc' },
    include: {
      shortlist: { include: { position: true } },
      selection: { include: { position: true } },
    },
  });

  const rows: DashboardRow[] = candidates.map((c) => {
    const shortlisted = c.shortlist
      .map((s) => s.position.title)
      .sort((a, b) => a.localeCompare(b));
    return {
      candidateId: c.id,
      name: c.name,
      email: c.email,
      shortlisted,
      multiShortlisted: shortlisted.length > 1,
      selectedPosition: c.selection?.position.title ?? null,
      source: c.selection?.source ?? null,
      selectedAt: c.selection?.selectedAt ?? null,
    };
  });

  const multi = rows.filter((r) => r.multiShortlisted);
  const responded = multi.filter((r) => r.selectedPosition !== null).length;
  const autoRecordedSingle = rows.filter((r) => r.source === 'auto_single_shortlist').length;

  return {
    counters: {
      totalMultiShortlisted: multi.length,
      responded,
      pending: multi.length - responded,
      autoRecordedSingle,
      totalCandidates: rows.length,
    },
    rows,
  };
}

function csvCell(value: string | null | undefined): string {
  const v = value ?? '';
  // Prefix cells that could be read as a formula (CSV-injection hardening).
  const guarded = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** CSV export (FR10): name, email, shortlisted, selected position, source, timestamp. */
export function toCsv(data: DashboardData): string {
  const header = [
    'Name',
    'Email',
    'Shortlisted Positions',
    'Selected Position',
    'Status',
    'Recorded Via',
    'Selected At (UTC)',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of data.rows) {
    const status = r.selectedPosition ? 'Recorded' : r.multiShortlisted ? 'Pending' : 'Recorded';
    lines.push(
      [
        csvCell(r.name),
        csvCell(r.email),
        csvCell(r.shortlisted.join('; ')),
        csvCell(r.selectedPosition),
        csvCell(status),
        csvCell(r.source),
        csvCell(r.selectedAt ? r.selectedAt.toISOString() : ''),
      ].join(',')
    );
  }
  // Prepend a UTF-8 BOM so Excel opens accented names correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}
