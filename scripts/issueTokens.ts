/**
 * Data-prep step: issue tokens and auto-record single-shortlist candidates.
 *
 *   npm run tokens:issue
 *
 * For every candidate:
 *   - MULTI-shortlisted (>1 position): ensure a Token exists. Generate a fresh
 *     cryptographically random RAW token, store ONLY its HMAC-SHA256 hash (FR1),
 *     and write the raw tokenised URL to out/tokens-<timestamp>.csv for the email
 *     send. The raw token is never persisted to the DB and never logged.
 *   - SINGLE-shortlisted (exactly 1 position): NEVER emailed. Auto-insert a
 *     Selection row with that one position (source = auto_single_shortlist) so the
 *     admin export is complete without manual patching (FR6).
 *
 * Idempotent: candidates that already have a token (or an auto-recorded selection)
 * are skipped, so re-running does not re-issue or duplicate. The output CSV only
 * contains rows for tokens created on THIS run (raw tokens for already-issued
 * candidates cannot be recovered — that is the point of hashing at rest).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '../src/lib/db.js';
import { env } from '../src/lib/env.js';
import { generateRawToken, hashToken } from '../src/lib/token.js';

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const candidates = await prisma.candidate.findMany({
    include: { shortlist: true, token: true, selection: true },
    orderBy: { id: 'asc' },
  });

  const issued: { name: string; email: string; url: string }[] = [];
  let autoRecorded = 0;
  let alreadyTokened = 0;
  let alreadyAuto = 0;

  for (const c of candidates) {
    const positionIds = c.shortlist.map((s) => s.positionId);

    if (positionIds.length === 0) {
      console.warn(`! ${c.email} has no shortlist rows — skipping.`);
      continue;
    }

    if (positionIds.length === 1) {
      // Single-shortlist → auto-record (FR6). Never emailed, never tokenised.
      if (c.selection) {
        alreadyAuto++;
        continue;
      }
      await prisma.selection.create({
        data: {
          candidateId: c.id,
          positionId: positionIds[0],
          source: 'auto_single_shortlist',
          ipAddress: null,
          userAgent: null,
        },
      });
      autoRecorded++;
      continue;
    }

    // Multi-shortlist → ensure a token exists.
    if (c.token) {
      alreadyTokened++;
      continue;
    }
    const rawToken = generateRawToken();
    await prisma.token.create({
      data: { candidateId: c.id, tokenHash: hashToken(rawToken) },
    });
    const url = `${env.publicBaseUrl}/s/${rawToken}`;
    issued.push({ name: c.name, email: c.email, url });
  }

  // Write the raw-token URLs for THIS run (gitignored — contains raw tokens).
  if (issued.length > 0) {
    const outDir = join(process.cwd(), 'out');
    mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(outDir, `tokens-${stamp}.csv`);
    const lines = [
      'name,email,selection_url',
      ...issued.map((r) => [r.name, r.email, r.url].map(csvEscape).join(',')),
    ];
    writeFileSync(file, lines.join('\n') + '\n', 'utf8');
    console.log(`\nWrote ${issued.length} raw tokenised URL(s) to ${file}`);
    console.log('  → hand this file to the email send step; do NOT commit it.');
  }

  console.log('\nData-prep summary:');
  console.log(`  tokens issued this run:        ${issued.length}`);
  console.log(`  already had a token:           ${alreadyTokened}`);
  console.log(`  single-shortlist auto-recorded:${autoRecorded}`);
  console.log(`  single-shortlist already auto: ${alreadyAuto}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
