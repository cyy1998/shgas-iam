import { randomUUID } from "node:crypto";
import { MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE } from "@iam/contracts";
import type { DbTransaction, db as database } from "@iam/db";
import { userDocumentRebuildStates, userDocuments } from "@iam/db/schema";
import { inArray, sql } from "drizzle-orm";
import type { DocumentRepairOptions } from "../../update";
import type { PublishedUserDocument } from "../document";
import type { UserDocumentProjectionBundle } from "./user-document-projection";
import type { SubjectAccessRepairPort, UserDocumentRebuildLoggerPort } from "./user-document-rebuild.processor";

export const USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS = 5;

export interface UserDocumentPostPublicationRequest {
  readonly userId: number;
  readonly version: string;
}

export interface UserDocumentPostPublicationReport {
  selected: number;
  completed: number;
  skipped: number;
  failed: number;
  exhausted: number;
}

interface PostPublicationClaim extends UserDocumentPostPublicationRequest {
  readonly token: string;
}

interface PostPublicationOutcome extends PostPublicationClaim {
  readonly status: "processed" | "failed";
  readonly errorType: string | null;
}

export interface UserDocumentPostPublicationInput<
  TDocument extends PublishedUserDocument,
  TFacts extends { subjectIdentifier: string; sourceVersion: string },
> {
  db: typeof database;
  projection: UserDocumentProjectionBundle<TDocument, TFacts>;
  subjectFactsPublisher: { publish(record: TFacts): Promise<{ status: "published" | "retained-newer" }> };
  subjectAccessRepair: SubjectAccessRepairPort;
  logger: UserDocumentRebuildLoggerPort;
  clock: { nowDate(): Date };
  batchSize: number;
  concurrency?: number;
}

export function createUserDocumentPostPublicationProcessor<
  TDocument extends PublishedUserDocument,
  TFacts extends { subjectIdentifier: string; sourceVersion: string },
