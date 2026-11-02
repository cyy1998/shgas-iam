import { randomUUID } from "node:crypto";
import type { DbClient, DbTransaction, db as database } from "@iam/db";
import { extractPostgresError } from "@iam/db/postgres-error";
import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";

// The largest statement binds three parameters per target. Keep every statement
// well below the driver limit without splitting the transaction or its receipt.
const SQL_TARGET_BATCH_SIZE = 1_000;

export interface DocumentRebuildRequest {
  readonly targetId: number;
  readonly version: string;
}

export interface DocumentRebuildClaim extends DocumentRebuildRequest {
  readonly processingToken: string;
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

export interface PreparedDocumentPublication<Document> extends DocumentRebuildClaim {
  readonly document: Document;
  readonly rebuiltAt: Date;
}

export interface DocumentBatchPublicationResult<Document> {
  readonly published: PreparedDocumentPublication<Document>[];
  readonly stale: PreparedDocumentPublication<Document>[];
  readonly failed: Array<{ prepared: PreparedDocumentPublication<Document>; error: unknown }>;
  stopped: boolean;
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
  publishMany?: (
    tx: DbTransaction,
    prepared: readonly PreparedDocumentPublication<Document>[],
  ) => Promise<readonly number[]>;
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
            const registered: DocumentRebuildRequest[] = [];
            for (let offset = 0; offset < ids.length; offset += SQL_TARGET_BATCH_SIZE) {
              const batch = ids.slice(offset, offset + SQL_TARGET_BATCH_SIZE);
              const rows = await tx.execute<{ targetId: number; version: string }>(sql`INSERT INTO ${rebuildState}
                (${targetName}, ${requestedAtName}, updated_at) VALUES
                ${sql.join(
                  batch.map((id) => sql`(${id}, ${observedAt.toISOString()}, ${observedAt.toISOString()})`),
                  sql`, `,
                )}
                ON CONFLICT (${targetName}) DO UPDATE SET
                  version=${rebuildState}.version+1, status='pending', processing_token=NULL,
                  processing_started_at=NULL, attempts=0, last_error=NULL,
                  ${requestedAtName}=EXCLUDED.${requestedAtName}, processed_at=NULL, updated_at=EXCLUDED.updated_at
                RETURNING ${targetName} AS "targetId", version::text AS version`);
              registered.push(...rows);
            }
            const result = registered.sort((a, b) => a.targetId - b.targetId).map(assertDocumentRebuildRequest);
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

  async function claimRebuilds(raw: readonly DocumentRebuildRequest[]): Promise<DocumentRebuildClaim[]> {
    const requests = new Map<number, DocumentRebuildRequest>();
    for (const value of raw) {
      const request = assertDocumentRebuildRequest(value);
      const previous = requests.get(request.targetId);
      if (!previous || BigInt(request.version) > BigInt(previous.version)) requests.set(request.targetId, request);
    }
    const candidates = [...requests.values()]
      .sort((left, right) => left.targetId - right.targetId)
      .map((request) => ({ ...request, processingToken: randomUUID() }));
    if (!candidates.length) return [];
    const now = clock.nowDate().toISOString();
    async function claim(db: DbClient) {
      const claimed: DocumentRebuildClaim[] = [];
      for (let offset = 0; offset < candidates.length; offset += SQL_TARGET_BATCH_SIZE) {
        const batch = candidates.slice(offset, offset + SQL_TARGET_BATCH_SIZE);
        const rows = await db.execute<{
          targetId: number;
          version: string;
          processingToken: string;
        }>(sql`UPDATE ${rebuildState}
          SET status='processing', processing_token=requests.token, processing_started_at=${now},
              attempts=${rebuildState}.attempts+1, last_error=NULL, updated_at=${now}
          FROM (VALUES ${sql.join(
            batch.map(
              (request) =>
                sql`(${request.targetId}::integer,${request.version}::bigint,${request.processingToken}::uuid)`,
            ),
            sql`, `,
          )}) AS requests(target_id,version,token)
          WHERE ${targetId}=requests.target_id AND ${rebuildState}.version=requests.version
            AND ${rebuildState}.status IN ('pending','failed')
          RETURNING ${targetId} AS "targetId", ${rebuildState}.version::text AS version,
            ${rebuildState}.processing_token AS "processingToken"`);
        claimed.push(...rows);
      }
      return claimed.sort((left, right) => left.targetId - right.targetId);
    }
    // A multi-statement claim is atomic: a later SQL failure must not strand
    // ownership from an earlier chunk that the caller never received.
    return candidates.length > SQL_TARGET_BATCH_SIZE ? await input.db.transaction(claim) : await claim(input.db);
  }

