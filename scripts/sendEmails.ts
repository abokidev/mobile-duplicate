/**
 * Send the designed candidate email via ZeptoMail (SMTP).
 *
 *   npm run email:send -- out/tokens-<stamp>.csv            # send for real
 *   npm run email:send -- out/tokens-<stamp>.csv --dry-run  # render only, no send
 *
 * Input CSV columns: name,email,selection_url  (produced by tokens:issue).
 * The raw tokenised URL comes only from this file — this script never touches the
 * token hash in the DB.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import { env } from '../src/lib/env.js';
import {
  candidateEmailHtml,
  candidateEmailSubject,
  candidateEmailText,
} from '../src/lib/email.js';

interface Row {
  name: string;
  email: string;
  url: string;
}

/** Tiny CSV parser handling quoted fields (sufficient for our 3-column export). */
function parseCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      if (field !== '' || record.length) { record.push(field); rows.push(record); record = []; field = ''; }
    } else field += ch;
  }
  if (field !== '' || record.length) { record.push(field); rows.push(record); }

  const [header, ...body] = rows;
  if (!header) return [];
  const idx = {
    name: header.indexOf('name'),
    email: header.indexOf('email'),
    url: header.indexOf('selection_url'),
  };
  if (idx.email < 0 || idx.url < 0) {
    throw new Error('CSV must have columns: name,email,selection_url');
  }
  return body
    .filter((r) => r[idx.email])
    .map((r) => ({ name: r[idx.name] ?? '', email: r[idx.email], url: r[idx.url] }));
}

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name || 'there';
}

function latestTokensFile(): string {
  const dir = join(process.cwd(), 'out');
  const files = readdirSync(dir)
    .filter((f) => f.startsWith('tokens-') && f.endsWith('.csv'))
    .sort();
  if (!files.length) throw new Error('No out/tokens-*.csv found. Run: npm run tokens:issue');
  return join(dir, files[files.length - 1]);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const fileArg = args.find((a) => !a.startsWith('--'));
  const file = fileArg ?? latestTokensFile();

  const rows = parseCsv(readFileSync(file, 'utf8'));
  console.log(`Loaded ${rows.length} recipient(s) from ${file}${dryRun ? '  (DRY RUN)' : ''}`);

  const transport = dryRun
    ? null
    : nodemailer.createTransport({
        host: env.email.host,
        port: env.email.port,
        secure: env.email.port === 465,
        auth: { user: env.email.user, pass: env.email.pass },
      });

  if (transport) {
    await transport.verify();
    console.log('ZeptoMail SMTP connection verified.');
  }

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const firstName = firstNameOf(row.name);
    const message = {
      from: { name: env.email.fromName, address: env.email.fromAddress },
      to: { name: row.name, address: row.email },
      replyTo: env.email.replyTo,
      subject: candidateEmailSubject(),
      text: candidateEmailText({ firstName, selectionUrl: row.url }),
      html: candidateEmailHtml({ firstName, selectionUrl: row.url }),
    };
    if (dryRun || !transport) {
      console.log(`  [dry-run] would send to ${row.email}`);
      sent++;
      continue;
    }
    try {
      const info = await transport.sendMail(message);
      console.log(`  ✓ ${row.email}  (${info.messageId})`);
      sent++;
    } catch (err) {
      console.error(`  ✗ ${row.email}:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\nDone. Sent/queued: ${sent}, failed: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
