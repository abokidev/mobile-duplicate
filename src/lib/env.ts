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

  email: {
    host: optional('ZEPTOMAIL_HOST', 'smtp.zeptomail.com'),
    port: parseInt(optional('ZEPTOMAIL_PORT', '587'), 10),
    user: optional('ZEPTOMAIL_USER', 'emailapikey'),
    pass: optional('ZEPTOMAIL_PASS', ''),
    fromAddress: optional('EMAIL_FROM_ADDRESS', 'invitation@dragnet-solutions.com'),
    fromName: optional('EMAIL_FROM_NAME', 'Dragnet Solutions'),
    replyTo: process.env.EMAIL_REPLY_TO || undefined,
  },

  // Deadline Addendum: these two are COPY ONLY. They are shown to candidates
  // to create urgency but are never checked or enforced anywhere in code.
  deadlineDisplay: optional('DEADLINE_DISPLAY', '4:00 PM WAT, Thursday 20 August 2026'),
  testDateDisplay: optional('TEST_DATE_DISPLAY', 'Saturday, 29 August 2026'),
};
