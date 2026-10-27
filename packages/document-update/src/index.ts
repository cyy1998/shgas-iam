import { randomUUID } from "node:crypto";
import type { DbClient, DbTransaction, db as database } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

export interface DocumentRebuildRequest {
  readonly targetId: number;
  readonly version: string;
}

export interface DocumentOutboxJob {
  readonly outboxId: string;
}

export interface DocumentUpdateClock {
  nowDate(): Date;
}

export interface DocumentUpdateJobs {
  enqueueOutboxEntries(entries: DocumentOutboxJob[]): Promise<{ enqueued: number }>;
  enqueueRebuilds(requests: DocumentRebuildRequest[]): Promise<{ enqueued: number }>;
}

export interface DocumentUpdateTables<Source> {
  readonly outbox: PgTable;
  /** A trusted expression selected as JSON, never supplied by a queue or HTTP caller. */
  readonly source: SQL<Source>;
  readonly rebuildState: PgTable;
  readonly targetId: AnyPgColumn;
  readonly requestedAt: AnyPgColumn;
}

export interface PreparedDocumentPublication<Document> extends DocumentRebuildRequest {
  readonly processingToken: string;
  readonly document: Document;
  readonly rebuiltAt: Date;
}

export interface DocumentRepairOptions {
  readonly staleBefore: Date;
  readonly limit: number;
  readonly signal?: AbortSignal;
}

export interface DocumentRepairStageReport {
  readonly selected: number;
  readonly enqueued: number;
  readonly failed: number;
}

export function assertDocumentRebuildRequest(value: DocumentRebuildRequest): DocumentRebuildRequest {
  if (
    !Number.isSafeInteger(value.targetId) ||
    value.targetId < 1 ||
    typeof value.version !== "string" ||
    !/^[1-9]\d*$/u.test(value.version)
  )
    throw new TypeError("Document rebuild requires a positive target and canonical version");
  return value;
}

export async function persistDocumentOutboxEntries<Source>(
  db: DbClient,
  sources: readonly Source[],
  persistEntries: (
    db: DbClient,
    entries: readonly { readonly id: string; readonly source: Source; readonly createdAt: Date }[],
  ) => Promise<void>,
  createdAt: Date,
) {
  if (!sources.length) return [];
  const entries = sources.map((source) => ({ id: randomUUID(), source, createdAt }));
  await persistEntries(db, entries);
  return entries.map(({ id }) => ({ outboxId: id }));
}

/**
 * Two durable stages shared by document owners. The publication callback runs inside
 * the completion transaction, so an owner can also persist pending post-publication
 * obligations there. External effects run only after this transaction commits.
 */