  async function failUnlockedRebuilds(claims: readonly DocumentRebuildClaim[], error: unknown) {
    await input.db.execute(sql`WITH locked AS MATERIALIZED (
      SELECT ${targetId} AS target_id,${rebuildState}.version,${rebuildState}.processing_token AS token
      FROM ${rebuildState}
      INNER JOIN (VALUES ${sql.join(
        claims.map(
          (claim) => sql`(${claim.targetId}::integer,${claim.version}::bigint,${claim.processingToken}::uuid)`,
        ),
        sql`, `,
      )}) AS requests(target_id,version,token)
        ON ${targetId}=requests.target_id AND ${rebuildState}.version=requests.version
          AND ${rebuildState}.processing_token=requests.token
      WHERE ${rebuildState}.status='processing'
      ORDER BY ${targetId} FOR UPDATE OF ${rebuildState} SKIP LOCKED
    )
    UPDATE ${rebuildState}
      SET status='failed',processing_token=NULL,processing_started_at=NULL,
          last_error=${errorMessage(error)},updated_at=${clock.nowDate().toISOString()}
      FROM locked
      WHERE ${targetId}=locked.target_id AND ${rebuildState}.version=locked.version
        AND ${rebuildState}.status='processing' AND ${rebuildState}.processing_token=locked.token`);
  }

