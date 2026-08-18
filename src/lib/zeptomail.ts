import type { EmailConfig } from './env.js';

export interface SendMessage {
  toAddress: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody: string;
}

export type SendResult =
  | { ok: true; status: number }
  | { ok: false; error: string; status?: number };

/**
 * Send one email via the ZeptoMail HTTP API (Email Integration Addendum).
 * The send token is the full Authorization header value (includes the
 * `Zoho-enczapikey` prefix) and is never logged.
 */
export async function sendViaZeptoMail(cfg: EmailConfig, msg: SendMessage): Promise<SendResult> {
  const endpoint = `https://${cfg.apiHost}/v1.1/email`;
  const payload = {
    from: { address: cfg.senderEmail, name: cfg.senderName },
    to: [{ email_address: { address: msg.toAddress, name: msg.toName } }],
    ...(cfg.replyTo ? { reply_to: [{ address: cfg.replyTo }] } : {}),
    subject: msg.subject,
    htmlbody: msg.htmlBody,
    textbody: msg.textBody,
  };
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: cfg.sendToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => '');
    return { ok: false, status: res.status, error: `HTTP ${res.status} ${text.slice(0, 300)}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
