# Candidate Position Preference Selection Platform

A short-lived, high-stakes web platform for **ExxonMobil Affiliates in Nigeria**
(built by **Dragnet Solutions Limited**). Candidates shortlisted for more than one
position each declare **exactly one** position preference via a tokenised, no-login
link sent by email, ahead of the aptitude test.

- **No login, no account, no password.** One email → one token → one link → one
  irreversible choice.
- Stack: **Node.js / TypeScript · Fastify · Prisma · MySQL** (server-rendered
  candidate flow) · **ZeptoMail** (SMTP) — consistent with Project ATLAS.

> **Source of truth:** `ExxonMobil_PositionPreference_PSA.docx`, as amended by
> `DEADLINE_ADDENDUM.md`. Where the two differ, the addendum wins (see
> [Deadline handling](#deadline-handling) below).

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

The flow is server-rendered and **degrades gracefully without JavaScript**: positions
are real radio inputs in a plain form, and the server independently rejects an empty
submit. Pages are light for phones on flaky connections, and reopening an unused token
simply re-shows the current step rather than erroring.

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

Replace the placeholder positions and demo candidates in `scripts/seed.ts` with the
client’s real data (see [Assumptions](#assumptions--to-confirm-with-the-client)), then:

```bash
npm run seed            # 7 positions, candidates, shortlist, a demo admin
npm run tokens:issue    # issues tokens for multi-shortlisted; auto-records single-shortlist (FR6)
```

`tokens:issue` writes the **raw** tokenised URLs to `out/tokens-<timestamp>.csv`
(git-ignored — it contains raw tokens). This file feeds the email send.

### 4. Send the candidate emails

```bash
npm run email:preview                              # writes emails/preview.html + .txt for QA
npm run email:send -- out/tokens-<stamp>.csv --dry-run   # render + list recipients, no send
npm run email:send -- out/tokens-<stamp>.csv             # send via ZeptoMail
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

These were needed but not supplied; sensible defaults are in place and clearly marked so
they’re easy to replace:

1. **The 7 position titles** are **placeholders** in `scripts/seed.ts` — replace with
   the confirmed titles (and the real candidate → position shortlist mapping) before the
   live send.
2. **Admin auth** is a self-contained scrypt + signed-session-cookie stand-in
   (`src/admin/auth.ts`). Swap `verifyPassword`/session issuance for Dragnet’s shared
   ATLAS admin mechanism (FR9) in production.
3. **Email sender** defaults to `invitation@dragnet-solutions.com` (the existing
   pattern) with a Dragnet/ExxonMobil display name — override via `EMAIL_FROM_*` in
   `.env`, and set the real `ZEPTOMAIL_PASS` send token.

## Project layout

```
prisma/schema.prisma      Data model: Candidates, Positions, Shortlist, Tokens, Selections, Admin
src/lib/                  env, db, token hashing, selection service (FR2/FR4), html + email
src/pages/candidate.ts    Instructions, selection, confirm, confirmation, generic message
src/routes/               candidate flow + admin routes
src/admin/                auth, dashboard data + CSV, dashboard pages
src/server.ts             Fastify app assembly (rate limit, cookies, static, security headers)
scripts/                  seed, issueTokens, sendEmails, previewEmail, createAdmin
tests/concurrency.test.ts The one-time-use proof + FR2/FR7/FR8 checks
public/                   styles.css (design system), app.js (progressive enhancement)
```
