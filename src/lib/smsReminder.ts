/**
 * SMS reminder copy (SMS Reminder addendum §5).
 *
 * ⚠️ DRAFT — pending Adekunle's sign-off, same governance as the email copy.
 * SMS has a hard length limit, so this is a condensed message, not the email copy.
 * The link is the SAME personal token URL used in email (no SMS-only token).
 */
export function smsReminderText(selectionUrl: string): string {
  return (
    `ExxonMobil Affiliates in Nigeria: You haven't yet selected your test position. ` +
    `Deadline 4pm WAT, Thu 20 Aug. Select now: ${selectionUrl} — Dragnet Solutions`
  );
}