>(input: UserDocumentPostPublicationInput<TDocument, TFacts>) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1)
    throw new RangeError("User Document post-publication requires a positive safe batch size");
  if (input.concurrency !== undefined && (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1))
    throw new RangeError("User Document post-publication requires a positive safe concurrency");
  const batchSize = Math.min(input.batchSize, MAX_USER_DOCUMENT_REBUILD_BATCH_SIZE);
  const concurrency = Math.min(input.concurrency ?? 4, 8);
  const flushThreshold = Math.min(25, batchSize);
  let activeEffects = 0;
  const waitingSlots: Array<{ grant(): void }> = [];

  function releaseSlot() {
    const next = waitingSlots.shift();
    if (next) next.grant();
    else activeEffects -= 1;
  }

  async function acquireSlot(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    if (activeEffects < concurrency) {
      activeEffects += 1;
      return releaseSlot;
    }
    return await new Promise<() => void>((resolve, reject) => {
      const waiter = {
        grant() {
          signal?.removeEventListener("abort", onAbort);
          resolve(releaseSlot);
        },
      };
      function onAbort() {
        const index = waitingSlots.indexOf(waiter);
        if (index < 0) return;
        waitingSlots.splice(index, 1);
        signal?.removeEventListener("abort", onAbort);
        reject(signal?.reason);
      }
      waitingSlots.push(waiter);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }

  async function withEffectSlot(work: () => Promise<void>, signal?: AbortSignal) {
    const release = await acquireSlot(signal);
    try {
      signal?.throwIfAborted();
      await work();
    } finally {
      release();
    }
  }

  async function claimLocked(tx: DbTransaction, candidates: readonly PostPublicationClaim[], resetExhausted = false) {
    if (!candidates.length) return [];
    const now = input.clock.nowDate().toISOString();
    return await tx.execute<{ userId: number; version: string; token: string }>(sql`
      UPDATE ${userDocumentRebuildStates} AS state
      SET post_publication_status='processing', post_publication_token=requested.token,
          post_publication_started_at=${now}, post_publication_completed_at=NULL,
          post_publication_error=NULL, post_publication_attempts=CASE
            WHEN ${resetExhausted} AND state.post_publication_attempts>=${USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS}
              THEN 1 ELSE state.post_publication_attempts+1 END,
          updated_at=${now}
      FROM (VALUES ${sql.join(
        candidates.map(
          (request) => sql`(${request.userId}::integer,${request.version}::bigint,${request.token}::uuid)`,
        ),
        sql`, `,
      )})
        AS requested(user_id,version,token)
      WHERE state.user_id=requested.user_id AND state.post_publication_version=requested.version
        AND (${resetExhausted} OR state.post_publication_attempts<${USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS})
      RETURNING state.user_id AS "userId", state.post_publication_version::text AS version,
        state.post_publication_token::text AS token`);
  }

  async function claimRequests(requests: readonly UserDocumentPostPublicationRequest[]) {
    return await input.db.transaction(async (tx) => {
      await setMetadataBudgets(tx);
      // Lock in the same order as publication before any multi-row update.
      const locked = await tx.execute<{ userId: number; version: string; attempts: number }>(sql`
        SELECT state.user_id AS "userId", state.post_publication_version::text AS version,
          state.post_publication_attempts AS attempts
        FROM ${userDocumentRebuildStates} AS state
        JOIN (VALUES ${sql.join(
          requests.map((request) => sql`(${request.userId}::integer,${request.version}::bigint)`),
          sql`, `,
        )}) AS requested(user_id,version)
          ON state.user_id=requested.user_id AND state.post_publication_version=requested.version
        WHERE state.post_publication_status IN ('pending','failed')
        ORDER BY state.user_id FOR UPDATE OF state`);
      const exhausted = locked.filter((row) => row.attempts >= USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS);
      for (const row of exhausted) warnExhausted(row);
      return {
        claims: await claimLocked(
          tx,
          locked
            .filter((row) => row.attempts < USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS)
            .map((row) => ({ ...row, token: randomUUID() })),
        ),
        exhausted: exhausted.length,
      };
    });
  }

  async function complete(outcomes: readonly PostPublicationOutcome[], report: UserDocumentPostPublicationReport) {
    if (!outcomes.length) return;
    const rows = await input.db.transaction(async (tx) => {
      await setMetadataBudgets(tx);
      const values = sql.join(
        outcomes.map(
          (outcome) => sql`(${outcome.userId}::integer,
        ${outcome.version}::bigint,${outcome.token}::uuid,${outcome.status}::text,${outcome.errorType}::text)`,
        ),
        sql`, `,
      );
      const locked = await tx.execute<{ userId: number }>(sql`
        SELECT state.user_id AS "userId" FROM ${userDocumentRebuildStates} AS state
        JOIN (VALUES ${values}) AS owned(user_id,version,token,status,error_type)
          ON state.user_id=owned.user_id AND state.post_publication_version=owned.version
            AND state.post_publication_token=owned.token
        WHERE state.post_publication_status='processing'
        ORDER BY state.user_id FOR UPDATE OF state`);
      if (!locked.length) return [];
      const now = input.clock.nowDate().toISOString();
      return await tx.execute<{ userId: number; status: "processed" | "failed"; attempts: number }>(sql`
        UPDATE ${userDocumentRebuildStates} AS state
        SET post_publication_status=owned.status, post_publication_token=NULL,
            post_publication_started_at=NULL, post_publication_error=owned.error_type,
            post_publication_completed_at=CASE WHEN owned.status='processed' THEN ${now}::timestamp ELSE NULL END,
            updated_at=${now}
        FROM (VALUES ${values}) AS owned(user_id,version,token,status,error_type)
        WHERE state.user_id=owned.user_id AND state.post_publication_version=owned.version
          AND state.post_publication_token=owned.token AND state.post_publication_status='processing'
          AND state.user_id IN (${sql.join(
            locked.map((row) => sql`${row.userId}`),
            sql`, `,
          )})
        RETURNING state.user_id AS "userId", state.post_publication_status AS status,
          state.post_publication_attempts AS attempts`);
    });
    report.skipped += outcomes.length - rows.length;
    for (const row of rows) {
      if (row.status === "processed") report.completed += 1;
      else {
        report.failed += 1;
        const outcome = outcomes.find((item) => item.userId === row.userId)!;
        if (row.attempts >= USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS) {
          report.exhausted += 1;
          warnExhausted(outcome);
        }
        input.logger.warn(
          { userId: row.userId, version: outcome.version, errorType: outcome.errorType },
          "User Document post-publication remains pending",
        );
      }
    }
  }

  function warnExhausted(request: UserDocumentPostPublicationRequest) {
    input.logger.warn(
      { userId: request.userId, version: request.version, maxAttempts: USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS },
      "User Document post-publication attempts exhausted; explicit retry required",
    );
  }

  async function runClaims(claims: readonly PostPublicationClaim[], signal?: AbortSignal) {
    const report = emptyReport(claims.length);
    if (!claims.length) return report;
    try {
      signal?.throwIfAborted();
      let rows: Awaited<ReturnType<typeof readDocuments>>;
      try {
        rows = await readDocuments(claims);
      } catch (error) {
        await complete(
          claims.map((claim) => failed(claim, error)),
          report,
        );
        signal?.throwIfAborted();
        return report;
      }
      const documents = new Map(rows.map((row) => [row.userId, row]));
      const pending: PostPublicationOutcome[] = [];
      let next = 0;
      let writeFailed = false;
      let writeError: unknown;
      let writeChain = Promise.resolve();
      async function flush(force: boolean) {
        if (pending.length === 0 || (!force && pending.length < flushThreshold)) return;
        const outcomes = pending.splice(0, pending.length);
        // The queue serializes short writes while external effects keep their
        // own bounded slots. Attach the catch immediately; nothing is detached.
        writeChain = writeChain.then(async () => {
          if (writeFailed) return;
          try {
            await complete(outcomes, report);
          } catch (error) {
            writeFailed = true;
            writeError = error;
          }
        });
        await writeChain;
        if (writeFailed) throw writeError;
      }
      async function worker() {
        while (!writeFailed) {
          signal?.throwIfAborted();
          const claim = claims[next++];
          if (!claim) break;
          try {
            const row = documents.get(claim.userId);
            if (!row) throw new Error("UserDocumentPublicationMismatch");
            const profile = input.projection.parseDocumentRow(row);
            if (profile.userId !== claim.userId || profile.sourceVersion !== claim.version)
              throw new Error("UserDocumentPublicationMismatch");
            const record = input.projection.subjectFacts.createRecord(profile);
            if (record.sourceVersion !== claim.version || record.subjectIdentifier !== profile.subjectIdentifier)
              throw new Error("UserDocumentFactsIdentityMismatch");
            // Access leases are acquired by repairSubject only when this slot
            // reaches that subject, never for the waiting page.
            await withEffectSlot(async () => {
              const publication = await input.subjectFactsPublisher.publish(record);
              if (publication.status === "retained-newer") throw new Error("FactsCacheRetainedNewer");
              const repaired = await input.subjectAccessRepair.repairSubject(record.subjectIdentifier);
              if (
                typeof repaired === "object" &&
                repaired !== null &&
                "status" in repaired &&
                repaired.status === "failed"
              )
                throw new Error("SubjectAccessRepairFailed");
            }, signal);
            pending.push({ ...claim, status: "processed", errorType: null });
          } catch (error) {
            pending.push(failed(claim, error));
          }
          await flush(false);
        }
        // A fast slot draining the page persists its completed tail even while
        // another subject is still blocked in an external effect.
        await flush(true);
      }
      const settled = await Promise.allSettled(Array.from({ length: Math.min(concurrency, claims.length) }, worker));
      await flush(true);
      await writeChain;
      const rejection = settled.find((result) => result.status === "rejected");
      if (writeFailed) throw writeError;
      if (rejection?.status === "rejected") throw rejection.reason;
      return report;
    } catch (error) {
      // Already completed work or a replacement owner cannot match this token.
      // Other still-owned work remains repairable after any metadata failure.
      try {
        await complete(
          claims.map((claim) => failed(claim, error)),
          emptyReport(0),
        );
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "User Document post-publication cleanup failed");
      }
      throw error;
    }
  }

  async function readDocuments(claims: readonly PostPublicationClaim[]) {
    return await input.db.transaction(
      async (tx) => {
        await setMetadataBudgets(tx);
        return await tx
          .select({
            userId: userDocuments.userId,
            subjectIdentifier: userDocuments.subjectIdentifier,
            schemaVersion: userDocuments.schemaVersion,
            sourceVersion: userDocuments.sourceVersion,
            publishedAt: userDocuments.publishedAt,
            document: userDocuments.document,
          })
          .from(userDocuments)
          .where(
            inArray(
              userDocuments.userId,
              claims.map((claim) => claim.userId),
            ),
          );
      },
      { accessMode: "read only" },
    );
  }

  async function processMany(raw: readonly UserDocumentPostPublicationRequest[]) {
    const requests = normalizeRequests(raw);
    const report = emptyReport(requests.length);
    for (let offset = 0; offset < requests.length; offset += batchSize) {
      const page = requests.slice(offset, offset + batchSize);
      const { claims, exhausted } = await claimRequests(page);
      const result = await runClaims(claims);
      report.skipped += page.length - claims.length + result.skipped;
      report.completed += result.completed;
      report.failed += result.failed;
      report.exhausted += exhausted + result.exhausted;
    }
    return report;
  }

  return {
    async process(
      userId: number,
      version: string,
    ): Promise<{ status: "processed" | "failed" | "skipped" | "exhausted" }> {
      const report = await processMany([{ userId, version }]);
      return {
        status: report.completed ? "processed" : report.exhausted ? "exhausted" : report.failed ? "failed" : "skipped",
      };
    },
    processMany,
    async retryExhausted(options: UserDocumentPostPublicationRequest & { staleBefore: Date; signal?: AbortSignal }) {
      normalizeRequests([options]);
      if (!Number.isFinite(options.staleBefore.getTime()))
        throw new RangeError("Explicit retry requires a valid staleBefore");
      options.signal?.throwIfAborted();
      const claims = await input.db.transaction(async (tx) => {
        await setMetadataBudgets(tx);
        const selected = await tx.execute<{ userId: number; version: string }>(sql`
          SELECT state.user_id AS "userId",state.post_publication_version::text AS version
          FROM ${userDocumentRebuildStates} AS state
          WHERE state.user_id=${options.userId} AND state.post_publication_version=${options.version}::bigint
            AND state.post_publication_attempts>=${USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS}
            AND (state.post_publication_status='failed'
              OR (state.post_publication_status='processing' AND state.post_publication_started_at<${options.staleBefore.toISOString()}))
          FOR UPDATE OF state`);
        if (!selected.length)
          throw new Error("Explicit retry requires an exhausted failed or stale publication of the specified version");
        options.signal?.throwIfAborted();
        return await claimLocked(
          tx,
          selected.map((row) => ({ ...row, token: randomUUID() })),
          true,
        );
      });
      return await runClaims(claims, options.signal);
    },
    async repairFailedOrStale(
      options: DocumentRepairOptions & { force?: boolean },
    ): Promise<UserDocumentPostPublicationReport> {
      if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isFinite(options.staleBefore.getTime()))
        throw new RangeError(
          "User Document post-publication repair requires a valid staleBefore and positive safe limit",
        );
      const report = emptyReport(0);
      let afterUserId = 0;
      while (report.selected < options.limit) {
        options.signal?.throwIfAborted();
        const page = await input.db.transaction(async (tx) => {
          await setMetadataBudgets(tx);
          const selected = await tx.execute<{ userId: number; version: string }>(sql`
            SELECT state.user_id AS "userId", state.post_publication_version::text AS version
            FROM ${userDocumentRebuildStates} AS state
            WHERE state.user_id>${afterUserId} AND state.post_publication_version IS NOT NULL
              AND (${options.force ?? false} OR state.post_publication_attempts<${USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS})
              AND (state.post_publication_status IN ('pending','failed')
                OR (state.post_publication_status='processing' AND state.post_publication_started_at<${options.staleBefore.toISOString()}))
            ORDER BY state.user_id LIMIT ${Math.min(batchSize, options.limit - report.selected)}
            FOR UPDATE OF state SKIP LOCKED`);
          options.signal?.throwIfAborted();
          const claims = await claimLocked(
            tx,
            selected.map((row) => ({ ...row, token: randomUUID() })),
            options.force,
          );
          return { selected: selected.length, afterUserId: selected.at(-1)?.userId ?? afterUserId, claims };
        });
        if (!page.selected) break;
        afterUserId = page.afterUserId;
        const result = await runClaims(page.claims, options.signal);
        report.selected += page.selected;
        report.completed += result.completed;
        report.failed += result.failed;
        report.skipped += page.selected - page.claims.length + result.skipped;
      }
      options.signal?.throwIfAborted();
      report.exhausted = await input.db.transaction(
        async (tx) => {
          await setMetadataBudgets(tx);
          const [row] = await tx.execute<{ count: number }>(sql`
          SELECT count(*)::integer AS count FROM ${userDocumentRebuildStates} AS state
          WHERE state.post_publication_version IS NOT NULL
            AND state.post_publication_attempts>=${USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS}
            AND (state.post_publication_status IN ('pending','failed')
              OR (state.post_publication_status='processing' AND state.post_publication_started_at<${options.staleBefore.toISOString()}))`);
          return row?.count ?? 0;
        },
        { accessMode: "read only" },
      );
      if (report.exhausted > 0)
        input.logger.warn(
          { exhausted: report.exhausted, maxAttempts: USER_DOCUMENT_POST_PUBLICATION_MAX_ATTEMPTS },
          "User Document post-publication attempts exhausted; explicit retry required",
        );
      return report;
    },
  };
}

