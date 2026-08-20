import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

function bool(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v === 'true' || v === '1';
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  tokenHmacSecret: required('TOKEN_HMAC_SECRET'),
  publicBaseUrl: optional('PUBLIC_BASE_URL', 'http://localhost:3000').replace(/\/$/, ''),
  port: parseInt(optional('PORT', '3000'), 10),
  host: optional('HOST', '0.0.0.0'),
  cookieSecret: optional('COOKIE_SECRET', 'dev-cookie-secret-change-me'),
  cookieSecure: bool('COOKIE_SECURE', false),
  trustProxy: bool('TRUST_PROXY', false),

  // Deadline Addendum: these two are COPY ONLY. They are shown to candidates
  // to create urgency but are never checked or enforced anywhere in code.
  deadlineDisplay: optional('DEADLINE_DISPLAY', '4:00 PM WAT, Thursday 20 August 2026'),
  testDateDisplay: optional('TEST_DATE_DISPLAY', 'Saturday, 29 August 2026'),
};

export interface EmailConfig {
  apiHost: string;
  agentAlias: string;
  sendToken: string;
  senderEmail: string;
  senderName: string;
  replyTo?: string;
}

/**
 * Load the ZeptoMail HTTP API configuration (Email Integration Addendum).
 *
 * These are required environment variables with NO hardcoded fallback — the send
 * script must fail loudly if any are missing rather than silently using a default.
 * The secret values live only in the local, git-ignored `.env`.
 *
 * `requireToken` is relaxed for `--dry-run`, which renders and validates the sender
 * identity but never contacts the API, so it does not need the secret send token.
 */
export function loadEmailConfig(opts: { requireToken?: boolean } = {}): EmailConfig {
  const requireToken = opts.requireToken ?? true;
  const missing: string[] = [];
  const read = (name: string, needed = true): string => {
    const v = process.env[name];
    if ((!v || v.trim() === '') && needed) missing.push(name);
    return v ?? '';
  };

  const cfg: EmailConfig = {
    apiHost: read('ZEPTOMAIL_API_HOST'),
    agentAlias: read('ZEPTOMAIL_AGENT_ALIAS'),
    sendToken: read('ZEPTOMAIL_SEND_TOKEN', requireToken),
    senderEmail: read('SENDER_EMAIL'),
    senderName: read('SENDER_NAME'),
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  };

  if (missing.length > 0) {
    throw new Error(
      `Missing required email environment variable(s): ${missing.join(', ')}.\n` +
        `Set them in your local .env (see .env.example). The send token is provided ` +
        `separately and must not be committed.`
    );
  }
  return cfg;
}

export interface SmsConfig {
  baseUrl: string;
  apiKey: string;
  senderId: string;
}

/**
 * Load the Termii SMS configuration (SMS Reminder addendum). TERMII_API_KEY is
 * required with no hardcoded fallback (the key lives only in the local .env).
 */
export function loadSmsConfig(): SmsConfig {
  const apiKey = process.env.TERMII_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    throw new Error(
      'Missing required environment variable: TERMII_API_KEY. Set it in your local .env ' +
        '(the key is provided separately and must not be committed).'
    );
  }
  return {
    // v4 is this account's API version — do NOT use the older api.ng.termii.com host.
    baseUrl: optional('TERMII_BASE_URL', 'https://v4.api.termii.com').replace(/\/$/, ''),
    apiKey,
    senderId: optional('TERMII_SENDER_ID', 'Dragnet'),
  };
}
