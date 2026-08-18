import { env } from '../lib/env.js';
import { esc, html, layout, raw } from '../lib/html.js';
import type { CandidateView } from '../lib/selection.js';

const CHECK_SVG = raw(
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
);
const ARROW_SVG = raw(
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
);

/**
 * Instructions / landing page. Personalised greeting; spells out the rules in
 * full BEFORE any position is shown. Ends with a single "Proceed" button.
 */
export function instructionsPage(c: CandidateView, token: string): string {
  const action = `/s/${encodeURIComponent(token)}/select`;
  const body = html`
    <div class="card">
      <p class="eyebrow">Position Preference · Action Required</p>
      <h1>Hey ${c.firstName},</h1>
      <p class="lede">
        You were shortlisted for <strong>more than one position</strong> with ExxonMobil
        Affiliates in Nigeria. Before the aptitude and skills test, we need you to tell us
        the <strong>one position</strong> you would like to be assessed for.
      </p>

      <div class="callout" role="note">
        <div>
          <p class="label">Selection deadline</p>
          <p class="value">${env.deadlineDisplay}</p>
        </div>
      </div>

      <hr class="rule" />

      <ul class="rules">
        <li>
          <span class="rk">1</span>
          <strong>You choose one position.</strong> On the next screen you will see only the
          positions you were shortlisted for. Pick the single one you want to sit the test for.
        </li>
        <li>
          <span class="rk">2</span>
          <strong>You sit the test once.</strong> The test is for one position only. Anyone found
          taking the test more than once is <strong>disqualified</strong>.
        </li>
        <li>
          <span class="rk">3</span>
          <strong>Your choice is final.</strong> Once you confirm, your selection cannot be changed.
          We will ask you to confirm before it is recorded.
        </li>
        <li>
          <span class="rk">4</span>
          <strong>What happens next.</strong> After you choose, you will receive further test-day
          instructions separately. The test holds on <strong>${env.testDateDisplay}</strong>.
        </li>
      </ul>

      <hr class="rule" />

      <p class="muted" style="font-size:15px">
        Please make your selection before <strong>${env.deadlineDisplay}</strong>. No changes are
        accommodated after this time.
      </p>

      <form class="actions" method="POST" action="${esc(action)}">
        <button type="submit" class="btn btn-primary">Proceed ${ARROW_SVG}</button>
      </form>
    </div>
  `;
  return layout({ title: 'Your Position Preference · ExxonMobil Affiliates in Nigeria', bodyHtml: body });
}

/**
 * Selection page. Renders ONLY the candidate's shortlisted positions as
 * single-select cards. "Confirm Selection" is disabled until one is chosen (JS);
 * the server independently rejects an empty submit.
 */
export function selectionPage(
  c: CandidateView,
  token: string,
  opts: { error?: boolean } = {}
): string {
  const action = `/s/${encodeURIComponent(token)}/confirm`;
  const cards = c.positions
    .map(
      (p) => html`
        <label class="pos">
          <input type="radio" name="positionId" value="${p.id}" />
          <span class="marker" aria-hidden="true"></span>
          <span class="title">${p.title}</span>
        </label>
      `
    )
    .join('');

  const errorBanner = opts.error
    ? html`<div class="callout" role="alert" style="border-left-color:var(--red)">
        <div><p class="value">Please choose one position to continue.</p></div>
      </div>`
    : '';

  const body = html`
    <div class="card">
      <p class="eyebrow">Step 2 of 3 · Choose your position</p>
      <h1>Select one position, ${c.firstName}</h1>
      <p class="lede">
        These are the positions you were shortlisted for. Choose the single one you want to sit
        the test for. You can review your choice before it is recorded.
      </p>
      ${raw(errorBanner)}
      <form data-selection-form method="POST" action="${esc(action)}">
        <div class="positions">
          ${raw(cards)}
        </div>
        <div class="actions">
          <button type="submit" class="btn btn-primary" data-confirm>Confirm Selection ${ARROW_SVG}</button>
        </div>
      </form>
      <p class="muted" style="font-size:13px;text-align:center;margin-top:18px">
        Your choice is final once confirmed on the next screen.
      </p>
    </div>
  `;
  return layout({
    title: 'Select your position · ExxonMobil Affiliates in Nigeria',
    bodyHtml: body,
    withScript: true,
  });
}

