import { esc, html, layout, raw } from '../lib/html.js';
import type { CandidateStage, DashboardData, DashboardRow } from './data.js';
import type { ValidationResult } from './import.js';
import type { BatchResult } from './sending.js';

export function adminLoginPage(opts: { error?: boolean } = {}): string {
  const errorBanner = opts.error
    ? html`<div class="callout" role="alert" style="border-left-color:var(--red)">
        <div><p class="value">Incorrect email or password.</p></div>
      </div>`
    : '';
  const body = html`
    <div class="card" style="max-width:26rem;margin:0 auto">
      <p class="eyebrow">Admin Access</p>
      <h1>Sign in</h1>
      <p class="lede muted">Dragnet / ExxonMobil administrators only.</p>
      ${raw(errorBanner)}
      <form method="POST" action="/admin/login" autocomplete="on">
        <label style="display:block;margin-bottom:14px">
          <span class="muted" style="font-size:13px;display:block;margin-bottom:6px">Email</span>
          <input name="email" type="email" required autocomplete="username"
                 style="width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:9px;font-size:16px;font-family:var(--font-body)" />
        </label>
        <label style="display:block;margin-bottom:20px">
          <span class="muted" style="font-size:13px;display:block;margin-bottom:6px">Password</span>
          <input name="password" type="password" required autocomplete="current-password"
                 style="width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:9px;font-size:16px;font-family:var(--font-body)" />
        </label>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </div>
  `;
  return layout({ title: 'Admin sign in · Position Preference', bodyHtml: body });
}

const DASH_STYLE = `
  <style>
    .wrap { max-width: 76rem; }
    .toolbar { display:flex; justify-content:space-between; align-items:flex-end; gap:16px; flex-wrap:wrap; margin-bottom:6px; }
    .toolbar .btns { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
    .btn.small { width:auto; min-height:0; padding:11px 16px; font-size:14px; border-radius:9px; }
    .stats { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; margin:18px 0; }
    .stat { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px; box-shadow:var(--shadow-sm); }
    .stat-accent { border-color:#f3cfcf; background:var(--selected-tint); }
    .stat-warn { border-color:#f0d9a8; background:#fdf7ea; }
    .stat-value { font-family:var(--font-head); font-size:26px; font-weight:700; color:var(--black); line-height:1; }
    .stat-accent .stat-value { color:var(--red-deep); }
    .stat-label { color:var(--muted); font-size:11.5px; margin-top:7px; letter-spacing:0.02em; }
    .actionbar { display:flex; gap:12px; flex-wrap:wrap; margin:6px 0 20px; }
    .actioncard { flex:1 1 240px; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
    .actioncard h3 { margin:0 0 4px; font-size:15px; }
    .actioncard p { margin:0 0 12px; font-size:13px; color:var(--muted); }
    .table-scroll { overflow-x:auto; background:var(--surface); border:1px solid var(--line); border-radius:12px; box-shadow:var(--shadow-sm); }
    .dash-table { width:100%; border-collapse:collapse; font-size:13.5px; min-width:920px; }
    .dash-table th { text-align:left; padding:12px 14px; background:#faf8f5; color:var(--muted); font-family:var(--font-head); font-size:10.5px; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid var(--line); white-space:nowrap; }
    .dash-table td { padding:12px 14px; border-bottom:1px solid var(--line); vertical-align:top; white-space:nowrap; }
    .dash-table tr:last-child td { border-bottom:0; }
    .cand-name { font-weight:600; color:var(--black); }
    .cand-email { color:var(--muted); font-size:12px; }
    .col-short { white-space:normal; min-width:190px; color:var(--charcoal); }
    .ts { color:var(--charcoal); font-variant-numeric:tabular-nums; }
    .ts.none { color:#c9c4bc; }
    .badge { display:inline-block; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; font-family:var(--font-head); letter-spacing:0.03em; white-space:nowrap; }
    .b-submitted { background:var(--selected-tint); color:var(--red-deep); border:1px solid #f3cfcf; }
    .b-visited { background:#eaf2ec; color:#2f6b46; border:1px solid #cfe3d5; }
    .b-opened { background:#eef1f6; color:#3a557e; border:1px solid #d3dced; }
    .b-sent { background:#f2efea; color:#6f6a63; border:1px solid #e3ddd3; }
    .b-not_sent { background:#f0ede8; color:#928d85; }
    .b-send_failed { background:#fdeaea; color:#c11110; border:1px solid #f3cccc; }
    .b-auto_recorded { background:#eef3ee; color:#2f6b46; border:1px solid #cfe3d5; }
    .hint { color:var(--muted-soft); font-size:11px; font-weight:400; text-transform:none; letter-spacing:0; }
    @media (max-width: 60rem) { .stats { grid-template-columns:repeat(3,1fr); } }
  </style>
`;

