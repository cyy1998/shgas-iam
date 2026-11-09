import type { DbClient } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates, userDocuments, users } from "@iam/db/schema";
import { asc } from "drizzle-orm";
import { z } from "zod";
import { UserDocumentOutboxSourceSchema } from "../invalidation/user-document-source";
import type { UserDocumentGateFailure } from "./user-document-readiness";

const requestsSchema = z.array(
  z.strictObject({
    targetId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    version: z.string().regex(/^[1-9]\d*$/u),
  }),
);

/** Inspect durable obligations, independently of transport and without changing their state. */
export async function verifyUserDocumentWork(db: DbClient, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const source = await db.select({ id: users.id, deleted: users.isDelete }).from(users).orderBy(asc(users.id));
  signal?.throwIfAborted();
  const documents = await db.select().from(userDocuments).orderBy(asc(userDocuments.userId));
  signal?.throwIfAborted();
  const states = await db.select().from(userDocumentRebuildStates).orderBy(asc(userDocumentRebuildStates.userId));
  signal?.throwIfAborted();
  const outbox = await db.select().from(userDocumentOutboxEntries).orderBy(asc(userDocumentOutboxEntries.id));
  signal?.throwIfAborted();
  const sourceIds = new Set(source.map(({ id }) => id));
  const statesById = new Map(states.map((row) => [row.userId, row]));
  const documentsById = new Map(documents.map((row) => [row.userId, row]));
  const failures = new Map<string, UserDocumentGateFailure>();
  function fail(code: string, sample: string) {
    const failure = failures.get(code) ?? { code, count: 0, samples: [] };
    failure.count += 1;
    if (failure.samples.length < 10) failure.samples.push(sample);
    failures.set(code, failure);
  }
  for (const row of source) {
    if (!statesById.has(row.id)) fail("missing-rebuild-state", `user:${row.id}`);
  }
  for (const row of states) {
    const sample = `user:${row.userId}`;
    if (!sourceIds.has(row.userId)) fail("orphan-rebuild-state", sample);
    if (row.status !== "processed") fail("unprocessed-rebuild-state", sample);
    else if (!hasCompletedReceipt(row)) fail("invalid-rebuild-receipt", sample);
    if (row.postPublicationStatus !== "processed") fail("post-publication-incomplete", sample);
    else if (
      row.postPublicationVersion !== documentsById.get(row.userId)?.sourceVersion ||
      row.postPublicationCompletedAt === null ||
      row.postPublicationToken !== null ||
      row.postPublicationStartedAt !== null ||
      row.postPublicationError !== null
    )
      fail("invalid-post-publication-receipt", sample);
  }
  for (const row of outbox) {
    const sample = `outbox:${row.id}`;
    const sourceResult = UserDocumentOutboxSourceSchema.safeParse(row.source);
    if (!sourceResult.success) fail("invalid-outbox-source", sample);
    const change = sourceResult.success ? sourceResult.data.change : undefined;
    const directUserId = change && "userId" in change ? change.userId : undefined;
    if (directUserId !== undefined && !sourceIds.has(directUserId)) fail("orphan-outbox", sample);
    if (row.status !== "processed") {
      fail("unprocessed-outbox", sample);
      continue;
    }
    const requests = requestsSchema.safeParse(row.rebuildRequests);
    if (
      !hasCompletedReceipt(row) ||
      !requests.success ||
      (requests.success && new Set(requests.data.map(({ targetId }) => targetId)).size !== requests.data.length) ||
      (directUserId !== undefined &&
        requests.success &&
        (requests.data.length !== 1 || requests.data[0]?.targetId !== directUserId))
    )
      fail("invalid-outbox-receipt", sample);
    if (
      requests.success &&
      requests.data.some(({ targetId, version }) => {
        const state = statesById.get(targetId);
        const document = documentsById.get(targetId);
        return (
          !state ||
          !document ||
          BigInt(state.version) < BigInt(version) ||
          BigInt(document.sourceVersion) < BigInt(version)
        );
      })
    )
      fail("unfulfilled-outbox", sample);
  }
  return {
    workFailures: [...failures.values()],
    workCounts: {
      deletedUsers: source.filter(({ deleted }) => deleted).length,
      tombstones: documents.filter(({ document }) => document === null).length,
      rebuildStates: states.length,
      outbox: outbox.length,
    },
  };
}

function hasCompletedReceipt(row: {
  processedAt: Date | null;
  processingToken: string | null;
  processingStartedAt: Date | null;
  lastError: string | null;
}) {
  return (
    row.processedAt !== null &&
    row.processingToken === null &&
    row.processingStartedAt === null &&
    row.lastError === null
  );
}
