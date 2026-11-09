import { isDeepStrictEqual } from "node:util";
import { OrganizationResponsibilityIntegrityError } from "@iam/assignment-resolution/organization-responsibility";
import type { SubjectAccessRecord } from "@iam/subject-access";
import { ZodError } from "zod";
import { UserDocumentSourceIntegrityError } from "../build/document-build.error";
import type { DocumentBuildResult } from "../build/document-builder.service";
import { assertUserDocumentInventoryPage, requirePositiveSafeInteger } from "./user-document-inventory.guards";

export interface UserDocumentReadinessProjection {
  userId: number;
  subjectIdentifier: string;
  sourceVersion: string;
  publishedAt: Date;
}

export interface UserDocumentReadinessPageRow<
  TDocument extends UserDocumentReadinessProjection = UserDocumentReadinessProjection,
> {
  userId: number;
  subjectIdentifier: string;
  accountAvailable: boolean;
  currentDocument: TDocument | null;
  documentIssue: string | null;
}

export interface UserDocumentVerificationSummary {
  userCount: number;
  documentCount: number;
  documentSubjectCount: number;
  distinctDocumentSubjectCount: number;
  orphanDocumentCount: number;
  workFailures?: UserDocumentGateFailure[];
  workCounts?: Record<string, number>;
}

export interface UserDocumentReadinessInventoryPort<
  TDocument extends UserDocumentReadinessProjection = UserDocumentReadinessProjection,
> {
  readVerificationSummary: (signal?: AbortSignal) => Promise<UserDocumentVerificationSummary>;
  scanPage: (input: {
    afterUserId: number;
    limit: number;
    signal?: AbortSignal;
  }) => Promise<Array<UserDocumentReadinessPageRow<TDocument>>>;
}

export interface UserDocumentGateFailure {
  code: string;
  count: number;
  samples: string[];
}

type InspectionResult<T> = { status: "invalid" | "missing" } | { status: "valid"; record: T };

export function createUserDocumentPostgresGate<TDocument extends UserDocumentReadinessProjection>(deps: {
  schemaVersion: number;
  repository: UserDocumentReadinessInventoryPort<TDocument> & {
    rebuildExpected: (
      profiles: TDocument[],
      observedAt: Date,
      signal?: AbortSignal,
    ) => Promise<DocumentBuildResult<TDocument>[]>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { batchSize: number; signal?: AbortSignal }) {
      const observedAt = deps.clock.nowDate();
      return await runUserDocumentInventoryGate({
        version: deps.schemaVersion,
        gate: "postgres",
        observedAt,
        batchSize: input.batchSize,
        signal: input.signal,
        inventory: deps.repository,
        async checkPage(page, failures) {
          for (const row of page) {
            if (row.currentDocument === null) failures.add(row.documentIssue ?? "document-invalid", row.userId);
          }
          const currentDocuments = page
            .map((row) => row.currentDocument)
            .filter((profile): profile is TDocument => profile !== null);
          input.signal?.throwIfAborted();
          const results = await deps.repository.rebuildExpected(currentDocuments, observedAt, input.signal);
          input.signal?.throwIfAborted();
          if (
            results.length !== currentDocuments.length ||
            results.some(
              (result, index) =>
                result.userId !== currentDocuments[index]!.userId ||
                result.sourceVersion !== currentDocuments[index]!.sourceVersion,
            )
          ) {
            throw new Error("User Document PostgreSQL gate authoritative rebuild was incomplete");
          }
          results.forEach((result, index) => {
            const profile = currentDocuments[index]!;
            if (result.status === "failed") {
              if (
                !(result.error instanceof UserDocumentSourceIntegrityError) &&
                !(result.error instanceof OrganizationResponsibilityIntegrityError) &&
                !(result.error instanceof ZodError)
              )
                throw result.error;
              failures.add("document-source-invalid", result.userId);
              return;
            }
            if (
              result.document.userId !== profile.userId ||
              result.document.subjectIdentifier !== profile.subjectIdentifier ||
              result.document.sourceVersion !== profile.sourceVersion
            )
              throw new Error("User Document PostgreSQL gate authoritative rebuild identity was inconsistent");
            if (!isDeepStrictEqual(withoutRebuiltAt(profile), withoutRebuiltAt(result.document))) {
              failures.add("document-authoritative-mismatch", profile.userId);
            }
          });
        },
      });
    },
  };
}

export function createUserDocumentRedisAccessGate<
  TDocument extends UserDocumentReadinessProjection,
  TFactsRecord,