function fmt(d: Date | null): string {
  if (!d) return '<span class="ts none">—</span>';
  return `<span class="ts">${d.toISOString().replace('T', ' ').slice(5, 16)}</span>`;
}

const STAGE_LABEL: Record<CandidateStage, string> = {
  auto_recorded: 'Auto-recorded',
  not_sent: 'Not sent',
  send_failed: 'Send failed',
  sent: 'Sent',
  opened: 'Opened',
  visited: 'Visited',
  submitted: 'Submitted',
};

function stageBadge(r: DashboardRow): string {
  return `<span class="badge b-${r.stage}">${STAGE_LABEL[r.stage]}</span>`;
}

function statCard(label: string, value: number, cls = ''): string {
  return html`<div class="stat ${cls}"><div class="stat-value">${value}</div><div class="stat-label">${raw(label)}</div></div>`;
}

export function adminDashboardPage(
  data: DashboardData,
  admin: { email: string },
  flash?: string
): string {
  const c = data.counters;
  const pct = c.totalMultiShortlisted > 0 ? Math.round((c.responded / c.totalMultiShortlisted) * 100) : 0;

  const rowsHtml = data.rows
    .map(
      (r) => html`
        <tr>
          <td>
            <div class="cand-name">${r.name}</div>
            <div class="cand-email">${r.email}</div>
          </td>
          <td class="col-short">${r.shortlisted.join(', ')}</td>
          <td>${raw(stageBadge(r))}${r.reminderCount > 0 ? raw(`<div class="hint">reminded ${r.reminderCount}×</div>`) : raw('')}</td>
          <td>${raw(fmt(r.sentAt))}${r.sendFailedAt && !r.sentAt ? raw(`<div class="hint" style="color:var(--red)">failed</div>`) : raw('')}</td>
          <td>${raw(fmt(r.openedAt))}</td>
          <td>${raw(fmt(r.visitedAt))}</td>
          <td>${r.selectedPosition ? raw(`<strong>${esc(r.selectedPosition)}</strong><div class="hint">${fmt(r.submittedAt)}</div>`) : raw(fmt(r.submittedAt))}</td>
        </tr>
      `
    )
    .join('');

  const flashHtml = flash
    ? html`<div class="callout" role="status" style="border-left-color:#2f6b46;background:#f2f8f3"><div><p class="value">${flash}</p></div></div>`
    : '';

  const body = html`
    <div style="width:100%">
      <div class="toolbar">
        <div>
          <p class="eyebrow" style="margin-bottom:8px">Admin Dashboard</p>
          <h1 style="margin:0">Position Preference — live status</h1>
        </div>
        <div class="btns">
          <a class="btn btn-ghost small" href="/admin/upload">Upload candidates</a>
          <a class="btn btn-ghost small" href="/admin/export.csv">Export CSV</a>
          <form method="POST" action="/admin/logout" style="margin:0"><button class="btn btn-ghost small">Sign out</button></form>
        </div>
      </div>
      <p class="muted" style="margin-bottom:16px">Signed in as ${admin.email}. Counts update on each page load.</p>

      ${raw(flashHtml)}

      <div class="actionbar">
        <div class="actioncard">
          <h3>Send invitations</h3>
          <p>${c.notSent + c.sendFailed} candidate(s) awaiting their first email${c.sendFailed > 0 ? raw(` · <span style="color:var(--red-deep)">${c.sendFailed} failed</span>`) : raw('')}.</p>
          <form method="POST" action="/admin/send/preview" style="margin:0"><button class="btn btn-primary small">Send invitations…</button></form>
        </div>
        <div class="actioncard">
          <h3>Send reminders</h3>
          <p>${c.pending - c.notSent - c.sendFailed} emailed candidate(s) still pending.</p>
          <form method="POST" action="/admin/remind/preview" style="margin:0"><button class="btn btn-ghost small">Send reminders…</button></form>
        </div>
      </div>

      <div class="stats">
        ${raw(statCard('Multi-shortlisted', c.totalMultiShortlisted))}
        ${raw(statCard('Responded', c.responded, 'stat-accent'))}
        ${raw(statCard('Pending', c.pending))}
        ${raw(statCard('Visited (reliable)', c.visited))}
        ${raw(statCard('Opened <span class="hint">(best-effort)</span>', c.opened))}
        ${raw(statCard('Send failed', c.sendFailed, c.sendFailed > 0 ? 'stat-warn' : ''))}
      </div>

      <div class="progress-wrap" style="background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;color:var(--charcoal);font-size:14px;margin-bottom:10px">
          <span>Response rate</span>
          <span><strong>${c.responded}</strong> of ${c.totalMultiShortlisted} &nbsp;·&nbsp; ${pct}% &nbsp;·&nbsp; <span class="muted">${c.autoRecordedSingle} single-position auto-recorded</span></span>
        </div>
        <div style="height:10px;background:#efeae3;border-radius:999px;overflow:hidden"><div style="height:100%;background:var(--red);border-radius:999px;width:${pct}%"></div></div>
      </div>
      <p class="muted" style="font-size:12px;margin:8px 2px 16px">
        <strong>Note on “Opened”:</strong> this is a best-effort signal from an email tracking pixel. Apple Mail
        Privacy Protection and some corporate mail proxies pre-fetch images automatically, which inflates opens.
        <strong>“Visited”</strong> is the reliable signal — it requires a real click-through to the page.
      </p>

      <div class="table-scroll">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th>Shortlisted for</th>
              <th>Stage</th>
              <th>Sent</th>
              <th>Opened <span class="hint">(best-effort)</span></th>
              <th>Visited <span class="hint">(reliable)</span></th>
              <th>Submitted</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.length ? raw(rowsHtml) : raw('<tr><td colspan="7" class="muted" style="text-align:center;padding:26px">No candidates loaded yet. Use “Upload candidates”.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>
    ${raw(DASH_STYLE)}
  `;
  return layout({ title: 'Admin Dashboard · Position Preference', bodyHtml: body });
}

