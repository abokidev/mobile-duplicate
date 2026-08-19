# Candidate Position Preference Selection Platform

A short-lived, high-stakes web platform for **ExxonMobil Affiliates in Nigeria**
(built by **Dragnet Solutions Limited**). Candidates shortlisted for more than one
position each declare **exactly one** position preference via a tokenised, no-login
link sent by email, ahead of the aptitude test.

- **No login, no account, no password.** One email → one token → one link → one
  irreversible choice.
- Stack: **Node.js / TypeScript · Fastify · Prisma · MySQL** (server-rendered,
  mobile-first candidate flow) · **ZeptoMail HTTP API** — consistent with Project ATLAS.

> **Source of truth:** `ExxonMobil_PositionPreference_PSA.docx`, as amended by these
> addenda (each supersedes the PSA/prompt where they differ):
> - `DEADLINE_ADDENDUM.md` — no deadline enforcement; the deadline is copy only.
> - `EMAIL_INTEGRATION_ADDENDUM.md` — send via the ZeptoMail **HTTP API**, not SMTP.
> - `MOBILE_FIRST_ADDENDUM.md` — the candidate flow is built mobile-first.
> - `POSITIONS_SEED.md` — the 7 confirmed position titles.
> - `EMAIL_COPY_CORRECTION_ADDENDUM.md` — the email uses the approved copy verbatim
>   (personalised greeting `Dear {FirstName},`).
> - `ADMIN_UPLOAD_TRACKING_ADDENDUM.md` — admin CSV upload (replaces the seed
>   hand-off), delivery/open tracking, and manual reminders. See below.

---

## What’s implemented

| PSA ref | Requirement | Where |
|---|---|---|
| FR1 | Cryptographically-random token, stored **only** as an HMAC-SHA256 hash | `src/lib/token.ts`, `scripts/issueTokens.ts` |
| FR2 | Candidate sees **only** their shortlisted positions — filtered server-side | `src/lib/selection.ts` (`loadCandidateByToken`), `src/routes/candidate.ts` |
| FR3 | Single selection; submit disabled until one chosen (JS) + server-enforced | `public/app.js`, `src/routes/candidate.ts` |
| FR4 | One-time use: check-unused → write-selection → mark-used in **one locked transaction** | `src/lib/selection.ts` (`recordSelection`) |
| FR6 | Single-shortlist candidates never emailed; auto-recorded at data-prep | `scripts/issueTokens.ts` |
| FR7 | Audit trail: timestamp, IP, user agent on every selection | `src/lib/selection.ts`, `prisma/schema.prisma` |
| FR8 | Invalid **and** already-used tokens → one identical generic message | `src/pages/candidate.ts` (`genericMessagePage`) |
| FR9 | Admin auth (stand-in for Dragnet’s shared mechanism) | `src/admin/auth.ts` |
| FR10 | Admin dashboard: live counts, table, CSV export | `src/admin/*`, `src/routes/admin.ts` |
| §8 | Premium designed HTML + plaintext email; premium candidate pages | `src/lib/email.ts`, `public/styles.css`, `src/pages/candidate.ts` |
| §12 | Automated test proving “exactly one selection, ever” under concurrency | `tests/concurrency.test.ts` |

### Candidate flow

Email → **Instructions** (`Hey {FirstName}`, rules in full, single *Proceed*) →
**Selection** (only their positions, single-select) → **Irreversibility confirm**
(“You have selected {Position}. This cannot be changed. Confirm?”) →
**Confirmation** (thank-you + summary).

The flow is server-rendered, **mobile-first** (base styles target a phone; `min-width`
queries scale up — `public/styles.css`), and **degrades gracefully without JavaScript**:
positions are real radio inputs in a plain form, and the server independently rejects an
empty submit. Pages are light for phones on flaky connections, tap targets are generous,
and reopening an unused token simply re-shows the current step rather than erroring. The
admin dashboard is desktop-oriented, as intended.

---

## Deadline handling

