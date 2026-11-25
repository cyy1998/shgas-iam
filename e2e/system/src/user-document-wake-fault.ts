import { UserDocumentJobName } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import { userDocumentOutboxEntries } from "@iam/db/schema";
import type { UserDocumentSourceChange } from "@iam/documents/user/producer";
import type { BullMqRedisConfig } from "@iam/jobs";
import { createUserDocumentWriteResources } from "@iam/jobs/documents/user";
import { and, eq, sql } from "drizzle-orm";

export function createUserDocumentWakeFault(options: { db: DbClient; redis: BullMqRedisConfig }) {
  const { queue, close } = createUserDocumentWriteResources({ redis: options.redis, logger: console });
  return {
    close,
    // The caller must stop the Worker in its dedicated test project before injecting the fault.
    async dropWaitingAttributeDefinitionWake(attributeCode: string, signal: AbortSignal) {
      const change = {
        kind: "custom-attribute-definition",
        entityType: "user",
        attributeCode,
      } satisfies UserDocumentSourceChange;
      signal.throwIfAborted();
      const pending = await options.db
        .select({ id: userDocumentOutboxEntries.id })
        .from(userDocumentOutboxEntries)
        .where(
          and(
            eq(userDocumentOutboxEntries.status, "pending"),
            sql`${userDocumentOutboxEntries.source} @> ${JSON.stringify({ change })}::jsonb`,
          ),
        )
        .limit(2);
      const [entry] = pending;
      if (!entry || pending.length !== 1)
        throw new Error("Expected exactly one pending User Document outbox entry for the definition");

      signal.throwIfAborted();
      await queue.waitUntilReady();
      const jobs = await queue.getJobs(["waiting"]);
      const wakes = jobs.filter(
        (job) =>
          job.name === UserDocumentJobName.ExpandUserDocumentOutbox &&
          "outboxId" in job.data &&
          job.data.outboxId === entry.id,
      );
      const [wake] = wakes;
      if (!wake || wakes.length !== 1) throw new Error("Expected exactly one waiting job for the pending outbox entry");
      signal.throwIfAborted();
      await wake.remove();
    },
  };
}