export function adminUploadPage(opts: { error?: string; validTitles?: string[] } = {}): string {
  const err = opts.error
    ? raw(html`<div class="callout" role="alert" style="border-left-color:var(--red)"><div><p class="value">${opts.error}</p></div></div>`)
    : raw('');
  const titlesList = (opts.validTitles ?? []).map((t) => html`<li>${t}</li>`).join('');
  const titlesBlock = (opts.validTitles ?? []).length
    ? raw(html`
        <div class="callout" style="border-left-color:#2f6b46;background:#f2f8f3">
          <div>
            <p class="label" style="color:#2f6b46">Accepted position titles (must match exactly, case-sensitive)</p>
            <ul style="margin:6px 0 0;padding-left:18px;font-size:14px;color:var(--charcoal);columns:2">${raw(titlesList)}</ul>
          </div>
        </div>`)
    : raw('');
  const body = html`
    <div class="card" style="max-width:40rem;margin:0 auto">
      <p class="eyebrow">Admin · Upload</p>
      <h1>Upload candidate list</h1>
      <p class="lede muted">
        CSV with columns <code>name, email, positions</code>, where <code>positions</code> is a
        semicolon-separated list of position titles matching the accepted titles exactly.
      </p>
      ${err}
      ${titlesBlock}
      <div class="callout" style="border-left-color:#3a557e;background:#f4f6fa">
        <div>
          <p class="label" style="color:#3a557e">Example row</p>
          <p class="value" style="font-family:var(--font-body);font-weight:400;font-size:14px">Adaeze Okafor,adaeze@example.com,Process Technician;Electrical Specialist</p>
        </div>
      </div>
      <form method="POST" action="/admin/upload/preview" enctype="multipart/form-data">
        <input type="file" name="file" accept=".csv,text/csv" required
               style="width:100%;padding:16px;border:1.5px dashed var(--line);border-radius:10px;background:#fbfaf8;margin:6px 0 20px" />
        <button type="submit" class="btn btn-primary">Validate &amp; preview</button>
      </form>
      <p class="muted" style="font-size:13px;text-align:center;margin-top:16px">
        Nothing is written to the database until you confirm the preview. Uploading does not send any email.
      </p>
      <div style="margin-top:20px"><a class="btn btn-ghost" href="/admin">Back to dashboard</a></div>
    </div>
  `;
  return layout({ title: 'Upload candidates · Admin', bodyHtml: body });
}

