import { describe, expect, it } from 'vitest';
import { errorReportCsv, rowsFromCsv, validateRows } from '../src/admin/import.js';

const TITLES = new Set([
  'Process Technician',
  'Electrical Specialist',
  'ICSR Specialist',
  'Mechanical Specialist',
  'Instrument Specialist',
  'Maintenance Integrity Supervisor',
  'Maintenance Co-ordinator',
]);

describe('admin CSV import validation', () => {
  it('parses columns regardless of header order and trims', () => {
    const rows = rowsFromCsv('email,name,positions\nA@x.com , Ada , Process Technician; Electrical Specialist \n');
    expect(rows).toEqual([
      { rowNumber: 1, name: 'Ada', email: 'A@x.com', positions: ['Process Technician', 'Electrical Specialist'] },
    ]);
  });

  it('splits the exact reported row on ";" into two valid titles, not one invalid one', () => {
    // Regression: "Process Technician; Electrical Specialist" must resolve to two
    // valid titles (multi-shortlisted), never a single unmatched title.
    const rows = rowsFromCsv('name,email,positions\nAdaeze Okafor,adaeze@example.com,Process Technician; Electrical Specialist\n');
    expect(rows[0].positions).toEqual(['Process Technician', 'Electrical Specialist']);
    const res = validateRows(rows, TITLES, new Set());
    expect(res.bad).toHaveLength(0);
    expect(res.good).toHaveLength(1);
    expect(res.good[0].positions).toEqual(['Process Technician', 'Electrical Specialist']);
    expect(res.good[0].multi).toBe(true);
  });

  it('classifies multi vs single shortlisted and lowercases email', () => {
    const rows = rowsFromCsv(
      'name,email,positions\n' +
        'Ada,ADA@x.com,Process Technician;Electrical Specialist\n' +
        'Bem,bem@x.com,Mechanical Specialist\n'
    );
    const res = validateRows(rows, TITLES, new Set());
    expect(res.good).toHaveLength(2);
    expect(res.multiCount).toBe(1);
    expect(res.singleCount).toBe(1);
    expect(res.good[0].email).toBe('ada@x.com');
    expect(res.good[0].multi).toBe(true);
    expect(res.good[1].multi).toBe(false);
  });

  it('flags missing/malformed email, unknown title, no positions', () => {
    const rows = rowsFromCsv(
      'name,email,positions\n' +
        'NoEmail,,Process Technician\n' +
        'Bad,not-an-email,Process Technician\n' +
        'Unknown,u@x.com,Nonexistent Role\n' +
        'Empty,e@x.com,\n'
    );
    const res = validateRows(rows, TITLES, new Set());
    expect(res.good).toHaveLength(0);
    expect(res.bad).toHaveLength(4);
    expect(res.bad[0].reason).toContain('missing email');
    expect(res.bad[1].reason).toContain('malformed email');
    expect(res.bad[2].reason).toContain('unknown position title');
    expect(res.bad[3].reason).toContain('no positions');
  });

  it('flags duplicate emails within the file and against existing candidates', () => {
    const rows = rowsFromCsv(
      'name,email,positions\n' +
        'One,dup@x.com,Process Technician\n' +
        'Two,dup@x.com,Electrical Specialist\n' +
        'Three,exists@x.com,Process Technician\n'
    );
    const res = validateRows(rows, TITLES, new Set(['exists@x.com']));
    // first dup row is good, second flagged as in-file duplicate
    expect(res.good.map((g) => g.email)).toEqual(['dup@x.com']);
    const reasons = res.bad.map((b) => b.reason).join(' | ');
    expect(reasons).toContain('duplicate email (in file)');
    expect(reasons).toContain('duplicate email (already imported)');
  });

  it('collapses a repeated title within one row to a single (single-shortlist) position', () => {
    const rows = rowsFromCsv('name,email,positions\nAda,ada@x.com,Process Technician;Process Technician\n');
    const res = validateRows(rows, TITLES, new Set());
    expect(res.good).toHaveLength(1);
    expect(res.good[0].positions).toEqual(['Process Technician']);
    expect(res.good[0].multi).toBe(false);
  });

  it('produces a downloadable error report with reasons', () => {
    const rows = rowsFromCsv('name,email,positions\nBad,not-an-email,Process Technician\n');
    const res = validateRows(rows, TITLES, new Set());
    const csv = errorReportCsv(res);
    expect(csv).toContain('row,name,email,positions,reason');
    expect(csv).toContain('malformed email');
  });
});