/**
 * Irreversibility check — sits between choice and the final write.
 * "You have selected {Position}. This cannot be changed after submission. Confirm?"
 */
export function confirmPage(
  c: CandidateView,
  token: string,
  position: { id: number; title: string }
): string {
  const submitAction = `/s/${encodeURIComponent(token)}/submit`;
  const backAction = `/s/${encodeURIComponent(token)}/select`;
  const body = html`
    <div class="card">
      <p class="eyebrow">Step 3 of 3 · Confirm</p>
      <h1>Please confirm your choice</h1>
      <p class="lede">
        You have selected the position below. <strong>This cannot be changed after submission.</strong>
        Please make sure it is correct.
      </p>

      <div class="summary">
        <div class="row">
          <div class="k">Candidate</div>
          <div class="v">${c.fullName}</div>
        </div>
        <div class="row">
          <div class="k">Your selected position</div>
          <div class="v big"><span class="selected-pill">${position.title}</span></div>
        </div>
      </div>

      <form data-final-form class="actions" method="POST" action="${esc(submitAction)}">
        <input type="hidden" name="positionId" value="${position.id}" />
        <button type="submit" class="btn btn-primary">Yes, record this selection ${CHECK_SVG}</button>
      </form>
      <form method="POST" action="${esc(backAction)}" style="margin-top:12px">
        <button type="submit" class="btn btn-ghost">Go back and change</button>
      </form>
    </div>
  `;
  return layout({ title: 'Confirm your position · ExxonMobil Affiliates in Nigeria', bodyHtml: body });
}

/** Final confirmation / thank-you page. */
export function confirmedPage(
  c: CandidateView,
  position: { title: string },
  opts: { alreadyRecorded?: boolean } = {}
): string {
  const body = html`
    <div class="card">
      <div class="success-mark">${CHECK_SVG}</div>
      <p class="eyebrow">Selection recorded</p>
      <h1>Thank you, ${c.firstName}.</h1>
      <p class="lede">
        ${opts.alreadyRecorded
          ? raw('Your position preference has already been recorded. Here is what we have on file:')
          : raw('Your position preference has been recorded successfully. Here is a summary for your records:')}
      </p>

      <div class="summary">
        <div class="row">
          <div class="k">Candidate</div>
          <div class="v">${c.fullName}</div>
        </div>
        <div class="row">
          <div class="k">Recorded position</div>
          <div class="v big"><span class="selected-pill">${position.title}</span></div>
        </div>
      </div>

      <hr class="rule" />
      <p class="muted">
        Further test-day instructions will follow separately by email. The test holds on
        <strong>${env.testDateDisplay}</strong>. You do not need to do anything else now.
      </p>
      <p class="muted" style="font-size:13px">
        This selection is final and cannot be changed. If you believe there is an error, please
        contact Dragnet Solutions support.
      </p>
    </div>
  `;
  return layout({ title: 'Selection recorded · ExxonMobil Affiliates in Nigeria', bodyHtml: body });
}

/**
 * Generic message (FR8). Shown identically for invalid tokens and already-used
 * tokens — never leaks which case it is. Per the Deadline Addendum there is no
 * "expired" case: tokens never expire.
 */
export function genericMessagePage(): string {
  const body = html`
    <div class="card notice">
      <div class="success-mark neutral" aria-hidden="true">
        ${raw('<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.4" r="1.2" fill="currentColor"/></svg>')}
      </div>
      <h1>This link can’t be opened</h1>
      <p class="lede muted" style="max-width:30rem;margin-left:auto;margin-right:auto">
        This selection link is not valid or has already been used. Each candidate receives a single,
        personal link that can be used once.
      </p>
      <p class="muted" style="font-size:14px">
        If you believe this is a mistake, please contact Dragnet Solutions support and quote your
        application email address.
      </p>
    </div>
  `;
  return layout({ title: 'ExxonMobil Affiliates in Nigeria', bodyHtml: body });
}