Per **`DEADLINE_ADDENDUM.md`**, which overrides PSA **FR5**:

- **The link has no expiry.** A token stays valid — unused, live, clickable — until a
  candidate actually submits. There is **no wall-clock deadline cutoff** anywhere in
  code.
- **The deadline (4:00 PM WAT, Thu 20 Aug 2026) is copy only.** It appears in the email
  and on the instructions page to create urgency. Moving it is a **text change**
  (`DEADLINE_DISPLAY` in `.env`) — no code, config, or re-issue of already-sent links.
- The only token states are **`unused`** and **`used`** — there is no `expired` state,
  and the generic error covers only **invalid** and **already-used** tokens.

---

## Admin upload, tracking & reminders (Admin Upload addendum)

The admin dashboard (`/admin`) now runs the whole campaign — no manual seed hand-off:

1. **Upload** (`/admin/upload`): a CSV of `name, email, positions` (positions
   semicolon-separated, matching the seeded titles). The server **validates before
   writing** and shows a preview — total rows, how many will be emailed (multi-shortlisted)
   vs auto-recorded (single-shortlisted), and every bad row with its reason (missing/
   malformed email, unknown position title, duplicate email). Bad rows are downloadable as
   an error report and never block the good rows. **Nothing is written until you confirm.**
2. **Commit**: multi-shortlisted → Candidate + Shortlist + Token; single-shortlisted →
   Candidate + Shortlist + auto Selection (FR6), no token, no email.
3. **Send is separate** from upload: click **Send invitations** (with a count-confirm step)
   to fire the ZeptoMail batch. Failed sends are logged and surfaced for retry.
4. **Tracking** per token: `Sent → Opened (best-effort) → Visited (reliable) → Submitted`,
   each with a timestamp (`events` table). The dashboard states plainly that **“Opened”**
   (email tracking pixel) is unreliable — Apple Mail Privacy Protection and mail proxies
   pre-fetch images — while **“Visited”** (a real page load) is the trustworthy signal.
5. **Reminders** (`/admin/remind`): a manual, count-confirmed button that emails only
   candidates whose token is still `unused`. Uses a **shorter, urgency-framed reminder
   email** (`src/lib/reminderEmail.ts`) — ⚠️ **draft copy pending Adekunle's approval**,
   flagged as such in the dashboard. `reminder_count` / `last_reminder_sent_at` are tracked
   per token to avoid spamming.

### Large lists

Import and send are built for large candidate lists (1000s):

- **Commit** bulk-inserts in chunks (candidates → shortlist → tokens/selections)
  inside short transactions — ~200ms for 1300 candidates, versus a per-row loop that
  would exceed the reverse-proxy timeout (an nginx 504). Re-running is idempotent
  (existing emails are skipped).
- **Send invitations** first asks which approved copy to use — **Message 1** (original) or
  **Message 2** (adds a line for candidates who applied under more than one email address) —
  then shows the usual recipient-count confirmation. Only paragraph 2 differs; the premium
  design and per-candidate title substitution are identical. Which template was used is
  recorded on each `sent` event (`events.message_template`).
- **Send / reminders** run in the **background** and the request returns immediately,
  so a batch of hundreds of ZeptoMail calls never blocks the request. Progress shows on
  the dashboard (each candidate moves to *Sent*), an in-process guard prevents a
  double-click from double-sending, and the batch is idempotent — re-run it to retry
  only the candidates not yet emailed.

### Deploying updates — run migrations

**After every deploy, run `npx prisma migrate deploy`** (or `npm run prisma:migrate`).
Skipping it causes silent schema drift: a real incident was a `sent`-tracking column
missing in production, so send events failed to write and the dashboard showed
delivered candidates as *“Not sent”*. Send status is now the authoritative
`tokens.sent_at` marker (written on a successful send, never a swallowed best-effort
event), so it stays correct and a tracking hiccup can never cause a re-send — but the
column still has to exist, so **migrations must be applied**.

