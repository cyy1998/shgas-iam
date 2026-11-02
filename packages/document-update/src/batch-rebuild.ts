import type { DbTransaction, db as database } from "@iam/db";
import type {
  DocumentBatchPublicationResult,
  DocumentRebuildClaim,
  DocumentRebuildRequest,
  DocumentUpdateClock,
  PreparedDocumentPublication,
} from "./index";

const DEFAULT_BATCH_SIZE = 100;
const DEFAULT_PUBLICATION_BATCH_BYTES = 1_048_576;

export type DocumentBuildResult<Document> = DocumentRebuildRequest &
  ({ readonly status: "built"; readonly document: Document } | { readonly status: "failed"; readonly error: unknown });

export interface DocumentBatchRebuildOptions<Document> {
  readonly batchSize?: number;
  readonly publicationBatchBytes?: number;
  readonly signal?: AbortSignal;
  readonly onPublished?: (published: readonly PreparedDocumentPublication<Document>[]) => Promise<void>;
}

export interface DocumentBatchRebuildResult<Document> {
  readonly requested: number;
  rebuilt: number;
  skipped: number;
  stale: number;
  readonly published: PreparedDocumentPublication<Document>[];
  readonly failures: unknown[];
  stopped: boolean;
}

export function createDocumentBatchRebuilder<Document>(input: {
  db: typeof database;
  clock: DocumentUpdateClock;
  maxPublicationBatchSize: number;
  assertRequest: (request: DocumentRebuildRequest) => DocumentRebuildRequest;
  buildMany?: (
    tx: DbTransaction,
    requests: readonly DocumentRebuildRequest[],
    observedAt: Date,
  ) => Promise<readonly DocumentBuildResult<Document>[]>;
  claimRebuilds: (requests: readonly DocumentRebuildRequest[]) => Promise<DocumentRebuildClaim[]>;
  failRebuilds: (
    claims: readonly DocumentRebuildClaim[],
    error: unknown,
    options?: { readonly skipLocked?: boolean },
  ) => Promise<void>;
  publishPreparedBatch: (
    candidates: readonly PreparedDocumentPublication<Document>[],
  ) => Promise<DocumentBatchPublicationResult<Document>>;
}) {
  return async function processRebuildBatch(
    raw: readonly DocumentRebuildRequest[],
    options: DocumentBatchRebuildOptions<Document> = {},
  ): Promise<DocumentBatchRebuildResult<Document>> {
    const configuredBatchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    const publicationBatchBytes = options.publicationBatchBytes ?? DEFAULT_PUBLICATION_BATCH_BYTES;
    for (const size of [configuredBatchSize, publicationBatchBytes]) {
      if (!Number.isSafeInteger(size) || size < 1)
        throw new RangeError("Document rebuild requires positive safe budgets");
    }
    const batchSize = Math.min(configuredBatchSize, input.maxPublicationBatchSize);
    // Validate the whole message before acquiring any processing ownership.
    const requests = raw.map(input.assertRequest);
    options.signal?.throwIfAborted();
    const report: DocumentBatchRebuildResult<Document> = {
      requested: requests.length,
      rebuilt: 0,
      skipped: 0,
      stale: 0,
      published: [],
      failures: [],
      stopped: false,
    };
    if (!requests.length) return report;
    const buildMany = input.buildMany;
    if (!buildMany) throw new Error("Document batch rebuild requires a batch builder");

    async function fail(claims: readonly DocumentRebuildClaim[], error: unknown) {
      report.failures.push(error);
      try {
        await input.failRebuilds(claims, error, { skipLocked: true });
      } catch (cleanupError) {
        report.failures.push(cleanupError);
      }
    }

    for (let offset = 0; offset < requests.length; offset += batchSize) {
      const chunk = requests.slice(offset, offset + batchSize);
      let claims: DocumentRebuildClaim[] = [];
      try {
        options.signal?.throwIfAborted();
        claims = await input.claimRebuilds(chunk);
        report.skipped += chunk.length - claims.length;
        if (!claims.length) continue;
        options.signal?.throwIfAborted();
        const observedAt = input.clock.nowDate();
        const results = await input.db.transaction(async (tx) => await buildMany(tx, claims, observedAt), {
          isolationLevel: "repeatable read",
          accessMode: "read only",
        });
        options.signal?.throwIfAborted();
        const expected = new Map(claims.map((claim) => [claim.targetId, claim.version]));
        const byTarget = new Map<number, (typeof results)[number]>();
        for (const result of results) {
          if (
            expected.get(result.targetId) !== result.version ||
            byTarget.has(result.targetId) ||
            (result.status !== "built" && result.status !== "failed")
          )
            throw new Error("Document batch result identity or version mismatch");
          byTarget.set(result.targetId, result);
        }
        if (byTarget.size !== claims.length) throw new Error("Document batch result coverage mismatch");
        const candidates: PreparedDocumentPublication<Document>[] = [];
        for (const claim of claims) {
          const result = byTarget.get(claim.targetId);
          if (!result) throw new Error("Document batch result coverage mismatch");
          if (result.status === "failed") {
            await fail([claim], result.error);
          } else {
            candidates.push({ ...claim, document: result.document, rebuiltAt: input.clock.nowDate() });
          }
        }

        const groups = publicationBatches(candidates, publicationBatchBytes, input.maxPublicationBatchSize);
        const published: PreparedDocumentPublication<Document>[] = [];
        try {
          for (const [groupIndex, group] of groups.entries()) {
            if (options.signal?.aborted) {
              report.stopped = true;
              await fail(
                groups.slice(groupIndex).flat(),
                options.signal.reason ?? new Error("Document rebuild aborted"),
              );
              break;
            }
            const outcome = await input.publishPreparedBatch(group);
            published.push(...outcome.published);
            report.published.push(...outcome.published);
            report.rebuilt += outcome.published.length;
            report.stale += outcome.stale.length;
            report.failures.push(...outcome.failed.map(({ error }) => error));
            if (outcome.stopped) {
              report.stopped = true;
              const remaining = groups.slice(groupIndex + 1).flat();
              if (remaining.length) await fail(remaining, new Error("Document publication stopped"));
              break;
            }
          }
        } finally {
          // Owners receive every confirmed commit even if a later group fails
          // unexpectedly. Unknown commits never appear in this collection.
          if (published.length) await options.onPublished?.(published);
        }
      } catch (error) {
        // A source/SQL failure invalidates the shared snapshot. Cleanup is scoped
        // to this owner; already committed and replacement-owned work is retained.
        await fail(claims, error);
        if (options.signal?.aborted) report.stopped = true;
      }
      if (report.stopped) break;
    }
    return report;
  };
}

function publicationBatches<Document>(
  candidates: readonly PreparedDocumentPublication<Document>[],
  byteLimit: number,
  targetLimit: number,
) {
  const groups: PreparedDocumentPublication<Document>[][] = [];
  let group: PreparedDocumentPublication<Document>[] = [];
  let bytes = 0;
  for (const candidate of candidates) {
    const size = Buffer.byteLength(JSON.stringify(candidate.document));
    if (group.length && (bytes + size > byteLimit || group.length >= targetLimit)) {
      groups.push(group);
      group = [];
      bytes = 0;
    }
    // A single existing large document is still published on its own.
    group.push(candidate);
    bytes += size;
  }
  if (group.length) groups.push(group);
  return groups;
}
