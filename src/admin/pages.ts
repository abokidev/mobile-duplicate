import { esc, html, layout, raw } from '../lib/html.js';
import type { DashboardData, DashboardRow } from './data.js';

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

function statCard(label: string, value: number, accent = false): string {
  return html`
    <div class="stat ${accent ? 'stat-accent' : ''}">
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>
  `;
}

function statusBadge(row: DashboardRow): string {
  if (row.selectedPosition && row.source === 'auto_single_shortlist') {
    return html`<span class="badge badge-auto">Auto-recorded</span>`;
  }
  if (row.selectedPosition) {
    return html`<span class="badge badge-done">Recorded</span>`;
  }
  return html`<span class="badge badge-pending">Pending</span>`;
}

export function adminDashboardPage(data: DashboardData, admin: { email: string }): string {
  const c = data.counters;
  const pct =
    c.totalMultiShortlisted > 0 ? Math.round((c.responded / c.totalMultiShortlisted) * 100) : 0;

  const rowsHtml = data.rows
    .map(
      (r) => html`
        <tr>
          <td>
            <div class="cand-name">${r.name}</div>
            <div class="cand-email">${r.email}</div>
          </td>
          <td class="col-short">${r.shortlisted.join(', ')}</td>
          <td>${r.selectedPosition ? raw(html`<strong>${r.selectedPosition}</strong>`) : raw('<span class="muted">—</span>')}</td>
          <td>${raw(statusBadge(r))}</td>
          <td class="col-ts muted">${r.selectedAt ? r.selectedAt.toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '—'}</td>
        </tr>
      `
    )
    .join('');

  const body = html`
    <div style="max-width:64rem;margin:0 auto;width:100%">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:8px">
        <div>
          <p class="eyebrow" style="margin-bottom:8px">Admin Dashboard</p>
          <h1 style="margin:0">Position Preference — live status</h1>
        </div>
        <div style="display:flex;gap:10px;align-items:center">
          <a class="btn btn-primary" href="/admin/export.csv" style="width:auto;padding:12px 18px">Export CSV</a>
          <form method="POST" action="/admin/logout" style="margin:0">
            <button class="btn btn-ghost" style="width:auto;padding:12px 18px">Sign out</button>
          </form>
        </div>
      </div>
      <p class="muted" style="margin-bottom:22px">Signed in as ${admin.email}. Counts update on each page load.</p>

      <div class="stats">
        ${raw(statCard('Multi-shortlisted (emailed)', c.totalMultiShortlisted))}
        ${raw(statCard('Responded', c.responded, true))}
        ${raw(statCard('Pending', c.pending))}
        ${raw(statCard('Auto-recorded (single)', c.autoRecordedSingle))}
      </div>

      <div class="progress-wrap">
        <div class="progress-head">
          <span>Response rate</span>
          <span><strong>${c.responded}</strong> of ${c.totalMultiShortlisted} &nbsp;·&nbsp; ${pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>

      <div class="table-card">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Candidate</th>
              <th class="col-short">Shortlisted for</th>
              <th>Selected</th>
              <th>Status</th>
              <th class="col-ts">Submitted</th>
            </tr>
          </thead>
          <tbody>
            ${data.rows.length ? raw(rowsHtml) : raw('<tr><td colspan="5" class="muted" style="text-align:center;padding:26px">No candidates loaded yet.</td></tr>')}
          </tbody>
        </table>
      </div>
    </div>

    <style>
      .wrap { max-width: 68rem; }
      .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:22px; }
      .stat { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:20px; box-shadow:var(--shadow-sm); }
      .stat-accent { border-color:#f3cfcf; background:var(--selected-tint); }
      .stat-value { font-family:var(--font-head); font-size:34px; font-weight:700; color:var(--black); line-height:1; }
      .stat-accent .stat-value { color:var(--red-deep); }
      .stat-label { color:var(--muted); font-size:12.5px; margin-top:8px; letter-spacing:0.02em; }
      .progress-wrap { background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:18px 20px; margin-bottom:22px; }
      .progress-head { display:flex; justify-content:space-between; color:var(--charcoal); font-size:14px; margin-bottom:10px; }
      .progress-track { height:10px; background:#efeae3; border-radius:999px; overflow:hidden; }
      .progress-fill { height:100%; background:var(--red); border-radius:999px; transition:width .3s ease; }
      .table-card { background:var(--surface); border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:var(--shadow-sm); }
      .dash-table { width:100%; border-collapse:collapse; font-size:14px; }
      .dash-table th { text-align:left; padding:14px 16px; background:#faf8f5; color:var(--muted); font-family:var(--font-head); font-size:11px; text-transform:uppercase; letter-spacing:0.1em; border-bottom:1px solid var(--line); }
      .dash-table td { padding:14px 16px; border-bottom:1px solid var(--line); vertical-align:top; }
      .dash-table tr:last-child td { border-bottom:0; }
      .cand-name { font-weight:600; color:var(--black); }
      .cand-email { color:var(--muted); font-size:12.5px; }
      .badge { display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; font-family:var(--font-head); letter-spacing:0.03em; }
      .badge-done { background:var(--selected-tint); color:var(--red-deep); border:1px solid #f3cfcf; }
      .badge-pending { background:#f0ede8; color:var(--muted); }
      .badge-auto { background:#eef3ee; color:#2f6b46; border:1px solid #cfe3d5; }
      @media (max-width: 46rem) {
        .stats { grid-template-columns:repeat(2,1fr); }
        .col-short, .col-ts { display:none; }
      }
    </style>
  `;
  return layout({ title: 'Admin Dashboard · Position Preference', bodyHtml: body });
}
