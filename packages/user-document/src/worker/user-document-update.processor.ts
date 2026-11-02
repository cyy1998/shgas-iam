import {
  MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE,
  type RebuildUserDocumentJobPayload,
  RebuildUserDocumentJobPayloadSchema,
  UserDocumentRebuildReason,
} from "@iam/contracts";
import type { db as database } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates } from "@iam/db/schema";
import {
  createDocumentUpdateProcessor,
  type DocumentRebuildClaim,
  type DocumentRepairOptions,
  type PreparedDocumentPublication,
} from "@iam/document-update";
import { eq, inArray, sql } from "drizzle-orm";
import type { PublishedUserDocument } from "../document";
import { persistUserDocumentSources } from "../invalidation/user-document-invalidation";
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
const PUBLICATION_BATCH_BYTES = 1_048_576;

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
  async function enqueueRebuilds(requests: Array<{ targetId: number; version: string }>) {
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
      for (let offset = 0; offset < requests.length; offset += SQL_TARGET_BATCH_SIZE) {
        await tx
          .update(userDocumentRebuildStates)
          .set({
            reasonCodes: [source.reason ?? userDocumentSourceReason(source.change.kind)],
            requestId: source.requestId ?? null,
            traceId: source.traceId ?? null,
          })
          .where(
            inArray(
              userDocumentRebuildStates.userId,
              requests.slice(offset, offset + SQL_TARGET_BATCH_SIZE).map(({ targetId }) => targetId),
            ),
          );
      }
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
        if (candidate.document.userId !== candidate.targetId || candidate.document.sourceVersion !== candidate.version)
          throw new Error("User Document candidate identity or version mismatch");
        return candidate.document;
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
    const report = {
      status: "rebuilt" as const,
      requested: requests.length,
      rebuilt: 0,
      skipped: 0,
      stale: 0,
      postPublication: { completed: 0, skipped: 0, failed: 0 },
    };
    const failures: unknown[] = [];
    let stopped = false;
    async function fail(claims: readonly DocumentRebuildClaim[], error: unknown) {
      failures.push(error);
      try {
        await processor.failRebuilds(claims, error, { skipLocked: true });
      } catch (cleanupError) {
        failures.push(cleanupError);
      }
    }
    for (let offset = 0; offset < requests.length; offset += batchSize) {
      const chunk = requests.slice(offset, offset + batchSize);
      let claims: DocumentRebuildClaim[] = [];
      try {
        claims = await processor.claimRebuilds(chunk);
        report.skipped += chunk.length - claims.length;
        if (!claims.length) continue;
        const observedAt = input.clock.nowDate();
        const results = await input.db.transaction(
          async (tx) =>
            await input.projection
              .createBuilder({ db: tx, clock: { nowDate: () => observedAt }, batchSize })
              .buildManyResults(claims.map(({ targetId, version }) => ({ userId: targetId, sourceVersion: version }))),
          { isolationLevel: "repeatable read", accessMode: "read only" },
        );
        const byUser = new Map<number, (typeof results)[number]>();
        const expected = new Map(claims.map((claim) => [claim.targetId, claim.version]));
        for (const result of results) {
          if (
            expected.get(result.userId) !== result.sourceVersion ||
            byUser.has(result.userId) ||
            (result.status !== "built" && result.status !== "failed")
          )
            throw new Error("User Document batch result identity or version mismatch");
          byUser.set(result.userId, result);
        }
        if (byUser.size !== claims.length) throw new Error("User Document batch result coverage mismatch");
        const candidates: PreparedDocumentPublication<TDocument>[] = [];
        for (const claim of claims) {
          const result = byUser.get(claim.targetId)!;
          if (result.status === "failed") {
            await fail([claim], result.error);
            continue;
          }
          try {
            const document = input.projection.parseDocumentRow(result.document);
            if (document.userId !== claim.targetId || document.sourceVersion !== claim.version)
              throw new Error("User Document candidate identity or version mismatch");
            candidates.push({
              ...claim,
              document,
              rebuiltAt: input.clock.nowDate(),
            });
          } catch (error) {
            await fail([claim], error);
          }
        }
        const groups = publicationBatches(candidates);
        const published: PreparedDocumentPublication<TDocument>[] = [];
        for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
          const outcome = await processor.publishPreparedBatch(groups[groupIndex]!);
          published.push(...outcome.published);
          report.rebuilt += outcome.published.length;
          report.stale += outcome.stale.length;
          failures.push(...outcome.failed.map(({ error }) => error));
          if (outcome.stopped) {
            stopped = true;
            const remaining = groups.slice(groupIndex + 1).flat();
            if (remaining.length) await fail(remaining, new Error("User Document publication stopped"));
            break;
          }
        }
        if (published.length) {
          const effects = await postPublication.processMany(
            published.map(({ targetId: userId, version }) => ({ userId, version })),
          );
          report.postPublication.completed += effects.completed;
          report.postPublication.skipped += effects.skipped;
          report.postPublication.failed += effects.failed;
        }
      } catch (error) {
        // Source/connection failures invalidate the shared snapshot. No claim
        // may remain owned merely because its result was never returned.
        await fail(claims, error);
      }
      if (stopped) break;
    }
    if (failures.length) throw new AggregateError(failures, "User Document batch rebuild failed");
    return report;
  }

  return {
    processOutbox: processor.processOutbox,
    prepareRebuild: processor.prepareRebuild,
    publishPrepared: processor.publishPrepared,
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
        const jobs = await input.db.transaction(
          async (tx) =>
            await persistUserDocumentSources(
              tx,
              ids.map((userId) => ({ change: { kind: "user", userId }, reason: UserDocumentRebuildReason.Backfill })),
              input.clock.nowDate(),
            ),
        );
        registered += jobs.length;
        options.signal?.throwIfAborted();
        enqueued += (await input.jobProducer.enqueueOutboxEntries(jobs)).enqueued;
        afterUserId = ids.at(-1);
        if (ids.length < batchSize) break;
      }
      return { registered, enqueued };
    },
    async process(payload: RebuildUserDocumentJobPayload) {
      const result = await processor.processRebuild({ targetId: payload.userId, version: payload.version });
      return {
        ...result,
        status: result.status === "published" ? "rebuilt" : result.status,
        userId: payload.userId,
        version: payload.version,
      };
    },
    async repairFailedOrStale(options: DocumentRepairOptions) {
      const stages = await processor.repairFailedOrStale(options);
      options.signal?.throwIfAborted();
      const post = await postPublication.repairFailedOrStale(options);
      return {
        ...stages,
        postPublication: post,
        failed: stages.failed + post.failed,
      };
    },
  };
}

function publicationBatches<TDocument extends PublishedUserDocument>(
  candidates: PreparedDocumentPublication<TDocument>[],
) {
  const groups: PreparedDocumentPublication<TDocument>[][] = [];
  let group: PreparedDocumentPublication<TDocument>[] = [];
  let bytes = 0;
  for (const candidate of candidates) {
    const size = Buffer.byteLength(JSON.stringify(candidate.document));
    if (group.length && bytes + size > PUBLICATION_BATCH_BYTES) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    // A single large existing document still publishes on its own.
    group.push(candidate);
    bytes += size;
  }
  if (group.length) groups.push(group);
  return groups;
}
