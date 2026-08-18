/**
 * Send the designed candidate email via the ZeptoMail HTTP API.
 * (Email Integration Addendum — HTTP API at api.zeptomail.com, NOT SMTP.)
 *
 *   npm run email:send -- out/tokens-<stamp>.csv            # send for real
 *   npm run email:send -- out/tokens-<stamp>.csv --dry-run  # render + validate, no send
 *
 * Input CSV columns: name,email,selection_url  (produced by tokens:issue).
 * The raw tokenised URL comes only from this file — this script never touches the
 * token hash in the DB.
 *
 * Config comes from required env vars (no hardcoded fallback): ZEPTOMAIL_API_HOST,
 * ZEPTOMAIL_AGENT_ALIAS, ZEPTOMAIL_SEND_TOKEN, SENDER_EMAIL, SENDER_NAME. The send
 * token is the full Authorization header value (already includes the
 * `Zoho-enczapikey` prefix) and must never be logged or committed.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadEmailConfig } from '../src/lib/env.js';
import {
  candidateEmailHtml,
  candidateEmailSubject,
  candidateEmailText,
} from '../src/lib/email.js';

interface Row {
  name: string;
  email: string;
  url: string;
  positions: string[];
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
    positions: header.indexOf('positions'),
  };
  if (idx.email < 0 || idx.url < 0) {
    throw new Error('CSV must have columns: name,email,selection_url[,positions]');
  }
  return body
    .filter((r) => r[idx.email])
    .map((r) => ({
      name: r[idx.name] ?? '',
      email: r[idx.email],
      url: r[idx.url],
      positions:
        idx.positions >= 0 && r[idx.positions]
          ? r[idx.positions].split(';').map((s) => s.trim()).filter(Boolean)
          : [],
    }));
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

  // Fail loudly if config is missing. Dry-run does not need the secret send token.
  const cfg = loadEmailConfig({ requireToken: !dryRun });
  const endpoint = `https://${cfg.apiHost}/v1.1/email`;

  const rows = parseCsv(readFileSync(file, 'utf8'));
  console.log(`Loaded ${rows.length} recipient(s) from ${file}${dryRun ? '  (DRY RUN)' : ''}`);
  console.log(`ZeptoMail HTTP API: ${endpoint}`);
  console.log(`Mail agent alias:   ${cfg.agentAlias}`);
  console.log(`From:               ${cfg.senderName} <${cfg.senderEmail}>`);

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    if (row.positions.length === 0) {
      console.error(`  ✗ ${row.email}: no positions in CSV — re-run tokens:issue. Skipping.`);
      failed++;
      continue;
    }
    const payload = {
      from: { address: cfg.senderEmail, name: cfg.senderName },
      to: [{ email_address: { address: row.email, name: row.name } }],
      ...(cfg.replyTo ? { reply_to: [{ address: cfg.replyTo }] } : {}),
      subject: candidateEmailSubject(row.positions),
      htmlbody: candidateEmailHtml({ positionTitles: row.positions, selectionUrl: row.url }),
      textbody: candidateEmailText({ positionTitles: row.positions, selectionUrl: row.url }),
    };

    if (dryRun) {
      // Show the well-formed request without the secret or the (large) bodies.
      const preview = {
        method: 'POST',
        endpoint,
        headers: { Authorization: '«Zoho-enczapikey …redacted…»', 'Content-Type': 'application/json' },
        body: { ...payload, htmlbody: `«html ${payload.htmlbody.length} chars»`, textbody: `«text ${payload.textbody.length} chars»` },
      };
      console.log(`  [dry-run] ${row.email}:`, JSON.stringify(preview.body));
      sent++;
      continue;
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          // The send token is already the full header value incl. the scheme prefix.
          Authorization: cfg.sendToken,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        console.log(`  ✓ ${row.email}  (${res.status})`);
        sent++;
      } else {
        const text = await res.text().catch(() => '');
        console.error(`  ✗ ${row.email}: HTTP ${res.status} ${text.slice(0, 300)}`);
        failed++;
      }
    } catch (err) {
      console.error(`  ✗ ${row.email}:`, (err as Error).message);
      failed++;
    }
  }

  console.log(`\nDone. Sent/queued: ${sent}, failed: ${failed}.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
