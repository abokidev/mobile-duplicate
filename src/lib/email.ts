import { esc } from './html.js';

/**
 * Candidate email (Email Copy Correction Addendum).
 *
 * The body copy is FIXED and APPROVED — it must appear verbatim, not paraphrased.
 * The premium HTML design (letterhead, red accent bar, red CTA, deadline callout,
 * footer) is preserved and the approved copy is poured into it.
 *
 * The only per-candidate variables are:
 *   - the greeting: "Dear Applicant," (confirmed with Adekunle — no personalization),
 *   - the shortlisted position titles inserted into paragraph 1 and the subject.
 *
 * Dates inside the copy ("Saturday, 29th August 2026", "4pm WAT on Thursday, 20th
 * August 2026") are part of the approved wording and are intentionally literal here,
 * not pulled from config. (The instructions PAGE keeps its own copy via env.)
 */

export interface CandidateEmailInput {
  /** The candidate's own shortlisted position titles (NOT the full 7). */
  positionTitles: string[];
  selectionUrl: string;
}

/** Natural-language list join, e.g. ["A"]→"A", ["A","B"]→"A and B", ["A","B","C"]→"A, B and C". */
export function formatPositionList(titles: string[]): string {
  const t = titles.map((s) => s.trim()).filter(Boolean);
  if (t.length === 0) return '';
  if (t.length === 1) return t[0];
  if (t.length === 2) return `${t[0]} and ${t[1]}`;
  return `${t.slice(0, -1).join(', ')} and ${t[t.length - 1]}`;
}

export function candidateEmailSubject(positionTitles: string[]): string {
  // Original supplied subject with the job title(s) substituted.
  return `ExxonMobil Affiliates in Nigeria ${formatPositionList(positionTitles)} Job Preferences`;
}

/**
 * Fully designed, table-based, mobile-responsive HTML candidate email.
 * Colours are inlined (email clients strip <style>/classes unreliably); the
 * <style> block carries only the responsive @media rules.
 */
