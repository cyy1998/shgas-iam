import { randomUUID } from "node:crypto";
import {
  MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE,
  type RebuildUserDocumentJobPayload,
  RebuildUserDocumentJobPayloadSchema,
  UserDocumentRebuildReason,
} from "@iam/contracts";
import type { DbTransaction, db as database } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates } from "@iam/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import {
  createDocumentUpdateProcessor,
  type DocumentBuildResult,
  type DocumentRebuildRequest,
  type DocumentRepairOptions,
  type PreparedDocumentPublication,
} from "../../update";
import type { PublishedUserDocument } from "../document";
import type { UserDocumentJobProducer } from "../invalidation/user-document-job.producer";
import {
  expandUserDocumentSource,
  type UserDocumentOutboxSource,
  UserDocumentOutboxSourceSchema,
  userDocumentSourceReason,
} from "../invalidation/user-document-source";
import { createUserDocumentMaintenanceRepository } from "./user-document-maintenance.repository";
import { createUserDocumentPostPublicationProcessor } from "./user-document-post-publication.processor";
import type { UserDocumentProjectionBundle } from "./user-document-projection";
import type { SubjectAccessRepairPort, UserDocumentRebuildLoggerPort } from "./user-document-rebuild.processor";

// Bound target parameters independently of the document builder's batch size.
const SQL_TARGET_BATCH_SIZE = 1_000;

export interface UserDocumentUpdateInput<
  TDocument extends PublishedUserDocument,
  TFacts extends { subjectIdentifier: string; sourceVersion: string },
> {
  db: typeof database;
  projection: UserDocumentProjectionBundle<TDocument, TFacts>;
  jobProducer: UserDocumentJobProducer;
  subjectFactsPublisher: { publish(record: TFacts): Promise<{ status: "published" | "retained-newer" }> };
  subjectAccessRepair: SubjectAccessRepairPort;
  logger: UserDocumentRebuildLoggerPort;
  clock: { nowDate(): Date };
  batchSize: number;
}

export function createUserDocumentUpdateProcessor<
  TDocument extends PublishedUserDocument,
  TFacts extends { subjectIdentifier: string; sourceVersion: string },
