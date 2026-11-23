import { expect } from "bun:test";
import type { RebuildUserDocumentJobPayload } from "@iam/contracts";
import type { db as database } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates } from "@iam/db/schema";
import { createUserDocumentSearchRepository, createUserDocumentSearchService } from "@iam/documents/user/query";
import type { DocumentFactsCacheRecord } from "@iam/documents/user/subject-facts";
import {
  createCurrentUserDocumentProjectionBundle,
  createUserDocumentUpdateProcessor,
} from "@iam/documents/user/worker";
import { eq, sql } from "drizzle-orm";

export function createUserDocumentPublicationFixture(db: typeof database) {
  const sourceJobs: { outboxId: string }[] = [];
  const rebuildJobs: RebuildUserDocumentJobPayload[] = [];
  const facts = new Map<string, DocumentFactsCacheRecord>();
  const processor = createUserDocumentUpdateProcessor({
    db,
    projection: createCurrentUserDocumentProjectionBundle(),
    clock: { nowDate: () => new Date() },
    batchSize: 100,
    logger: { warn() {} },
    jobProducer: {
      async enqueueOutboxEntries(payloads) {
        sourceJobs.push(...payloads);
        return { enqueued: payloads.length, jobIds: payloads.map(({ outboxId }) => outboxId) };
      },
      async enqueueRebuildJobs(payloads) {
        rebuildJobs.push(...payloads);
        return { enqueued: payloads.length, jobIds: payloads.map(({ userId }) => String(userId)) };
      },
    },
    subjectFactsPublisher: {
      async publish(record) {
        facts.set(record.subjectIdentifier, record);
        return { status: "published" };
      },
    },
    subjectAccessRepair: {
      async repairSubject() {},
    },
  });
  const query = createUserDocumentSearchService({ documentRepository: createUserDocumentSearchRepository(db) });
  const repair = { staleBefore: new Date(0), limit: 20 };
  return {
    facts,
    async publishPending() {
      const recovery = await processor.repairFailedOrStale(repair);
      expect(recovery.failed).toBe(0);
      for (const payload of sourceJobs.splice(0)) await processor.processOutbox(payload);
      const jobs = rebuildJobs.splice(0);
      for (const payload of jobs) await processor.process(payload);
      return [...new Set(jobs.map(({ userId }) => userId))].sort((a, b) => a - b);
    },
    async get(username: string) {
      const { items } = await query.searchDocuments(
        {
          filter: { field: "username", op: "eq", value: username },
          select: ["subjectIdentifier", "customAttributes", "employments"],
        },
        "directory",
      );
      const [item] = items;
      if (items.length !== 1 || !item) throw new Error(`Expected one User Document for ${username}`);
      return item;
    },
  };
}

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
