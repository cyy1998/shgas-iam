import { expect } from "bun:test";
import type { RebuildUserDocumentJobPayload } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates } from "@iam/db/schema";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentUpdateProcessor,
} from "@iam/documents/user/worker";
import { eq, sql } from "drizzle-orm";

/** Consume the real committed Outbox stage at the external queue seam. Rebuild delivery remains controlled by each test. */
export function createUserDocumentSourceConsumer(
  db: typeof database,
  enqueueRebuildJobs: (payloads: RebuildUserDocumentJobPayload[]) => Promise<{ enqueued: number; jobIds: string[] }>,
  clock = { nowDate: () => new Date() },
) {
  const producer = {
    enqueueRebuildJobs,
    async enqueueOutboxEntries(payloads: Array<{ outboxId: string }>) {
      for (const payload of payloads) await processor.processOutbox(payload);
      return { enqueued: payloads.length, jobIds: payloads.map(({ outboxId }) => outboxId) };
    },
  };
  const processor = createUserDocumentUpdateProcessor({
    db,
    jobProducer: producer,
    projection: createCurrentUserDocumentProjectionBundle(),
    clock,
    batchSize: 500,
    logger: { warn() {} },
    subjectFactsPublisher: {
      async publish() {
        throw new Error("Source-only fixture must not publish Facts");
      },
    },
    subjectAccessRepair: {
      async repairSubject() {
        throw new Error("Source-only fixture must not repair Subject Access");
      },
    },
  });
  return producer;
}

export async function expectCompletedUserDocumentSources(
  db: typeof database,
  userId: number,
  requiredKinds: string[] = [],
) {
  const entries = await db
    .select({
      status: userDocumentOutboxEntries.status,
      requests: userDocumentOutboxEntries.rebuildRequests,
      kind: sql<string>`${userDocumentOutboxEntries.source}->'change'->>'kind'`,
    })
    .from(userDocumentOutboxEntries)
    .where(sql`${userDocumentOutboxEntries.source} @> ${JSON.stringify({ change: { userId } })}::jsonb`);
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every(({ status }) => status === "processed")).toBe(true);
  expect(entries.map(({ kind }) => kind)).toEqual(expect.arrayContaining(requiredKinds));
  const requests = entries.flatMap(({ requests }) => requests).filter(({ targetId }) => targetId === userId);
  expect(requests.length).toBeGreaterThan(0);
  const latest = requests.reduce(
    (version, request) => (BigInt(request.version) > BigInt(version) ? request.version : version),
    "0",
  );
  const [state] = await db.select().from(userDocumentRebuildStates).where(eq(userDocumentRebuildStates.userId, userId));
  expect(state?.version).toBe(latest);
}
