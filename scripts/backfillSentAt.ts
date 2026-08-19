/**
 * One-time backfill of Token.sentAt for candidates who were already emailed before
 * the reliable send-marker existed.
 *
 *   npm run backfill:sent          # safe: only tokens with positive evidence of a send
 *   npm run backfill:sent -- --all # mark EVERY not-yet-marked token as sent
 *
 * Why: the "sent" status used to be a best-effort Event that could silently fail to
 * write (e.g. an unapplied migration), leaving `sentAt` null even though the email
 * was delivered. Without this backfill, the next "Send invitations" would re-email
 * those candidates (duplicates).
 *
 * Default (safe) marks a token sent when we have proof the email reached the person:
 * a `sent`/`opened`/`page_visited` event, or a recorded Selection (you cannot open,
 * visit, or submit without having received the tokenised link). `--all` additionally
 * marks tokens with no such evidence — use it only if you know a full send already
 * went out to everyone.
 */
import { prisma } from '../src/lib/db.js';

async function main() {
  const all = process.argv.includes('--all');

  const tokens = await prisma.token.findMany({
    where: { sentAt: null },
    include: { events: true, candidate: { select: { selection: { select: { selectedAt: true } } } } },
  });

  let marked = 0;
  let skipped = 0;

  for (const t of tokens) {
    const sentEvent = t.events.find((e) => e.type === 'sent');
    const evidenceTimes = [
      ...t.events
        .filter((e) => e.type === 'sent' || e.type === 'opened' || e.type === 'page_visited')
        .map((e) => e.occurredAt),
      ...(t.candidate.selection ? [t.candidate.selection.selectedAt] : []),
    ];
    const hasEvidence = evidenceTimes.length > 0;

    if (!hasEvidence && !all) {
      skipped++;
      continue;
    }

    const sentAt = hasEvidence
      ? evidenceTimes.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b))
      : t.createdAt;

    await prisma.token.update({
      where: { id: t.id },
      data: { sentAt, sentTemplate: sentEvent?.messageTemplate ?? null },
    });
    marked++;
  }

  console.log(`Backfill complete (${all ? 'ALL mode' : 'evidence-only'}):`);
  console.log(`  tokens marked sent: ${marked}`);
  console.log(`  left unmarked (no evidence): ${skipped}`);
  if (skipped > 0 && !all) {
    console.log(`  → re-run with --all to also mark these, if a full send already went out.`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