**Upgrading a database that already sent invitations is safe with no extra step.**
Candidates already marked sent by the previous version (a `sent` event, no `sent_at`)
are still recognised as sent — they are never re-emailed and still show *Sent*. Only
newly-added candidates use the new `sent_at` marker. The backfill script below is
**optional**, for the edge case where emails were delivered but no record was written
at all (e.g. sent while the tracking migration was missing) and you want to reconcile
them without re-sending:

```bash
npm run backfill:sent          # marks tokens with proof of delivery (opened/visited/submitted)
npm run backfill:sent -- --all # also marks the rest, if a full send already went out
```

### Security note — retained delivery token

The separated upload→send flow, same-link reminders, and send retries all require the
raw token to survive between import and submission (you cannot re-email a link you only
stored as a hash). The raw token is therefore held **encrypted at rest** (AES-256-GCM,
key derived from `TOKEN_HMAC_SECRET`; `src/lib/crypto.ts`) in `tokens.delivery_enc`, is
**never used for verification** (that path is always the salted hash), and is **purged the
moment the candidate submits**. This is a deliberate, bounded change from the PSA's
"raw token never stored" line, forced by the admin-driven send/reminder features; flag it
if that trade-off needs review.

## Getting started

### Prerequisites

- Node.js ≥ 20
- A **MySQL / MariaDB** database (InnoDB — the one-time-use guarantee needs real row
  locks). The concurrency test also needs a **separate** test database.

### 1. Install & configure

```bash
npm install
cp .env.example .env
# then edit .env — at minimum set DATABASE_URL, TEST_DATABASE_URL,
# TOKEN_HMAC_SECRET, COOKIE_SECRET, PUBLIC_BASE_URL, and the ZEPTOMAIL_* values.
```

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Create the schema

```bash
npm run prisma:generate
npx prisma migrate deploy      # applies prisma/migrations to DATABASE_URL
```

### 3. Load data