export function adminPreviewPage(result: ValidationResult, csvText: string): string {
  const errorRows = result.bad
    .map(
      (b) => html`
        <tr>
          <td>${b.rowNumber}</td>
          <td>${b.email || raw('<span class="muted">—</span>')}</td>
          <td>${b.positionsRaw}</td>
          <td style="color:var(--red-deep)">${b.reason}</td>
        </tr>
      `
    )
    .join('');

  const body = html`
    <div style="max-width:52rem;margin:0 auto;width:100%">
      <p class="eyebrow">Admin · Upload preview</p>
      <h1 style="margin-bottom:6px">Review before import</h1>
      <p class="muted" style="margin-bottom:22px">Nothing has been written yet. Confirm below to import the valid rows.</p>

      <div class="stats" style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:22px">
        ${raw(statCard('Total rows', result.totalRows))}
        ${raw(statCard('Will be emailed', result.multiCount, 'stat-accent'))}
        ${raw(statCard('Auto-recorded', result.singleCount))}
        ${raw(statCard('Rows with errors', result.bad.length, result.bad.length ? 'stat-warn' : ''))}
      </div>

      <div class="card">
        <p style="margin:0 0 4px"><strong>${result.good.length}</strong> valid row(s) will be imported:
          <span class="muted">${result.multiCount} multi-shortlisted (emailed on Send), ${result.singleCount} single-shortlisted (auto-recorded, no email).</span></p>
        <form method="POST" action="/admin/upload/commit" style="margin-top:16px">
          <input type="hidden" name="csv" value="${esc(csvText)}" />
          <button type="submit" class="btn btn-primary"${result.good.length === 0 ? ' disabled aria-disabled="true"' : ''}>Confirm import — write ${result.good.length} row(s)</button>
        </form>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          ${result.bad.length
            ? raw(html`<form method="POST" action="/admin/upload/errors" style="margin:0;flex:1 1 auto"><input type="hidden" name="csv" value="${esc(csvText)}" /><button class="btn btn-ghost">Download error report (${result.bad.length})</button></form>`)
            : raw('')}
          <a class="btn btn-ghost" href="/admin/upload" style="flex:1 1 auto">Cancel / re-upload</a>
        </div>
      </div>

      ${result.bad.length
        ? raw(html`
          <h2 style="font-size:18px;margin:26px 0 10px">Rows with errors (skipped)</h2>
          <div class="table-scroll">
            <table class="dash-table">
              <thead><tr><th>Row</th><th>Email</th><th>Positions</th><th>Reason</th></tr></thead>
              <tbody>${raw(errorRows)}</tbody>
            </table>
          </div>`)
        : raw('')}
    </div>
    ${raw(DASH_STYLE)}
  `;
  return layout({ title: 'Upload preview · Admin', bodyHtml: body });
}

export function adminImportResultPage(res: {
  candidatesCreated: number;
  tokensCreated: number;
  autoRecorded: number;
  skippedBad: number;
}): string {
  const body = html`
    <div class="card" style="max-width:38rem;margin:0 auto">
      <div class="success-mark">${raw('<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>')}</div>
      <p class="eyebrow">Import complete</p>
      <h1>Candidates imported</h1>
      <div class="summary" style="margin-top:14px">
        <div class="row"><div class="k">Candidates created</div><div class="v">${res.candidatesCreated}</div></div>
        <div class="row"><div class="k">Tokens generated (to email)</div><div class="v">${res.tokensCreated}</div></div>
        <div class="row"><div class="k">Auto-recorded (single-position)</div><div class="v">${res.autoRecorded}</div></div>
        <div class="row"><div class="k">Rows skipped (errors)</div><div class="v">${res.skippedBad}</div></div>
      </div>
      <p class="muted" style="margin-top:16px">No emails have been sent. Use <strong>Send invitations</strong> on the dashboard when ready.</p>
      <div class="actions"><a class="btn btn-primary" href="/admin">Back to dashboard</a></div>
    </div>
  `;
  return layout({ title: 'Import complete · Admin', bodyHtml: body });
}