function normalizeRequests(raw: readonly UserDocumentPostPublicationRequest[]) {
  const requests = new Map<number, UserDocumentPostPublicationRequest>();
  for (const request of raw) {
    if (
      !Number.isSafeInteger(request.userId) ||
      request.userId < 1 ||
      typeof request.version !== "string" ||
      !/^[1-9]\d*$/u.test(request.version)
    )
      throw new TypeError("User Document post-publication requires a positive target and canonical version");
    const previous = requests.get(request.userId);
    if (!previous || BigInt(request.version) > BigInt(previous.version)) requests.set(request.userId, request);
  }
  return [...requests.values()].sort((left, right) => left.userId - right.userId);
}

function failed(claim: PostPublicationClaim, error: unknown): PostPublicationOutcome {
  const errorType =
    error instanceof Error && /^[A-Za-z][\w.-]{0,63}$/u.test(error.name) ? error.name : "PostPublicationError";
  return { ...claim, status: "failed", errorType };
}

function emptyReport(selected: number): UserDocumentPostPublicationReport {
  return { selected, completed: 0, skipped: 0, failed: 0, exhausted: 0 };
}

async function setMetadataBudgets(tx: DbTransaction) {
  // LOCAL caps disappear on both commit and rollback and never widen a
  // stricter session setting. This also bounds conditional failure cleanup.
  await tx.execute(sql`SELECT
    set_config('statement_timeout', least(
      coalesce(nullif(extract(epoch FROM current_setting('statement_timeout')::interval)*1000,0),15000),15000
    )::bigint::text || 'ms',true),
    set_config('lock_timeout', least(
      coalesce(nullif(extract(epoch FROM current_setting('lock_timeout')::interval)*1000,0),5000),5000
    )::bigint::text || 'ms',true)`);
}
