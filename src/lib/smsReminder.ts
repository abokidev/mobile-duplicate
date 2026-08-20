/**
 * SMS reminder copy (SMS Reminder addendum §5). APPROVED by the client.
 * The link is the SAME personal token URL used in email (no SMS-only token).
 */
export function smsReminderText(selectionUrl: string): string {
  return (
    `ExxonMobil Affiliates in Nigeria: You haven't yet selected your test position. ` +
    `Select now: ${selectionUrl} — Dragnet Solutions`
  );
}
