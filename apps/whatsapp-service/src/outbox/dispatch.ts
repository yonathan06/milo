import { and, eq, lte, or, sql } from "drizzle-orm";
import { outboxIntent } from "@video-editor-agent/db/schema";
import type { MessagingDatabase } from "../runtime/database.ts";
import type { Env } from "../env.ts";

export async function dispatchProcessing(db: MessagingDatabase, queue: Env["PROCESSING_QUEUE"]): Promise<number> {
  const claimed = await db.transaction(async tx => {
    const now = new Date();
    const due = await tx.select().from(outboxIntent).where(and(
      eq(outboxIntent.kind, "processing"),
      or(and(eq(outboxIntent.status, "pending"), lte(outboxIntent.nextAttemptAt, now)),
        and(eq(outboxIntent.status, "claimed"), lte(outboxIntent.leaseExpiresAt, now))),
    )).orderBy(outboxIntent.createdAt).limit(25).for("update", { skipLocked: true });
    const rows: (typeof outboxIntent.$inferSelect)[] = [];
    for (const intent of due) {
      const [row] = await tx.update(outboxIntent).set({ status: "claimed", claimToken: crypto.randomUUID(),
        leaseExpiresAt: new Date(now.getTime() + 300_000), attemptCount: sql`${outboxIntent.attemptCount} + 1` })
        .where(eq(outboxIntent.id, intent.id)).returning();
      rows.push(row!);
    }
    return rows;
  });
  let published = 0;
  for (const intent of claimed) {
    // A slow batch must not knowingly publish work whose lease has expired.
    if (intent.leaseExpiresAt!.getTime() <= Date.now()) continue;
    const owned = and(eq(outboxIntent.id, intent.id), eq(outboxIntent.status, "claimed"), eq(outboxIntent.claimToken, intent.claimToken!));
    try {
      await queue.send({ version: 1, messageId: intent.messageId });
    } catch {
      await db.update(outboxIntent).set({ status: "pending", claimToken: null, leaseExpiresAt: null,
        nextAttemptAt: new Date(Date.now() + Math.min(300_000, 1000 * 2 ** Math.min(intent.attemptCount, 8))),
        lastErrorCode: "queue_publication_failed" }).where(owned);
      continue;
    }
    // If this update fails after publication, leave the lease recoverable. Another
    // publication is possible; downstream logical-run deduplication is mandatory.
    const updated = await db.update(outboxIntent).set({ status: "published", publishedAt: new Date(),
      claimToken: null, leaseExpiresAt: null, lastErrorCode: null }).where(owned).returning({ id: outboxIntent.id });
    published += updated.length;
  }
  return published;
}
