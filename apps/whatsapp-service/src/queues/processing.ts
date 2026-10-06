import { and, eq } from "drizzle-orm";
import { agentRun, message, outboxIntent } from "@video-editor-agent/db/schema";
import type { MessagingDatabase } from "../runtime/database.ts";
import type { ProcessingJob } from "../env.ts";

export class InvalidProcessingJob extends Error {}

export function parseProcessingJob(value: unknown): ProcessingJob {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidProcessingJob();
  const job = value as Record<string, unknown>;
  if (job.version !== 1 || typeof job.messageId !== "string" || !job.messageId.length || job.messageId.length > 256
    || Object.keys(job).some(key => key !== "version" && key !== "messageId")) throw new InvalidProcessingJob();
  return { version: 1, messageId: job.messageId };
}

export async function enqueueAgentRun(db: MessagingDatabase, job: ProcessingJob): Promise<"pending" | "deleted"> {
  return db.transaction(async tx => {
    // Hold a shared lock until commit so user erasure cannot race run creation.
    const [incoming] = await tx.select().from(message).where(eq(message.id, job.messageId)).for("share");
    if (!incoming) return "deleted"; // A valid delayed job can outlive whole-user erasure.
    if (incoming.direction !== "inbound") throw new InvalidProcessingJob();
    const [intent] = await tx.select({ id: outboxIntent.id }).from(outboxIntent).where(and(
      eq(outboxIntent.messageId, incoming.id), eq(outboxIntent.kind, "processing"),
    ));
    // Publication status is NOT required: consumption may precede the publisher's update.
    if (!intent) throw new InvalidProcessingJob();
    await tx.insert(agentRun).values({ id: crypto.randomUUID(), incomingMessageId: incoming.id })
      .onConflictDoNothing({ target: agentRun.incomingMessageId });
    return "pending";
  });
}

interface QueueItem {
  body: unknown;
  ack(): void;
  retry(options?: { delaySeconds?: number }): void;
}

// Failures are isolated per item. Invalid messages retry to the configured DLQ;
// never acknowledge malformed work as though it had been successfully processed.
export async function consumeProcessingBatch(
  batch: { messages: readonly QueueItem[] },
  persist: (job: ProcessingJob) => Promise<unknown>,
): Promise<void> {
  for (const item of batch.messages) {
    try {
      await persist(parseProcessingJob(item.body));
      item.ack();
    } catch (error) {
      console.error(error instanceof InvalidProcessingJob ? "whatsapp.invalid_processing_job" : "whatsapp.processing_handoff_failed");
      item.retry({ delaySeconds: error instanceof InvalidProcessingJob ? 0 : 30 });
    }
  }
}