export function createDocumentUpdateProcessor<Source, Document>(input: {
  db: typeof database;
  tables: DocumentUpdateTables<Source>;
  parseSource: (source: unknown) => Source;
  expand: (tx: DbTransaction, source: Source, observedAt: Date) => Promise<readonly number[]>;
  registered?: (tx: DbTransaction, source: Source, requests: readonly DocumentRebuildRequest[]) => Promise<void>;
  build: (targetId: number, version: string) => Promise<Document>;
  publish: (tx: DbTransaction, prepared: PreparedDocumentPublication<Document>) => Promise<void>;
  afterPublish?: (prepared: PreparedDocumentPublication<Document>) => Promise<void>;
  jobProducer: DocumentUpdateJobs;
  clock?: DocumentUpdateClock;
}) {
  const clock = input.clock ?? { nowDate: () => new Date() };
  const { outbox, rebuildState, targetId, requestedAt } = input.tables;
  const targetName = sql.identifier(targetId.name);
  const requestedAtName = sql.identifier(requestedAt.name);

  async function markOutboxFailed(outboxId: string, token: string, error: unknown) {
    await input.db.execute(sql`UPDATE ${outbox}
      SET status='failed', processing_token=NULL, processing_started_at=NULL,
          last_error=${errorMessage(error)}, updated_at=${clock.nowDate().toISOString()}
      WHERE id=${outboxId} AND status='processing' AND processing_token=${token}`);
  }

  async function processOutbox(payload: DocumentOutboxJob) {
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(payload.outboxId))
      throw new TypeError("Document Outbox ID must be a UUID");
    const token = randomUUID();
    const now = clock.nowDate();
    const claimed = await input.db.execute(sql`UPDATE ${outbox}
      SET status='processing', processing_token=${token}, processing_started_at=${now.toISOString()},
          attempts=attempts+1, last_error=NULL, updated_at=${now.toISOString()}
      WHERE id=${payload.outboxId} AND status IN ('pending','failed') RETURNING id`);
    if (!claimed.length) {
      const [existing] = await input.db.execute<{ status: string; requests: DocumentRebuildRequest[] }>(
        sql`SELECT status, rebuild_requests AS requests FROM ${outbox} WHERE id=${payload.outboxId}`,
      );
      if (existing?.status !== "processed") return { status: "skipped" as const };
      await input.jobProducer.enqueueRebuilds(existing.requests.map(assertDocumentRebuildRequest));
      return { status: "replayed" as const };
    }
    let requests: DocumentRebuildRequest[] | null;
    try {
      const expandTransaction = () =>
        input.db.transaction(
          async (tx) => {
            const [current] = await tx.execute<{ status: string; token: string | null; source: unknown }>(
              sql`SELECT status, processing_token AS token, ${input.tables.source} AS source
                FROM ${outbox} WHERE id=${payload.outboxId} FOR UPDATE`,
            );
            if (current?.status !== "processing" || current.token !== token) return null;
            const observedAt = clock.nowDate();
            const source = input.parseSource(current.source);
            const ids = [...new Set(await input.expand(tx, source, observedAt))].sort((a, b) => a - b);
            for (const id of ids) assertDocumentRebuildRequest({ targetId: id, version: "1" });
            const registered = ids.length
              ? await tx.execute<{ targetId: number; version: string }>(sql`INSERT INTO ${rebuildState}
                (${targetName}, ${requestedAtName}, updated_at) VALUES
                ${sql.join(
                  ids.map((id) => sql`(${id}, ${observedAt.toISOString()}, ${observedAt.toISOString()})`),
                  sql`, `,
                )}
                ON CONFLICT (${targetName}) DO UPDATE SET
                  version=${rebuildState}.version+1, status='pending', processing_token=NULL,
                  processing_started_at=NULL, attempts=0, last_error=NULL,
                  ${requestedAtName}=EXCLUDED.${requestedAtName}, processed_at=NULL, updated_at=EXCLUDED.updated_at
                RETURNING ${targetName} AS "targetId", version::text AS version`)
              : [];
            const result = [...registered].sort((a, b) => a.targetId - b.targetId).map(assertDocumentRebuildRequest);
            await input.registered?.(tx, source, result);
            await tx.execute(sql`UPDATE ${outbox} SET status='processed',
            rebuild_requests=${JSON.stringify(result)}::jsonb, processing_token=NULL, processing_started_at=NULL,
            processed_at=${observedAt.toISOString()}, updated_at=${observedAt.toISOString()} WHERE id=${payload.outboxId}`);
            return result;
          },
          { isolationLevel: "repeatable read" },
        );
      try {
        requests = await expandTransaction();
      } catch (error) {
        // Only a known-aborted derived expansion is retried. Its receipt and all
        // requirements rolled back together; the source mutation is never replayed.
        if (extractPostgresError(error)?.code !== "40001") throw error;
        requests = await expandTransaction();
      }
    } catch (error) {
      await markOutboxFailed(payload.outboxId, token, error);
      throw error;
    }
    if (requests === null) return { status: "stale" as const };
    await input.jobProducer.enqueueRebuilds(requests);
    return { status: "expanded" as const, registered: requests.length };
  }

  async function markRebuildFailed(prepared: DocumentRebuildRequest & { processingToken: string }, error: unknown) {
    await input.db.execute(sql`UPDATE ${rebuildState}
      SET status='failed', processing_token=NULL, processing_started_at=NULL,
          last_error=${errorMessage(error)}, updated_at=${clock.nowDate().toISOString()}
      WHERE ${targetId}=${prepared.targetId} AND version=${prepared.version}::bigint
        AND status='processing' AND processing_token=${prepared.processingToken}`);
  }

  async function prepareRebuild(raw: DocumentRebuildRequest): Promise<PreparedDocumentPublication<Document> | null> {
    const request = assertDocumentRebuildRequest(raw);
    const processingToken = randomUUID();
    const now = clock.nowDate();
    const claimed = await input.db.execute(sql`UPDATE ${rebuildState}
      SET status='processing', processing_token=${processingToken}, processing_started_at=${now.toISOString()},
          attempts=attempts+1, last_error=NULL, updated_at=${now.toISOString()}
      WHERE ${targetId}=${request.targetId} AND version=${request.version}::bigint
        AND status IN ('pending','failed') RETURNING ${targetId}`);
    if (!claimed.length) return null;
    try {
      const document = await input.build(request.targetId, request.version);
      return { ...request, processingToken, document, rebuiltAt: clock.nowDate() };
    } catch (error) {
      await markRebuildFailed({ ...request, processingToken }, error);
      throw error;
    }
  }

  async function publishPrepared(prepared: PreparedDocumentPublication<Document>) {
    let result: { status: "published" | "stale" };
    try {
      result = await input.db.transaction(async (tx) => {
        const [current] = await tx.execute<{ version: string; status: string; token: string | null }>(
          sql`SELECT version::text AS version, status, processing_token AS token FROM ${rebuildState}
              WHERE ${targetId}=${prepared.targetId} FOR UPDATE`,
        );
        if (
          current?.status !== "processing" ||
          current.version !== prepared.version ||
          current.token !== prepared.processingToken
        )
          return { status: "stale" as const };
        await input.publish(tx, prepared);
        const processedAt = clock.nowDate();
        await tx.execute(sql`UPDATE ${rebuildState} SET status='processed', processing_token=NULL,
          processing_started_at=NULL, last_error=NULL, processed_at=${processedAt.toISOString()}, updated_at=${processedAt.toISOString()}
          WHERE ${targetId}=${prepared.targetId}`);
        return { status: "published" as const };
      });
    } catch (error) {
      await markRebuildFailed(prepared, error);
      throw error;
    }
    if (result.status === "published") await input.afterPublish?.(prepared);
    return result;
  }

  async function repairFailedOrStale(options: DocumentRepairOptions) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isFinite(options.staleBefore.getTime()))
      throw new RangeError("Document repair requires a valid staleBefore and positive safe limit");
    options.signal?.throwIfAborted();
    const work = await input.db.transaction(async (tx) => {
      const entries = await tx.execute<{ outboxId: string }>(sql`SELECT id AS "outboxId" FROM ${outbox}
        WHERE status IN ('pending','failed') OR (status='processing' AND processing_started_at<${options.staleBefore.toISOString()})
        ORDER BY created_at, id LIMIT ${options.limit} FOR UPDATE SKIP LOCKED`);
      const rebuilds = await tx.execute<{ targetId: number; version: string }>(sql`SELECT
        ${targetId} AS "targetId", version::text AS version FROM ${rebuildState}
        WHERE status IN ('pending','failed') OR (status='processing' AND processing_started_at<${options.staleBefore.toISOString()})
        ORDER BY ${requestedAt}, ${targetId} LIMIT ${options.limit} FOR UPDATE SKIP LOCKED`);
      options.signal?.throwIfAborted();
      const now = clock.nowDate();
      if (entries.length)
        await tx.execute(sql`UPDATE ${outbox} SET status='pending', processing_token=NULL,
          processing_started_at=NULL, updated_at=${now.toISOString()}
          WHERE id IN (${sql.join(
            entries.map(({ outboxId }) => sql`${outboxId}`),
            sql`, `,
          )})`);
      if (rebuilds.length)
        await tx.execute(sql`UPDATE ${rebuildState} SET status='pending', processing_token=NULL,
          processing_started_at=NULL, updated_at=${now.toISOString()}
          WHERE ${targetId} IN (${sql.join(
            rebuilds.map(({ targetId: id }) => sql`${id}`),
            sql`, `,
          )})`);
      return { entries: [...entries], rebuilds: [...rebuilds].map(assertDocumentRebuildRequest) };
    });
    async function wake(
      selected: number,
      enqueue: () => Promise<{ enqueued: number }>,
    ): Promise<DocumentRepairStageReport> {
      options.signal?.throwIfAborted();
      if (!selected) return { selected: 0, enqueued: 0, failed: 0 };
      try {
        const { enqueued } = await enqueue();
        options.signal?.throwIfAborted();
        return { selected, enqueued, failed: selected - enqueued };
      } catch {
        options.signal?.throwIfAborted();
        return { selected, enqueued: 0, failed: selected };
      }
    }
    const outboxReport = await wake(work.entries.length, () => input.jobProducer.enqueueOutboxEntries(work.entries));
    const rebuilds = await wake(work.rebuilds.length, () => input.jobProducer.enqueueRebuilds(work.rebuilds));
    return {
      outbox: outboxReport,
      rebuilds,
      enqueued: outboxReport.enqueued + rebuilds.enqueued,
      failed: outboxReport.failed + rebuilds.failed,
    };
  }

  return {
    processOutbox,
    prepareRebuild,
    publishPrepared,
    async processRebuild(request: DocumentRebuildRequest) {
      const prepared = await prepareRebuild(request);
      return prepared ? await publishPrepared(prepared) : { status: "skipped" as const };
    },
    repairFailedOrStale,
  };
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 4000);
}