>(input: UserDocumentUpdateInput<TDocument, TFacts>) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1)
    throw new RangeError("User Document rebuild requires a positive safe batch size");
  const batchSize = Math.min(input.batchSize, MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE);
  async function enqueueRebuilds(requests: DocumentRebuildRequest[]) {
    if (!requests.length) return { enqueued: 0 };
    const rows = new Map<number, typeof userDocumentRebuildStates.$inferSelect>();
    for (let offset = 0; offset < requests.length; offset += SQL_TARGET_BATCH_SIZE) {
      const metadata = await input.db
        .select()
        .from(userDocumentRebuildStates)
        .where(
          inArray(
            userDocumentRebuildStates.userId,
            requests.slice(offset, offset + SQL_TARGET_BATCH_SIZE).map(({ targetId }) => targetId),
          ),
        );
      for (const row of metadata) rows.set(row.userId, row);
    }
    return await input.jobProducer.enqueueRebuildJobs(
      requests.map(({ targetId, version }) => {
        const row = rows.get(targetId);
        return {
          userId: targetId,
          version: version,
          reason: row?.reasonCodes[0] ?? UserDocumentRebuildReason.ManualRebuild,
          requestedAt: (row?.dirtyAt ?? input.clock.nowDate()).toISOString(),
          ...(row?.requestId ? { requestId: row.requestId } : {}),
          ...(row?.traceId ? { traceId: row.traceId } : {}),
        };
      }),
    );
  }

  async function recordRebuildMetadata(
    tx: DbTransaction,
    requests: readonly DocumentRebuildRequest[],
    metadata: { reason: UserDocumentRebuildReason; requestId?: string; traceId?: string },
  ) {
    for (let offset = 0; offset < requests.length; offset += SQL_TARGET_BATCH_SIZE) {
      await tx
        .update(userDocumentRebuildStates)
        .set({
          reasonCodes: [metadata.reason],
          requestId: metadata.requestId ?? null,
          traceId: metadata.traceId ?? null,
        })
        .where(
          inArray(
            userDocumentRebuildStates.userId,
            requests.slice(offset, offset + SQL_TARGET_BATCH_SIZE).map(({ targetId }) => targetId),
          ),
        );
    }
  }

  const postPublication = createUserDocumentPostPublicationProcessor({
    db: input.db,
    projection: input.projection,
    subjectFactsPublisher: input.subjectFactsPublisher,
    subjectAccessRepair: input.subjectAccessRepair,
    logger: input.logger,
    clock: input.clock,
    batchSize,
  });

  const processor = createDocumentUpdateProcessor({
    db: input.db,
    clock: input.clock,
    tables: {
      outbox: userDocumentOutboxEntries,
      source: sql<UserDocumentOutboxSource>`${userDocumentOutboxEntries.source}`,
      rebuildState: userDocumentRebuildStates,
      targetId: userDocumentRebuildStates.userId,
      requestedAt: userDocumentRebuildStates.dirtyAt,
    },
    parseSource: (source) => UserDocumentOutboxSourceSchema.parse(source),
    expand: async (tx, source, observedAt) => await expandUserDocumentSource(tx, source.change, observedAt),
    async registered(tx, source, requests) {
      await recordRebuildMetadata(tx, requests, {
        reason: source.reason ?? userDocumentSourceReason(source.change.kind),
        requestId: source.requestId,
        traceId: source.traceId,
      });
    },
    async build(userId, version) {
      const observedAt = input.clock.nowDate();
      return await input.db.transaction(
        async (tx) => {
          const built = await input.projection
            .createBuilder({ db: tx, clock: { nowDate: () => observedAt }, batchSize: input.batchSize })
            .buildOne({ userId, sourceVersion: version });
          if (built === null) throw new Error("User Document source is missing");
          return built;
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async buildMany(tx, requests, observedAt) {
      const results = await input.projection
        .createBuilder({ db: tx, clock: { nowDate: () => observedAt }, batchSize })
        .buildManyResults(requests.map(({ targetId, version }) => ({ userId: targetId, sourceVersion: version })));
      return results.map((result): DocumentBuildResult<TDocument> => {
        const identity = { targetId: result.userId, version: result.sourceVersion };
        if (result.status === "failed") return { ...identity, status: "failed", error: result.error };
        if (result.status !== "built") throw new Error("User Document batch result status is invalid");
        try {
          const document = input.projection.parseDocumentRow(result.document);
          if (document.userId !== result.userId || document.sourceVersion !== result.sourceVersion)
            throw new Error("User Document candidate identity or version mismatch");
          return { ...identity, status: "built", document };
        } catch (error) {
          return { ...identity, status: "failed", error };
        }
      });
    },
    async publish(tx, prepared) {
      const profile = input.projection.parseDocumentRow(prepared.document);
      if (profile.userId !== prepared.targetId || profile.sourceVersion !== prepared.version)
        throw new Error("User Document candidate identity or version mismatch");
      const published = await input.projection.createRowRepository(tx).upsert(profile);
      if (!published) throw new Error("User Document publication is older than stored version");
      await tx
        .update(userDocumentRebuildStates)
        .set({
          postPublicationVersion: prepared.version,
          postPublicationStatus: "pending",
          postPublicationToken: null,
          postPublicationStartedAt: null,
          postPublicationCompletedAt: null,
          postPublicationError: null,
          postPublicationAttempts: 0,
        })
        .where(eq(userDocumentRebuildStates.userId, prepared.targetId));
    },
    async publishMany(tx, prepared) {
      const profiles = prepared.map((candidate) => {
        const profile = input.projection.parseDocumentRow(candidate.document);
        if (profile.userId !== candidate.targetId || profile.sourceVersion !== candidate.version)
          throw new Error("User Document candidate identity or version mismatch");
        return profile;
      });
      const written = await input.projection.createRowRepository(tx).upsertMany(profiles);
      if (written.length) {
        const registered = await tx.execute<{ userId: number }>(sql`UPDATE ${userDocumentRebuildStates} AS state SET
          post_publication_version=state.version, post_publication_status='pending',
          post_publication_token=NULL, post_publication_started_at=NULL,
          post_publication_completed_at=NULL, post_publication_error=NULL, post_publication_attempts=0
          WHERE state.user_id IN (${sql.join(
            written.map((userId) => sql`${userId}`),
            sql`, `,
          )})
          RETURNING state.user_id AS "userId"`);
        return registered.map(({ userId }) => userId);
      }
      return written;
    },
    afterPublish: async (prepared) => {
      await postPublication.process(prepared.targetId, prepared.version);
    },
    jobProducer: { enqueueOutboxEntries: input.jobProducer.enqueueOutboxEntries, enqueueRebuilds },
  });

  async function processBatch(payloads: RebuildUserDocumentJobPayload[]) {
    if (!payloads.length || payloads.length > MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE)
      throw new RangeError("User Document batch requires a bounded non-empty request list");
    // Validate every request before acquiring any ownership.
    const requests = payloads.map((payload) => {
      const parsed = RebuildUserDocumentJobPayloadSchema.parse(payload);
      return { targetId: parsed.userId, version: parsed.version };
    });
    const postReport = { completed: 0, skipped: 0, failed: 0, exhausted: 0 };
    const report = await processor.processRebuildBatch(requests, {
      batchSize,
      async onPublished(published) {
        const effects = await postPublication.processMany(
          published.map(({ targetId: userId, version }) => ({ userId, version })),
        );
        postReport.completed += effects.completed;
        postReport.skipped += effects.skipped;
        postReport.failed += effects.failed;
        postReport.exhausted += effects.exhausted;
      },
    });
    if (report.failures.length) throw new AggregateError(report.failures, "User Document batch rebuild failed");
    return {
      status: "rebuilt" as const,
      requested: report.requested,
      rebuilt: report.rebuilt,
      skipped: report.skipped,
      stale: report.stale,
      postPublication: postReport,
    };
  }

  return {
    processOutbox: processor.processOutbox,
    prepareRebuild: processor.prepareRebuild,
    async publishPrepared(prepared: PreparedDocumentPublication<TDocument>) {
      const report = await processor.publishPreparedBatch([prepared]);
      for (const published of report.published) await postPublication.process(published.targetId, published.version);
      if (report.failed.length)
        throw new AggregateError(
          report.failed.map(({ error }) => error),
          "User Document publication failed",
        );
      return { status: report.published.length ? ("published" as const) : ("stale" as const) };
    },
    processBatch,
    async backfillAllUsers(options: { batchSize?: number; signal?: AbortSignal } = {}) {
      const batchSize = options.batchSize ?? input.batchSize;
      if (!Number.isSafeInteger(batchSize) || batchSize < 1)
        throw new RangeError("User Document backfill requires a positive safe batch size");
      const source = createUserDocumentMaintenanceRepository(input.db);
      let afterUserId: number | undefined;
      let enqueued = 0;
      let registered = 0;
      while (true) {
        options.signal?.throwIfAborted();
        const ids = await source.scanUserIds({ afterUserId, limit: batchSize });
        if (!ids.length) break;
        const requests = await input.db.transaction(async (tx) => {
          const observedAt = input.clock.nowDate();
          const reason = UserDocumentRebuildReason.Backfill;
          const requests = await processor.registerRebuilds(tx, ids, observedAt);
          await recordRebuildMetadata(tx, requests, { reason });
          // A backfill already knows the targets. Commit their versions and
          // completed expansion receipts together before waking the worker.
          for (let offset = 0; offset < requests.length; offset += SQL_TARGET_BATCH_SIZE) {
            await tx.insert(userDocumentOutboxEntries).values(
              requests.slice(offset, offset + SQL_TARGET_BATCH_SIZE).map((request) => ({
                id: randomUUID(),
                source: { change: { kind: "user", userId: request.targetId }, reason },
                status: "processed" as const,
                rebuildRequests: [request],
                createdAt: observedAt,
                processedAt: observedAt,
                updatedAt: observedAt,
              })),
            );
          }
          options.signal?.throwIfAborted();
          return requests;
        });
        registered += requests.length;
        options.signal?.throwIfAborted();
        enqueued += (await enqueueRebuilds(requests)).enqueued;
        afterUserId = ids.at(-1);
        if (ids.length < batchSize) break;
      }
      return { registered, enqueued };
    },
    async process(payload: RebuildUserDocumentJobPayload) {
      const result = await processBatch([payload]);
      const status: "rebuilt" | "stale" | "skipped" = result.rebuilt ? "rebuilt" : result.stale ? "stale" : "skipped";
      return {
        status,
        userId: payload.userId,
        version: payload.version,
      };
    },
    async repairFailedOrStale(options: DocumentRepairOptions & { force?: boolean }) {
      const { force: _force, ...workOptions } = options;
      const stages = await processor.repairFailedOrStale(workOptions);
      options.signal?.throwIfAborted();
      const post = await postPublication.repairFailedOrStale(options);
      return {
        ...stages,
        postPublication: post,
        failed: stages.failed + post.failed,
        exhausted: post.exhausted,
      };
    },
    async retryPostPublication(options: { userId: number; version: string; staleBefore: Date; signal?: AbortSignal }) {
      const post = await postPublication.retryExhausted(options);
      return { enqueued: 0, failed: post.failed, exhausted: post.exhausted, postPublication: post };
    },
  };
}