The 7 positions in `scripts/seed.ts` are the confirmed titles; replace the illustrative
demo candidates/shortlist with the real candidate → position mapping when it arrives
(see [Assumptions](#assumptions--to-confirm-with-the-client)), then:

```bash
npm run seed            # 7 positions, candidates, shortlist, a demo admin
npm run tokens:issue    # issues tokens for multi-shortlisted; auto-records single-shortlist (FR6)
```

`tokens:issue` writes the **raw** tokenised URLs to `out/tokens-<timestamp>.csv`
(git-ignored — it contains raw tokens). This file feeds the email send.

### 4. Send the candidate emails

The email body is the **approved copy** (`src/lib/email.ts`), no rewriting. The
per-candidate variables are the personalised greeting `Dear {FirstName},` and the
shortlisted position titles (inserted, bolded, into paragraph 1 and the subject line
`ExxonMobil Affiliates in Nigeria <titles> Job Preferences`). `tokens:issue` writes each
candidate's titles into a `positions` column in `out/tokens-*.csv`, which the send script
formats into the `A, B and C` list used in the copy.

Sending uses the **ZeptoMail HTTP API** (`api.zeptomail.com`, `Zoho-enczapikey` auth).
The send script requires `ZEPTOMAIL_API_HOST`, `ZEPTOMAIL_AGENT_ALIAS`,
`ZEPTOMAIL_SEND_TOKEN`, `SENDER_EMAIL`, `SENDER_NAME` in `.env` and **fails loudly** if
any is missing (no hardcoded fallback). The send token is the full `Authorization`
header value (it already includes the `Zoho-enczapikey` prefix) and must never be
committed.

```bash
npm run email:preview                              # writes emails/preview.html + .txt for QA
npm run email:send -- out/tokens-<stamp>.csv --dry-run   # render + validate config, no API call
npm run email:send -- out/tokens-<stamp>.csv             # send via ZeptoMail HTTP API
```

### 5. Run the app

```bash
npm run build && npm start     # production
# or
npm run dev                    # watch mode
```

- Candidate link: `${PUBLIC_BASE_URL}/s/<raw-token>`
- Admin dashboard: `${PUBLIC_BASE_URL}/admin`

Create/rotate an admin:

```bash
npm run admin:create -- admin@dragnet-solutions.com 'a-strong-password'
```

---

## The one-time-use guarantee (FR4) and its test

`recordSelection` runs the whole check-then-write inside one Prisma interactive
transaction, opened with a **`SELECT … FOR UPDATE`** lock on the token row. Concurrent
submissions (double-click, two tabs, a retried request) serialise on that lock: the
first commits `used` + a `Selection`; every other one wakes, sees `used`, and returns
the already-recorded choice **without** writing a second row. A unique constraint on
`selections.candidate_id` is the belt-and-braces backstop.

`tests/concurrency.test.ts` proves it against real MySQL/InnoDB — it fires **25
concurrent** submissions (with differing positions) at one token and asserts exactly
one fresh write, exactly one `Selection` row, all attempts agreeing on the winner, and
the token left `used`.

```bash
npm test        # runs prisma db push against TEST_DATABASE_URL, then the suite
```

> The guarantee depends on database row locking, so the test needs a real
> MySQL/InnoDB `TEST_DATABASE_URL`; SQLite or an in-memory fake cannot reproduce it.

---

## Security notes

- Tokens are hashed at rest (HMAC-SHA256); the raw token exists only in the emailed URL
  and is never stored or logged (request logs redact cookies and log route templates,
  not concrete URLs).
- Token-lookup and admin-login endpoints are rate-limited (`@fastify/rate-limit`) to
  blunt brute-forcing.
- Security headers (CSP, `X-Frame-Options`, `nosniff`, `no-referrer`) and `no-store`
  caching on tokenised pages. Set `COOKIE_SECURE=true` and `TRUST_PROXY=true` behind
  HTTPS termination. Serve over HTTPS only.
- CSV export is hardened against spreadsheet formula injection.

---

## Assumptions — to confirm with the client

1. **The candidate → position Shortlist mapping** is still **outstanding** (per
   `POSITIONS_SEED.md`, it will be provided separately before send). The 7 position
   titles are confirmed and seeded in order; the demo candidates/shortlist in
   `scripts/seed.ts` are illustrative only — replace them when the real mapping arrives.
   Also confirm with Adekunle the assumption that the source list’s duplicated
   “Process Technician” / “Electrical Specialist” were repeats, not distinct postings.
2. **Admin auth** is a self-contained scrypt + signed-session-cookie stand-in
   (`src/admin/auth.ts`). Swap `verifyPassword`/session issuance for Dragnet’s shared
   ATLAS admin mechanism (FR9) in production.
3. **Email send token** must be supplied in the local `.env` as `ZEPTOMAIL_SEND_TOKEN`
   (provided separately, not committed). Sender identity is fixed to
   `Dragnet Solutions Limited <noreply@dragnet-solutions.com>` via `SENDER_NAME` /
   `SENDER_EMAIL`.

## Project layout

```
prisma/schema.prisma      Data model: Candidates, Positions, Shortlist, Tokens, Selections,
                          Events (tracking), Admin
src/lib/                  env, db, token hashing, crypto (delivery token), selection service
                          (FR2/FR4), html, email + reminderEmail, zeptomail (HTTP API)
src/pages/candidate.ts    Instructions, selection, confirm, confirmation, generic message
src/routes/               candidate flow (+ tracking pixel, page_visited) + admin routes
src/admin/                auth, dashboard data + CSV, pages, import (CSV validate/commit),
                          sending (send + reminder batches), events
src/server.ts             Fastify app assembly (rate limit, cookies, multipart, static, headers)
scripts/                  seed, issueTokens, sendEmails, previewEmail, createAdmin
tests/                    concurrency (one-time-use proof), import (CSV validation),
                          tracking (encryption + purge), adminFlow (upload→commit→tracking)
public/                   styles.css (mobile-first design system), app.js (progressive enhancement)
```