export function candidateEmailHtml(input: CandidateEmailInput): string {
  const url = esc(input.selectionUrl);
  const titles = esc(formatPositionList(input.positionTitles));

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>ExxonMobil Affiliates in Nigeria — Job Preferences</title>
<style>
  body { margin:0; padding:0; background:#f7f5f2; }
  table { border-collapse:collapse; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; }
  a { text-decoration:none; }
  .btn:hover { background:#c11110 !important; }
  @media only screen and (max-width:620px) {
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .btn-td { display:block !important; }
    .cta { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f7f5f2;">
  <!-- Preheader (hidden) -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f5f2;font-size:1px;line-height:1px;">
    You have been shortlisted. Please indicate your preferred position before the deadline.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f2;">
    <tr>
      <td align="center" style="padding:28px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid #e7e3dd;border-radius:16px;overflow:hidden;">

          <!-- Red accent bar -->
          <tr><td style="height:4px;background:#e71615;line-height:4px;font-size:4px;">&nbsp;</td></tr>

          <!-- Letterhead -->
          <tr>
            <td class="px" style="padding:26px 40px 6px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;color:#141414;font-weight:bold;">
                    DRAGNET
                  </td>
                  <td align="right" style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#6f6a63;">
                    ExxonMobil Affiliates in Nigeria
                  </td>
                </tr>
              </table>
              <div style="height:1px;background:#e7e3dd;margin-top:18px;line-height:1px;font-size:1px;">&nbsp;</div>
            </td>
          </tr>

          <!-- Eyebrow + salutation -->
          <tr>
            <td class="px" style="padding:26px 40px 4px 40px;">
              <div style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#e71615;font-weight:bold;">
                Position Preference &nbsp;&middot;&nbsp; Action Required
              </div>
              <div style="font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:20px;color:#141414;margin:12px 0 2px 0;font-weight:bold;">
                Dear Applicant,
              </div>
            </td>
          </tr>

          <!-- Approved body copy (verbatim) -->
          <tr>
            <td class="px" style="padding:12px 40px 4px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.65;color:#242424;margin:0 0 16px 0;">
                Further to your application to ExxonMobil Affiliates in Nigeria for the following positions:
                <strong style="color:#141414;">${titles}</strong>, you have been shortlisted to
                complete an online computer-based aptitude and skills test on Saturday, 29th August 2026
                as part of the selection process.
              </p>
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.65;color:#242424;margin:0 0 16px 0;">
                Candidates who applied for multiple positions are to take the test for only one position
                i.e. any candidate who takes the aptitude test more than once will be disqualified.
              </p>
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.65;color:#242424;margin:0 0 20px 0;">
                Please take a moment to indicate your preferred position using the button below. Do not
                indicate a position that you have not been shortlisted for.
              </p>
            </td>
          </tr>

          <!-- CTA -->
          <tr>
            <td class="px" align="center" style="padding:4px 40px 8px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" class="cta">
                <tr>
                  <td class="btn" bgcolor="#e71615" style="border-radius:10px;background:#e71615;">
                    <a class="btn" href="${url}" target="_blank"
                       style="display:inline-block;padding:16px 38px;font-family:'Century Gothic','Futura','Trebuchet MS',sans-serif;font-size:16px;font-weight:bold;color:#ffffff;background:#e71615;border-radius:10px;letter-spacing:0.3px;">
                      Indicate my preferred position &nbsp;&rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- N.B. (verbatim) -->
          <tr>
            <td class="px" style="padding:16px 40px 4px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.65;color:#242424;margin:0 0 8px 0;">
                <strong style="color:#141414;">N.B:</strong> The testing session will be conducted online,
                requiring a camera and microphone-enabled PC with a stable network connection. The session
                will also be remotely monitored, and there will be an audio-visual recording. Therefore, it
                is important to dress professionally during the session.
              </p>
            </td>
          </tr>

          <!-- Deadline callout box (verbatim deadline paragraph) -->
          <tr>
            <td class="px" style="padding:10px 40px 4px 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fbfaf8;border:1px solid #e7e3dd;border-left:3px solid #e71615;border-radius:10px;">
                <tr>
                  <td style="padding:14px 18px;font-family:Calibri,Arial,sans-serif;font-size:15px;line-height:1.6;color:#242424;">
                    Please note that the deadline for submission is
                    <strong style="color:#141414;">4pm WAT on Thursday, 20th August 2026</strong>. No changes
                    to a candidate's preferred position will be accommodated after this date and time.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Fallback link -->
          <tr>
            <td class="px" style="padding:16px 40px 6px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:13px;line-height:1.6;color:#928d85;margin:0;">
                If the button does not work, copy and paste this link into your browser:<br/>
                <a href="${url}" style="color:#c11110;word-break:break-all;">${url}</a>
              </p>
            </td>
          </tr>

          <!-- Closing (verbatim) -->
          <tr>
            <td class="px" style="padding:14px 40px 6px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.6;color:#242424;margin:0;">
                Best regards,<br/>
                <strong style="color:#141414;">Dragnet Solutions Limited</strong>
              </p>
            </td>
          </tr>

          <tr><td style="padding:12px 40px 0 40px;"><div style="height:1px;background:#e7e3dd;line-height:1px;font-size:1px;">&nbsp;</div></td></tr>

          <!-- Footer (design chrome) -->
          <tr>
            <td class="px" style="padding:16px 40px 30px 40px;">
              <p style="font-family:Calibri,Arial,sans-serif;font-size:12px;line-height:1.6;color:#928d85;margin:0;">
                This link is personal to you — please do not forward it. Sent by Dragnet Solutions Limited on
                behalf of ExxonMobil Affiliates in Nigeria.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plaintext fallback part — same approved copy, verbatim. */
export function candidateEmailText(input: CandidateEmailInput): string {
  const titles = formatPositionList(input.positionTitles);
  return [
    `Dear Applicant,`,
    ``,
    `Further to your application to ExxonMobil Affiliates in Nigeria for the following positions: ${titles}, you have been shortlisted to complete an online computer-based aptitude and skills test on Saturday, 29th August 2026 as part of the selection process.`,
    ``,
    `Candidates who applied for multiple positions are to take the test for only one position i.e. any candidate who takes the aptitude test more than once will be disqualified.`,
    ``,
    `Please take a moment to indicate your preferred position using the button below. Do not indicate a position that you have not been shortlisted for.`,
    ``,
    `Indicate your preferred position: ${input.selectionUrl}`,
    ``,
    `N.B: The testing session will be conducted online, requiring a camera and microphone-enabled PC with a stable network connection. The session will also be remotely monitored, and there will be an audio-visual recording. Therefore, it is important to dress professionally during the session.`,
    ``,
    `Please note that the deadline for submission is 4pm WAT on Thursday, 20th August 2026. No changes to a candidate's preferred position will be accommodated after this date and time.`,
    ``,
    `Best regards,`,
    `Dragnet Solutions Limited`,
  ].join('\n');
}
