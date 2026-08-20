import type { SmsConfig } from './env.js';

export type SmsResult = { ok: true; status: number } | { ok: false; error: string; status?: number };

/**
 * Normalise a Nigerian phone number to Termii's expected international format:
 * digits only, no leading '+', country code 234 (e.g. "08012345678" → "2348012345678").
 * Returns null if it can't be made into a plausible number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/[^\d]/g, '');
  if (d === '') return null;
  if (d.startsWith('234')) {
    // already country-coded
  } else if (d.startsWith('0')) {
    d = '234' + d.slice(1);
  } else if (d.length === 10) {
    // 10-digit local without leading 0 (e.g. 8012345678)
    d = '234' + d;
  }
  // Nigerian MSISDN is 234 + 10 digits = 13.
  if (!/^234\d{10}$/.test(d)) return null;
  return d;
}

/**
 * Send one SMS via the Termii v4 HTTP API (SMS Reminder addendum §6).
 * Endpoint verified against current Termii docs: POST {base}/api/sms/send.
 * The bulk endpoint sends identical text to all recipients (no per-recipient
 * variables), so personalised token links require individual sends — this is that.
 */
export async function sendViaTermii(cfg: SmsConfig, msg: { to: string; message: string }): Promise<SmsResult> {
  const to = normalizePhone(msg.to);
  if (!to) return { ok: false, error: `invalid phone number: ${msg.to}` };

  const endpoint = `${cfg.baseUrl}/api/sms/send`;
  const payload = {
    api_key: cfg.apiKey,
    to,
    from: cfg.senderId,
    sms: msg.message,
    type: 'plain',
    channel: 'generic',
  };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${text.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Termii's generic route does not deliver to Nigerian MTN numbers between
 * 8PM and 8AM WAT. Returns true if `date` (default now) falls in that window,
 * so the dashboard can warn the admin that some SMS may queue silently.
 */
export function inNoDeliveryWindowWAT(date = new Date()): boolean {
  // WAT is UTC+1 (no DST).
  const watHour = (date.getUTCHours() + 1) % 24;
  return watHour >= 20 || watHour < 8;
}