  async function failRebuilds(
    claims: readonly DocumentRebuildClaim[],
    error: unknown,
    options?: { readonly skipLocked?: boolean },
  ) {
    const failures: unknown[] = [];
    for (let offset = 0; offset < claims.length; offset += SQL_TARGET_BATCH_SIZE) {
      const batch = claims.slice(offset, offset + SQL_TARGET_BATCH_SIZE);
      try {
        if (options?.skipLocked) {
          await failUnlockedRebuilds(batch, error);
          continue;
        }
        await input.db.execute(sql`UPDATE ${rebuildState}
          SET status='failed', processing_token=NULL, processing_started_at=NULL,
              last_error=${errorMessage(error)}, updated_at=${clock.nowDate().toISOString()}
          FROM (VALUES ${sql.join(
            batch.map(
              (claim) => sql`(${claim.targetId}::integer,${claim.version}::bigint,${claim.processingToken}::uuid)`,
            ),
            sql`, `,
          )}) AS requests(target_id,version,token)
          WHERE ${targetId}=requests.target_id AND ${rebuildState}.version=requests.version
            AND ${rebuildState}.status='processing' AND ${rebuildState}.processing_token=requests.token`);
      } catch (failure) {
        failures.push(failure);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Document rebuild claim cleanup failed");
  }

  async function prepareRebuild(raw: DocumentRebuildRequest): Promise<PreparedDocumentPublication<Document> | null> {
    const [claim] = await claimRebuilds([raw]);
    if (!claim) return null;
    try {
      const document = await input.build(claim.targetId, claim.version);
      return { ...claim, document, rebuiltAt: clock.nowDate() };
    } catch (error) {
      await failRebuilds([claim], error);
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
      await failRebuilds([prepared], error);
      throw error;
    }
    if (result.status === "published") await input.afterPublish?.(prepared);
    return result;
  }

  async function publishPreparedBatch(
    raw: readonly PreparedDocumentPublication<Document>[],
  ): Promise<DocumentBatchPublicationResult<Document>> {
    const publishMany = input.publishMany;
    if (!publishMany) throw new Error("Document batch publication requires a bulk publisher");
    const bulkPublisher = publishMany;
    if (raw.length > SQL_TARGET_BATCH_SIZE) throw new RangeError("Document publication batch exceeds its target limit");
    const identities = new Set<number>();
    for (const prepared of raw) {
      assertDocumentRebuildRequest(prepared);
      if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu.test(prepared.processingToken))
        throw new TypeError("Document publication requires a UUID processing token");
      if (!(prepared.rebuiltAt instanceof Date) || !Number.isFinite(prepared.rebuiltAt.getTime()))
        throw new TypeError("Document publication requires a valid build time");
      if (identities.has(prepared.targetId)) throw new TypeError("Document publication contains duplicate targets");
      identities.add(prepared.targetId);
    }
    const candidates = [...raw].sort((left, right) => left.targetId - right.targetId);
    const report: DocumentBatchPublicationResult<Document> = { published: [], stale: [], failed: [], stopped: false };
    if (!candidates.length) return report;
    // Binary isolation needs at most 2B-1 attempts, plus one confirmed-abort retry.
    const attemptLimit = candidates.length * 2;
    const deadline = performance.now() + 30_000;
    let attempts = 0;
    let retriedAbort = false;
    let stoppingError: unknown;

    function remainingBudget() {
      const remaining = Math.floor(deadline - performance.now());
      if (remaining < 1) throw new Error("Document publication time budget exceeded");
      return remaining;
    }

    async function fail(candidates: readonly PreparedDocumentPublication<Document>[], error: unknown) {
      let failure = error;
      try {
        // Do not wait behind an active owner after LOCAL timeouts have ended.
        // The fixed diagnostic also excludes bulk query/document parameters.
        await failRebuilds(candidates, new Error("DocumentBatchPublicationFailed"), { skipLocked: true });
      } catch (cleanupError) {
        report.stopped = true;
        stoppingError = cleanupError;
        failure = new AggregateError([error, cleanupError], "Document batch publication cleanup failed");
      }
      report.failed.push(...candidates.map((prepared) => ({ prepared, error: failure })));
    }

    async function attempt(group: readonly PreparedDocumentPublication<Document>[]): Promise<void> {
      if (report.stopped) {
        await fail(group, stoppingError);
        return;
      }
      if (attempts >= attemptLimit) {
        report.stopped = true;
        stoppingError = new Error("Document publication attempt budget exceeded");
        await fail(group, stoppingError);
        return;
      }
      try {
        remainingBudget();
      } catch (error) {
        report.stopped = true;
        stoppingError = error;
        await fail(group, error);
        return;
      }
      attempts += 1;
      let callbackCompleted = false;
      let callbackFailed = false;
      let callbackFailure: unknown;
      let phase: "budget" | "lock" | "publish" | "processed" = "budget";
      try {
        const completed = await input.db.transaction(async (tx) => {
          try {
            const remaining = remainingBudget();
            // Never widen a stricter connection-level budget. LOCAL settings
            // disappear on commit/rollback and also bound the first lock wait.
            await tx.execute(sql`SELECT
              set_config('statement_timeout', least(
                coalesce(nullif(extract(epoch FROM current_setting('statement_timeout')::interval)*1000,0),15000),
                ${Math.min(remaining, 15_000)}
              )::bigint::text || 'ms',true),
              set_config('lock_timeout', least(
                coalesce(nullif(extract(epoch FROM current_setting('lock_timeout')::interval)*1000,0),5000),
                ${Math.min(remaining, 5_000)}
              )::bigint::text || 'ms',true)`);
            phase = "lock";
            const locked = await tx.execute<{
              targetId: number;
              version: string;
              status: string;
              token: string | null;
            }>(
              sql`SELECT ${targetId} AS "targetId",version::text AS version,status,processing_token AS token
                FROM ${rebuildState}
                WHERE ${targetId} IN (${sql.join(
                  group.map((prepared) => sql`${prepared.targetId}`),
                  sql`, `,
                )})
                ORDER BY ${targetId} FOR UPDATE OF ${rebuildState}`,
            );
            remainingBudget();
            const current = new Map(locked.map((row) => [row.targetId, row]));
            const eligible: PreparedDocumentPublication<Document>[] = [];
            const stale: PreparedDocumentPublication<Document>[] = [];
            for (const prepared of group) {
              const row = current.get(prepared.targetId);
              if (
                row?.status === "processing" &&
                row.version === prepared.version &&
                row.token === prepared.processingToken
              )
                eligible.push(prepared);
              else stale.push(prepared);
            }
            if (eligible.length) {
              phase = "publish";
              const published = await bulkPublisher(tx, eligible);
              remainingBudget();
              assertPublicationCoverage(eligible, published);
              phase = "processed";
              const now = clock.nowDate().toISOString();
              const processed = await tx.execute<{ targetId: number }>(sql`UPDATE ${rebuildState}
                SET status='processed',processing_token=NULL,processing_started_at=NULL,last_error=NULL,
                    processed_at=${now},updated_at=${now}
                FROM (VALUES ${sql.join(
                  eligible.map(
                    (prepared) =>
                      sql`(${prepared.targetId}::integer,${prepared.version}::bigint,${prepared.processingToken}::uuid)`,
                  ),
                  sql`, `,
                )}) AS requests(target_id,version,token)
                WHERE ${targetId}=requests.target_id AND ${rebuildState}.version=requests.version
                  AND ${rebuildState}.status='processing' AND ${rebuildState}.processing_token=requests.token
                RETURNING ${targetId} AS "targetId"`);
              assertPublicationCoverage(
                eligible,
                processed.map(({ targetId }) => targetId),
              );
              remainingBudget();
            }
            callbackCompleted = true;
            return { eligible, stale };
          } catch (error) {
            callbackFailed = true;
            callbackFailure = error;
            throw error;
          }
        });
        // Only a resolved transaction is an acknowledgement of COMMIT.
        report.published.push(...completed.eligible);
        report.stale.push(...completed.stale);
        if (performance.now() >= deadline) {
          // A late COMMIT acknowledgement is still a confirmed publication.
          // Stop subsequent work without reclassifying or replaying this group.
          report.stopped = true;
          stoppingError = new Error("Document publication time budget exceeded");
        }
      } catch (error) {
        // postgres-js awaits ROLLBACK before rethrowing the callback error.
        // A different failure, or a failure after the callback returned, does
        // not establish rollback and must never start binary retry/effects.
        const rolledBack = !callbackCompleted && callbackFailed && callbackFailure === error;
        const code = extractPostgresError(error)?.code;
        if (rolledBack && (code === "40P01" || code === "40001") && !retriedAbort) {
          retriedAbort = true;
          await attempt(group);
          return;
        }
        const targetLocal = rolledBack && isTargetLocalPublicationFailure(error, phase);
        if (targetLocal && group.length > 1) {
          const middle = Math.floor(group.length / 2);
          await attempt(group.slice(0, middle));
          await attempt(group.slice(middle));
          return;
        }
        if (!targetLocal) {
          report.stopped = true;
          stoppingError = error;
        }
        await fail(group, error);
      }
    }
    await attempt(candidates);
    report.published.sort((left, right) => left.targetId - right.targetId);
    report.stale.sort((left, right) => left.targetId - right.targetId);
    report.failed.sort((left, right) => left.prepared.targetId - right.prepared.targetId);
    return report;
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
      for (let offset = 0; offset < entries.length; offset += SQL_TARGET_BATCH_SIZE) {
        const batch = entries.slice(offset, offset + SQL_TARGET_BATCH_SIZE);
        await tx.execute(sql`UPDATE ${outbox} SET status='pending', processing_token=NULL,
          processing_started_at=NULL, updated_at=${now.toISOString()}
          WHERE id IN (${sql.join(
            batch.map(({ outboxId }) => sql`${outboxId}`),
            sql`, `,
          )})`);
      }
      for (let offset = 0; offset < rebuilds.length; offset += SQL_TARGET_BATCH_SIZE) {
        const batch = rebuilds.slice(offset, offset + SQL_TARGET_BATCH_SIZE);
        await tx.execute(sql`UPDATE ${rebuildState} SET status='pending', processing_token=NULL,
          processing_started_at=NULL, updated_at=${now.toISOString()}
          WHERE ${targetId} IN (${sql.join(
            batch.map(({ targetId: id }) => sql`${id}`),
            sql`, `,
          )})`);
      }
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
    claimRebuilds,
    failRebuilds,
    prepareRebuild,
    publishPrepared,
    publishPreparedBatch,
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

class DocumentPublicationCoverageError extends Error {
  constructor() {
    super("Document batch publication did not acknowledge every eligible target");
    this.name = "DocumentPublicationCoverageError";
  }
}

function assertPublicationCoverage(eligible: readonly DocumentRebuildRequest[], acknowledged: readonly number[]) {
  const expected = new Set(eligible.map(({ targetId }) => targetId));
  const actual = new Set(acknowledged);
  if (
    acknowledged.length !== expected.size ||
    actual.size !== expected.size ||
    acknowledged.some((id) => !expected.has(id))
  )
    throw new DocumentPublicationCoverageError();
}

function isTargetLocalPublicationFailure(error: unknown, phase: string) {
  if (error instanceof DocumentPublicationCoverageError) return true;
  if (phase !== "publish") return false;
  const code = extractPostgresError(error)?.code;
  return Boolean(code?.startsWith("23") || code?.startsWith("22") || code === "P0001");
}
