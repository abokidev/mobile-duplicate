import { esc } from './html.js';

/**
 * REMINDER email (Admin Upload addendum §3).
 *
 * ⚠️ DRAFT COPY — PENDING ADEKUNLE'S APPROVAL. Unlike the initial email (whose
 * wording is fixed/approved), this reminder copy is newly written and must be
 * signed off before it is used, exactly as the original required approved wording.
 * The dashboard surfaces this "draft — not yet approved" status next to the button.
 *
 * It is deliberately shorter than the initial email, framed around urgency ahead
 * of the deadline, uses the SAME personal link, and keeps the same premium design
 * and tone. The only per-candidate variable is the shortlisted position list.
 */

export interface ReminderEmailInput {
  positionTitles: string[];
  selectionUrl: string;
  pixelUrl?: string;
}

function formatList(titles: string[]): string {
  const t = titles.map((s) => s.trim()).filter(Boolean);
  if (t.length <= 1) return t[0] ?? '';
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

export function reminderEmailSubject(): string {
  return 'Reminder: indicate your preferred position — ExxonMobil Affiliates in Nigeria';
}

export function reminderEmailHtml(input: ReminderEmailInput): string {
  const url = esc(input.selectionUrl);
  const titles = esc(formatList(input.positionTitles));
  const pixel = input.pixelUrl
    ? `<img src="${esc(input.pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`
    : '';

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<title>Reminder — Job Preferences</title>
<style>
  body { margin:0; padding:0; background:#f7f5f2; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  .btn:hover { background:#c11110 !important; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .cta { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f7f5f2;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f5f2;font-size:1px;line-height:1px;">
    A quick reminder to indicate your preferred position before the deadline.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e7e3dd;border-radius:16px;overflow:hidden;">
          <tr><td style="height:4px;background:#e71615;line-height:4px;font-size:4px;">&nbsp;</td></tr>
          <tr>
            <td class="px" style="padding:26px 40px 6px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#141414;font-weight:bold;">DRAGNET</td>
                  <td align="right" style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6f6a63;">ExxonMobil Affiliates in Nigeria</td>
                </tr>
              </table>
              <div style="height:1px;background:#e7e3dd;margin-top:18px;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:26px 40px 4px 40px;">
              <div style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e71615;font-weight:bold;">Reminder &nbsp;&middot;&nbsp; Action Still Required</div>
              <div style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:20px;color:#141414;margin:12px 0 2px 0;font-weight:bold;">Dear Applicant,</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:12px 40px 4px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.65;color:#242424;margin:0 0 16px 0;">
                Our records show you have not yet indicated your preferred position for the following:
                <strong style="color:#141414;">${titles}</strong>. This is a reminder to do so before the deadline.
              </p>
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.65;color:#242424;margin:0 0 20px 0;">
                Please use your personal link below to make your selection. It only takes a moment, and your
                choice can be submitted once.
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" align="center" style="padding:4px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" class="cta">
                <tr>
                  <td class="btn" bgcolor="#e71615" style="border-radius:10px;background:#e71615;">
                    <a class="btn" href="${url}" target="_blank" style="display:inline-block;padding:16px 38px;font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:16px;font-weight:bold;color:#ffffff;background:#e71615;border-radius:10px;letter-spacing:0.3px;">Indicate my preferred position &nbsp;&rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:12px 40px 4px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf8;border:1px solid #e7e3dd;border-left:3px solid #e71615;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.6;color:#242424;">
                    The deadline for submission is <strong style="color:#141414;">4pm WAT on Thursday, 20th August 2026</strong>.
                    No changes to a candidate's preferred position will be accommodated after this date and time.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:16px 40px 6px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:13px;line-height:1.6;color:#928d85;margin:0;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <a href="${url}" style="color:#c11110;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:14px 40px 6px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.6;color:#242424;margin:0;">Best regards,<br/><strong style="color:#141414;">Dragnet Solutions Limited</strong></p>
            </td>
          </tr>
          <tr><td style="padding:12px 40px 0 40px;"><div style="height:1px;background:#e7e3dd;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>
          <tr>
            <td class="px" style="padding:16px 40px 30px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:12px;line-height:1.6;color:#928d85;margin:0;">This link is personal to you — please do not forward it. Sent by Dragnet Solutions Limited on behalf of ExxonMobil Affiliates in Nigeria.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
  ${pixel}
</body>
</html>`;
}

export function reminderEmailText(input: ReminderEmailInput): string {
  const titles = formatList(input.positionTitles);
  return [
    `Dear Applicant,`,
    ``,
    `Our records show you have not yet indicated your preferred position for the following: ${titles}. This is a reminder to do so before the deadline.`,
    ``,
    `Please use your personal link below to make your selection. It only takes a moment, and your choice can be submitted once.`,
    ``,
    `Indicate your preferred position: ${input.selectionUrl}`,
    ``,
    `The deadline for submission is 4pm WAT on Thursday, 20th August 2026. No changes to a candidate's preferred position will be accommodated after this date and time.`,
    ``,
    `Best regards,`,
    `Dragnet Solutions Limited`,
  ].join('\n');
}