>(deps: {
  schemaVersion: number;
  inventory: UserDocumentReadinessInventoryPort<TDocument>;
  subjectFacts: {
    createRecord: (profile: TDocument) => TFactsRecord;
    inspectMany: (subjectIdentifiers: string[]) => Promise<Array<InspectionResult<TFactsRecord>>>;
  };
  subjectAccess: {
    inspectMany: (subjectIdentifiers: string[]) => Promise<Array<InspectionResult<SubjectAccessRecord>>>;
  };
  clock: { nowDate: () => Date };
}) {
  return {
    async verify(input: { batchSize: number; signal?: AbortSignal }) {
      const observedAt = deps.clock.nowDate();
      return await runUserDocumentInventoryGate({
        version: deps.schemaVersion,
        gate: "redis-access",
        observedAt,
        batchSize: input.batchSize,
        signal: input.signal,
        inventory: deps.inventory,
        async checkPage(page, failures) {
          const subjectIdentifiers = page.map((row) => row.subjectIdentifier);
          input.signal?.throwIfAborted();
          const facts = await deps.subjectFacts.inspectMany(subjectIdentifiers);
          input.signal?.throwIfAborted();
          const access = await deps.subjectAccess.inspectMany(subjectIdentifiers);
          input.signal?.throwIfAborted();
          if (facts.length !== page.length || access.length !== page.length) {
            throw new Error("User Document Redis gate inspection returned an incomplete batch");
          }
          page.forEach((row, index) => {
            const factsResult = facts[index]!;
            if (factsResult.status !== "valid") {
              failures.add(`facts-${factsResult.status}`, row.userId);
            } else if (row.currentDocument === null) {
              failures.add("facts-without-current-document", row.userId);
            } else {
              const expected = deps.subjectFacts.createRecord(row.currentDocument);
              if (!isDeepStrictEqual(factsResult.record, expected)) failures.add("facts-mismatch", row.userId);
            }

            const accessResult = access[index]!;
            if (accessResult.status !== "valid") {
              failures.add(`barrier-${accessResult.status}`, row.userId);
            } else if (
              accessResult.record.subjectIdentifier !== row.subjectIdentifier ||
              accessResult.record.state !== (row.accountAvailable ? "enabled" : "disabled")
            ) {
              failures.add("barrier-state-mismatch", row.userId);
            }
          });
        },
      });
    },
  };
}

async function runUserDocumentInventoryGate<TDocument extends UserDocumentReadinessProjection>(input: {
  version: number;
  gate: "postgres" | "redis-access";
  batchSize: number;
  signal?: AbortSignal;
  observedAt: Date;
  inventory: UserDocumentReadinessInventoryPort<TDocument>;
  checkPage: (
    page: Array<UserDocumentReadinessPageRow<TDocument>>,
    failures: ReturnType<typeof createUserDocumentGateFailureCollector>,
  ) => Promise<void>;
}) {
  requirePositiveSafeInteger(input.batchSize, "batchSize");
  input.signal?.throwIfAborted();
  const summary = await input.inventory.readVerificationSummary(input.signal);
  input.signal?.throwIfAborted();
  const failures = createUserDocumentGateFailureCollector();
  collectUserDocumentSummaryFailures(summary, failures.add);
  for (const failure of summary.workFailures ?? []) failures.include(failure);
  let afterUserId = 0;
  let verifiedUsers = 0;
  while (true) {
    input.signal?.throwIfAborted();
    const page = await input.inventory.scanPage({
      afterUserId,
      limit: input.batchSize,
      signal: input.signal,
    });
    input.signal?.throwIfAborted();
    if (page.length === 0) break;
    assertUserDocumentInventoryPage(page, afterUserId, input.batchSize);
    verifiedUsers += page.length;
    await input.checkPage(page, failures);
    input.signal?.throwIfAborted();
    afterUserId = page.at(-1)!.userId;
    if (page.length < input.batchSize) break;
  }
  input.signal?.throwIfAborted();
  if (verifiedUsers !== summary.userCount) {
    failures.add("verified-user-count-mismatch", undefined, Math.abs(summary.userCount - verifiedUsers));
  }
  const report = failures.report();
  return {
    version: input.version,
    gate: input.gate,
    verifiedAt: input.observedAt.toISOString(),
    status: report.length === 0 ? ("passed" as const) : ("failed" as const),
    counts: {
      users: summary.userCount,
      documents: summary.documentCount,
      verifiedUsers,
      ...summary.workCounts,
    },
    failures: report,
  };
}

function createUserDocumentGateFailureCollector() {
  const failures = new Map<string, { count: number; samples: string[] }>();
  return {
    include(failure: UserDocumentGateFailure) {
      const previous = failures.get(failure.code) ?? { count: 0, samples: [] };
      previous.count += failure.count;
      previous.samples = [...new Set([...previous.samples, ...failure.samples])].slice(0, 10);
      failures.set(failure.code, previous);
    },
    add(code: string, userId?: number, count = 1) {
      const failure = failures.get(code) ?? { count: 0, samples: [] };
      failure.count += count;
      const sample = userId === undefined ? undefined : `user:${userId}`;
      if (sample !== undefined && failure.samples.length < 10 && !failure.samples.includes(sample)) {
        failure.samples.push(sample);
      }
      failures.set(code, failure);
    },
    report(): UserDocumentGateFailure[] {
      return [...failures].map(([code, failure]) => ({ code, ...failure }));
    },
  };
}

function collectUserDocumentSummaryFailures(
  summary: UserDocumentVerificationSummary,
  add: (code: string, userId?: number, count?: number) => void,
) {
  if (summary.documentCount !== summary.userCount) {
    add("document-count-mismatch", undefined, Math.abs(summary.userCount - summary.documentCount));
  }
  if (summary.documentSubjectCount !== summary.userCount) {
    add("document-subject-count-mismatch", undefined, Math.abs(summary.userCount - summary.documentSubjectCount));
  }
  if (summary.distinctDocumentSubjectCount !== summary.userCount) {
    add("document-subject-not-unique", undefined, Math.abs(summary.userCount - summary.distinctDocumentSubjectCount));
  }
  if (summary.orphanDocumentCount > 0) add("orphan-document", undefined, summary.orphanDocumentCount);
}

function withoutRebuiltAt<TDocument extends UserDocumentReadinessProjection>(profile: TDocument) {
  const { publishedAt: _publishedAt, ...comparable } = profile;
  return comparable;
}
