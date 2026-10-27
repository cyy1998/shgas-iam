import { randomUUID } from "node:crypto";
import { type RebuildUserDocumentJobPayload, UserDocumentRebuildReason } from "@iam/contracts";
import type { DbClient, db as database } from "@iam/db";
import { userDocumentOutboxEntries, userDocumentRebuildStates, userDocuments } from "@iam/db/schema";
import { createDocumentUpdateProcessor, type DocumentRepairOptions } from "@iam/document-update";
import { and, asc, eq, inArray, lt, or, sql } from "drizzle-orm";
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
import type { UserDocumentProjectionBundle } from "./user-document-projection";
import type { SubjectAccessRepairPort, UserDocumentRebuildLoggerPort } from "./user-document-rebuild.processor";

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
  async function enqueueRebuilds(requests: Array<{ targetId: number; version: string }>) {
    if (!requests.length) return { enqueued: 0 };
    const metadata = await input.db
      .select()
      .from(userDocumentRebuildStates)
      .where(
        inArray(
          userDocumentRebuildStates.userId,
          requests.map(({ targetId }) => targetId),
        ),
      );
    const rows = new Map(metadata.map((row) => [row.userId, row]));
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

  async function publishEffects(userId: number, version: string) {
    const token = randomUUID();
    const now = input.clock.nowDate();
    const claimed = await input.db
      .update(userDocumentRebuildStates)
      .set({
        postPublicationStatus: "processing",
        postPublicationToken: token,
        postPublicationStartedAt: now,
        postPublicationError: null,
        postPublicationAttempts: sql`${userDocumentRebuildStates.postPublicationAttempts}+1`,
        updateTime: now,
      })
      .where(
        and(
          eq(userDocumentRebuildStates.userId, userId),
          eq(userDocumentRebuildStates.postPublicationVersion, version),
          inArray(userDocumentRebuildStates.postPublicationStatus, ["pending", "failed"]),
        ),
      )
      .returning({ userId: userDocumentRebuildStates.userId });
    if (!claimed.length) return { status: "skipped" as const };
    const ownership = and(
      eq(userDocumentRebuildStates.userId, userId),
      eq(userDocumentRebuildStates.postPublicationVersion, version),
      eq(userDocumentRebuildStates.postPublicationToken, token),
    );
    try {
      const profile = await readPublishedUserDocument(input.db, userId, input.projection);
      if (!profile || profile.sourceVersion !== version) throw new Error("UserDocumentPublicationMismatch");
      const record = input.projection.subjectFacts.createRecord(profile);
      const publication = await input.subjectFactsPublisher.publish(record);
      if (publication.status === "retained-newer") throw new Error("FactsCacheRetainedNewer");
      const repaired = await input.subjectAccessRepair.repairSubject(record.subjectIdentifier);
      if (typeof repaired === "object" && repaired !== null && "status" in repaired && repaired.status === "failed")
        throw new Error("SubjectAccessRepairFailed");
      // A deferred repair retains its lease/backlog responsibility in Subject Access.
      const completed = await input.db
        .update(userDocumentRebuildStates)
        .set({
          postPublicationStatus: "processed",
          postPublicationToken: null,
          postPublicationStartedAt: null,
          postPublicationCompletedAt: input.clock.nowDate(),
          postPublicationError: null,
          updateTime: input.clock.nowDate(),
        })
        .where(ownership)
        .returning({ userId: userDocumentRebuildStates.userId });
      return { status: completed.length ? ("processed" as const) : ("skipped" as const) };
    } catch (error) {
      const safeError =
        error instanceof Error && /^[A-Za-z][\w.-]{0,63}$/u.test(error.name) ? error.name : "PostPublicationError";
      const failed = await input.db
        .update(userDocumentRebuildStates)
        .set({
          postPublicationStatus: "failed",
          postPublicationToken: null,
          postPublicationStartedAt: null,
          postPublicationError: safeError,
          updateTime: input.clock.nowDate(),
        })
        .where(ownership)
        .returning({ userId: userDocumentRebuildStates.userId });
      if (!failed.length) return { status: "skipped" as const };
      input.logger.warn({ userId, version, errorType: safeError }, "User Document post-publication remains pending");
      return { status: "failed" as const };
    }
  }

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
      if (!requests.length) return;
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
            requests.map(({ targetId }) => targetId),
          ),
        );
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
    afterPublish: async (prepared) => {
      await publishEffects(prepared.targetId, prepared.version);
    },
    jobProducer: { enqueueOutboxEntries: input.jobProducer.enqueueOutboxEntries, enqueueRebuilds },
  });

  return {
    processOutbox: processor.processOutbox,
    prepareRebuild: processor.prepareRebuild,
    publishPrepared: processor.publishPrepared,
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
      const pending = await input.db.transaction(async (tx) => {
        const rows = await tx
          .select({
            userId: userDocumentRebuildStates.userId,
            version: userDocumentRebuildStates.postPublicationVersion,
          })
          .from(userDocumentRebuildStates)
          .where(
            or(
              inArray(userDocumentRebuildStates.postPublicationStatus, ["pending", "failed"]),
              and(
                eq(userDocumentRebuildStates.postPublicationStatus, "processing"),
                lt(userDocumentRebuildStates.postPublicationStartedAt, options.staleBefore),
              ),
            ),
          )
          .orderBy(asc(userDocumentRebuildStates.userId))
          .limit(options.limit)
          .for("update", { skipLocked: true });
        if (rows.length)
          await tx
            .update(userDocumentRebuildStates)
            .set({ postPublicationStatus: "pending", postPublicationToken: null, postPublicationStartedAt: null })
            .where(
              inArray(
                userDocumentRebuildStates.userId,
                rows.map(({ userId }) => userId),
              ),
            );
        return rows;
      });
      let completed = 0;
      let failed = 0;
      let skipped = 0;
      for (const row of pending) {
        options.signal?.throwIfAborted();
        const result = row.version ? await publishEffects(row.userId, row.version) : { status: "failed" };
        if (result.status === "processed") completed += 1;
        else if (result.status === "skipped") skipped += 1;
        else failed += 1;
      }
      return {
        ...stages,
        postPublication: { selected: pending.length, completed, skipped, failed },
        failed: stages.failed + failed,
      };
    },
  };
}

async function readPublishedUserDocument<
  TDocument extends PublishedUserDocument,
  TFacts extends { subjectIdentifier: string; sourceVersion: string },
>(db: DbClient, userId: number, projection: UserDocumentProjectionBundle<TDocument, TFacts>) {
  const [row] = await db
    .select({
      userId: userDocuments.userId,
      subjectIdentifier: userDocuments.subjectIdentifier,
      schemaVersion: userDocuments.schemaVersion,
      sourceVersion: userDocuments.sourceVersion,
      publishedAt: userDocuments.publishedAt,
      document: userDocuments.document,
    })
    .from(userDocuments)
    .where(eq(userDocuments.userId, userId));
  if (
    !row ||
    row.sourceVersion === null ||
    row.schemaVersion === null ||
    row.publishedAt === null ||
    row.subjectIdentifier === null
  )
    return null;
  return projection.parseDocumentRow({
    ...row,
    sourceVersion: row.sourceVersion,
    schemaVersion: row.schemaVersion,
    publishedAt: row.publishedAt,
    subjectIdentifier: row.subjectIdentifier,
  });
}