export function adminConfirmSendPage(opts: {
  kind: 'send' | 'remind';
  count: number;
  action: string;
}): string {
  const isRemind = opts.kind === 'remind';
  const body = html`
    <div class="card" style="max-width:34rem;margin:0 auto">
      <p class="eyebrow">${isRemind ? 'Send reminders' : 'Send invitations'}</p>
      <h1>${isRemind ? 'Remind pending candidates?' : 'Send invitation emails?'}</h1>
      <p class="lede">
        This will email <strong>${opts.count}</strong> candidate(s)${isRemind ? ' who have not yet responded' : ' awaiting their first invitation'}.
      </p>
      ${opts.count === 0
        ? raw(html`<p class="muted">There is no one to email right now.</p><div class="actions"><a class="btn btn-ghost" href="/admin">Back to dashboard</a></div>`)
        : raw(html`
          <form method="POST" action="${esc(opts.action)}" class="actions" data-final-form>
            <button type="submit" class="btn btn-primary">${isRemind ? `Send ${opts.count} reminder(s)` : `Send ${opts.count} invitation(s)`}</button>
          </form>
          <form method="GET" action="/admin" style="margin-top:12px"><button class="btn btn-ghost">Cancel</button></form>`)}
    </div>
  `;
  return layout({ title: isRemind ? 'Confirm reminders · Admin' : 'Confirm send · Admin', bodyHtml: body, withScript: true });
}

export function adminBatchStartedPage(kind: 'send' | 'remind', count: number, alreadyRunning: boolean): string {
  const noun = kind === 'remind' ? 'reminder' : 'invitation';
  const body = html`
    <div class="card" style="max-width:38rem;margin:0 auto">
      <div class="success-mark">${raw('<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 12h16M14 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>')}</div>
      <p class="eyebrow">${kind === 'remind' ? 'Reminders' : 'Invitations'} sending</p>
      <h1>${alreadyRunning ? 'A batch is already sending' : `Sending ${count} ${noun}(s)…`}</h1>
      <p class="lede">
        ${alreadyRunning
          ? raw('A send is already in progress. Emails are going out in the background — no need to start another.')
          : raw('Emails are being sent in the background so this page never times out on large lists.')}
        Refresh the dashboard to watch progress as each candidate moves to <strong>Sent</strong>.
      </p>
      <p class="muted" style="font-size:14px">
        If any sends fail, they are marked on the dashboard and you can safely run
        ${kind === 'remind' ? 'reminders' : 'send'} again — only candidates not yet emailed are retried.
      </p>
      <div class="actions"><a class="btn btn-primary" href="/admin">Back to dashboard</a></div>
    </div>
  `;
  return layout({ title: 'Sending… · Admin', bodyHtml: body });
}

export function adminBatchResultPage(kind: 'send' | 'remind', res: BatchResult): string {
  const errors = res.errors
    .map((e) => html`<div class="row"><div class="k">${e.email}</div><div class="v" style="color:var(--red-deep);font-weight:400">${e.error}</div></div>`)
    .join('');
  const body = html`
    <div class="card" style="max-width:40rem;margin:0 auto">
      <p class="eyebrow">${kind === 'remind' ? 'Reminders sent' : 'Invitations sent'}</p>
      <h1>Batch complete</h1>
      <div class="summary" style="margin-top:12px">
        <div class="row"><div class="k">Attempted</div><div class="v">${res.attempted}</div></div>
        <div class="row"><div class="k">Succeeded</div><div class="v">${res.succeeded}</div></div>
        <div class="row"><div class="k">Failed</div><div class="v">${res.failed}</div></div>
      </div>
      ${res.errors.length
        ? raw(html`<h2 style="font-size:16px;margin:20px 0 8px">Failures ${kind === 'send' ? '(retry from the dashboard)' : ''}</h2><div class="summary">${raw(errors)}</div>`)
        : raw('')}
      <div class="actions"><a class="btn btn-primary" href="/admin">Back to dashboard</a></div>
    </div>
  `;
  return layout({ title: 'Batch complete · Admin', bodyHtml: body });
}
