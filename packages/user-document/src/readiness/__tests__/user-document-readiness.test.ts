import { describe, expect, mock, test } from "bun:test";
import { createUserDocumentPostgresGate, createUserDocumentRedisAccessGate } from "@iam/user-document/worker";
import { publication } from "../../__tests__/document-fixture";
import type { DocumentBuildResult } from "../../build/document-builder.service";
import { createDocumentFactsCacheRecord } from "../../document";

const observedAt = new Date("2026-08-22T04:00:00.000Z");

describe("version-independent User Document readiness gates", () => {
  for (const kind of ["postgres", "redis"] as const) {
    test(`${kind} rejects invalid batch sizes and malformed inventory pages`, async () => {
      for (const batchSize of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
        const error = await inventoryGate(kind, [])
          .verify({ batchSize })
          .catch((error) => error);
        expect(error).toBeInstanceOf(RangeError);
      }
      for (const ids of [[2, 1], [1, 1], [0], [1.5], [Number.MAX_SAFE_INTEGER + 1], [1, 2, 3]]) {
        const error = await inventoryGate(kind, ids)
          .verify({ batchSize: 2 })
          .catch((error) => error);
        expect(error).toBeInstanceOf(Error);
      }
    });

    test(`${kind} detects an incomplete scan and accepts a complete multipage inventory`, async () => {
      const incomplete = await inventoryGate(kind, [1], 2).verify({ batchSize: 2 });
      expect(incomplete.failures).toEqual([{ code: "verified-user-count-mismatch", count: 1, samples: [] }]);
      const complete = await inventoryGate(kind, [1, 2, 3], 3, true).verify({ batchSize: 2 });
      expect(complete.status).toBe("passed");
      expect(complete.counts.verifiedUsers).toBe(3);
    });

    test(`${kind} rejects a page that repeats an earlier cursor`, async () => {
      const error = await inventoryGate(kind, [1, 2], 4)
        .verify({ batchSize: 2 })
        .catch((error) => error);
      expect(error).toBeInstanceOf(Error);
    });
  }

  test("pins the PostgreSQL gate version in composition and rebuilds every profile", async () => {
    const stored = publishedProfile(1, "3");
    const expected = {
      ...stored,
      document: { ...stored.document, name: "Current name" },
    };
    const rebuildExpected = mock(async () => [built(expected)]);
    const gate = createUserDocumentPostgresGate({
      schemaVersion: 1,
      repository: {
        readVerificationSummary: mock(async () => summary(1)),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : [],
        ),
        rebuildExpected,
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ batchSize: 100 });

    expect(rebuildExpected).toHaveBeenCalledWith([stored], observedAt, undefined);
    expect(report).toEqual({
      version: 1,
      gate: "postgres",
      verifiedAt: observedAt.toISOString(),
      status: "failed",
      counts: { users: 1, documents: 1, verifiedUsers: 1 },
      failures: [
        {
          code: "document-authoritative-mismatch",
          count: 1,
          samples: ["user:1"],
        },
      ],
    });
  });

  test("pins the Redis gate version and compares Facts plus Subject Access for all users", async () => {
    const stored = publishedProfile(1, "3");
    const expectedFacts = factsRecord(stored);
    const staleFacts = {
      ...expectedFacts,
      facts: { ...expectedFacts.facts, profile: { ...expectedFacts.facts.profile, name: "Older name" } },
    };
    const gate = createUserDocumentRedisAccessGate({
      schemaVersion: 1,
      inventory: {
        readVerificationSummary: mock(async () => summary(1)),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : [],
        ),
      },
      subjectFacts: {
        createRecord: factsRecord,
        inspectMany: mock(async () => [{ status: "valid" as const, record: staleFacts }]),
      },
      subjectAccess: {
        inspectMany: mock(async () => [
          {
            status: "valid" as const,
            record: barrierRecord(stored, "disabled"),
          },
        ]),
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ batchSize: 100 });
    expect(report).toEqual({
      version: 1,
      gate: "redis-access",
      verifiedAt: observedAt.toISOString(),
      status: "failed",
      counts: { users: 1, documents: 1, verifiedUsers: 1 },
      failures: [
        { code: "facts-mismatch", count: 1, samples: ["user:1"] },
        { code: "barrier-state-mismatch", count: 1, samples: ["user:1"] },
      ],
    });
  });

  test("fails the complete inventory when profile counts or orphan rows disagree", async () => {
    const stored = publishedProfile(1, "3");
    const gate = createUserDocumentPostgresGate({
      schemaVersion: 1,
      repository: {
        readVerificationSummary: mock(async () => ({
          userCount: 1,
          documentCount: 2,
          documentSubjectCount: 2,
          distinctDocumentSubjectCount: 2,
          orphanDocumentCount: 1,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) =>
          afterUserId === 0 ? [pageRow(stored)] : [],
        ),
        rebuildExpected: mock(async () => [built(stored)]),
      },
      clock: { nowDate: () => observedAt },
    });

    const report = await gate.verify({ batchSize: 100 });

    expect(report.failures).toEqual([
      { code: "document-count-mismatch", count: 1, samples: [] },
      { code: "document-subject-count-mismatch", count: 1, samples: [] },
      { code: "document-subject-not-unique", count: 1, samples: [] },
      { code: "orphan-document", count: 1, samples: [] },
    ]);
  });

  test.each([
    { label: "missing result", results: [] },
    { label: "wrong user", results: [built(publishedProfile(2, "3"))] },
    { label: "wrong version", results: [built(publishedProfile(1, "4"))] },
    {
      label: "inconsistent document identity",
      results: [{ ...built(publishedProfile(1, "3")), document: publishedProfile(2, "3") }],
    },
  ])("rejects an authoritative rebuild with $label", async ({ results }) => {
    const stored = publishedProfile(1, "3");
    const gate = postgresGateWithResults(stored, results);
    const error = await gate.verify({ batchSize: 1 }).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
  });

  test("propagates unexpected per-user build failures without returning a data failure report", async () => {
    const stored = publishedProfile(1, "3");
    const failure = new Error("Unexpected assembler failure");
    const gate = postgresGateWithResults(stored, [
      { userId: stored.userId, sourceVersion: stored.sourceVersion, status: "failed", error: failure },
    ]);
    const error = await gate.verify({ batchSize: 1 }).catch((error: unknown) => error);
    expect(error).toBe(failure);
  });

  test.each(["facts", "access"])("stops Redis verification on an %s inspection failure", async (stage) => {
    const stored = publishedProfile(1, "3");
    const failure = new Error("Redis unavailable");
    let scans = 0;
    let accessReads = 0;
    const gate = createUserDocumentRedisAccessGate({
      schemaVersion: 1,
      clock: { nowDate: () => observedAt },
      inventory: {
        readVerificationSummary: async () => summary(2),
        async scanPage() {
          scans += 1;
          return [pageRow(stored)];
        },
      },
      subjectFacts: {
        createRecord: factsRecord,
        async inspectMany() {
          if (stage === "facts") throw failure;
          return [{ status: "valid" as const, record: factsRecord(stored) }];
        },
      },
      subjectAccess: {
        async inspectMany() {
          accessReads += 1;
          throw failure;
        },
      },
    });
    const error = await gate.verify({ batchSize: 1 }).catch((error: unknown) => error);
    expect(error).toBe(failure);
    expect(scans).toBe(1);
    expect(accessReads).toBe(stage === "facts" ? 0 : 1);
  });

  for (const kind of ["postgres", "redis"] as const) {
    for (const stage of [
      "before-start",
      "summary",
      "scan",
      ...(kind === "postgres" ? ["build"] : ["facts", "access"]),
    ]) {
      test(`${kind} stops after cancellation at ${stage} without starting subsequent I/O`, async () => {
        const controller = new AbortController();
        const reason = new Error("Verification cancelled");
        const calls: string[] = [];
        const profiles = [1, 2, 3].map((id) => publishedProfile(id, "3"));
        function visit(name: string) {
          calls.push(name);
          if (stage === name) controller.abort(reason);
        }
        const inventory = {
          async readVerificationSummary() {
            visit("summary");
            return summary(profiles.length);
          },
          async scanPage({ afterUserId, limit }: { afterUserId: number; limit: number }) {
            visit("scan");
            return profiles
              .filter((profile) => profile.userId > afterUserId)
              .slice(0, limit)
              .map(pageRow);
          },
        };
        const gate =
          kind === "postgres"
            ? createUserDocumentPostgresGate({
                schemaVersion: 1,
                clock: { nowDate: () => observedAt },
                repository: {
                  ...inventory,
                  async rebuildExpected(documents) {
                    visit("build");
                    return documents.map(built);
                  },
                },
              })
            : createUserDocumentRedisAccessGate({
                schemaVersion: 1,
                clock: { nowDate: () => observedAt },
                inventory,
                subjectFacts: {
                  createRecord: factsRecord,
                  async inspectMany(subjects) {
                    visit("facts");
                    return subjects.map((subject) => ({
                      status: "valid" as const,
                      record: factsRecord(profiles.find((profile) => profile.subjectIdentifier === subject)!),
                    }));
                  },
                },
                subjectAccess: {
                  async inspectMany(subjects) {
                    visit("access");
                    return subjects.map((subject) => ({
                      status: "valid" as const,
                      record: barrierRecord(
                        profiles.find((profile) => profile.subjectIdentifier === subject)!,
                        "enabled",
                      ),
                    }));
                  },
                },
              });
        if (stage === "before-start") controller.abort(reason);
        const error = await gate.verify({ batchSize: 2, signal: controller.signal }).catch((error: unknown) => error);
        expect(error).toBe(reason);
        if (stage === "before-start") expect(calls).toEqual([]);
        else {
          expect(calls.at(-1)).toBe(stage);
          expect(calls.filter((call) => call === "scan").length).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});

function inventoryGate(kind: "postgres" | "redis", ids: number[], count = ids.length, paginate = false) {
  const profiles = ids.map((id) => publishedProfile(id, "3"));
  const inventory = {
    readVerificationSummary: async () => summary(count),
    scanPage: async ({ afterUserId, limit }: { afterUserId: number; limit: number }) =>
      (paginate ? profiles.filter((profile) => profile.userId > afterUserId).slice(0, limit) : profiles).map(pageRow),
  };
  if (kind === "postgres") {
    return createUserDocumentPostgresGate({
      schemaVersion: 1,
      repository: { ...inventory, rebuildExpected: async (profiles) => profiles.map(built) },
      clock: { nowDate: () => observedAt },
    });
  }
  return createUserDocumentRedisAccessGate({
    schemaVersion: 1,
    inventory,
    subjectFacts: {
      createRecord: factsRecord,
      inspectMany: async (subjects) =>
        subjects.map((subject) => ({
          status: "valid" as const,
          record: factsRecord(profiles.find((profile) => profile.subjectIdentifier === subject)!),
        })),
    },
    subjectAccess: {
      inspectMany: async (subjects) =>
        subjects.map((subject) => ({
          status: "valid" as const,
          record: barrierRecord(profiles.find((profile) => profile.subjectIdentifier === subject)!, "enabled"),
        })),
    },
    clock: { nowDate: () => observedAt },
  });
}

function built(document: ReturnType<typeof publishedProfile>) {
  return { userId: document.userId, sourceVersion: document.sourceVersion, status: "built" as const, document };
}

function postgresGateWithResults(
  stored: ReturnType<typeof publishedProfile>,
  results: readonly DocumentBuildResult<ReturnType<typeof publishedProfile>>[],
) {
  return createUserDocumentPostgresGate({
    schemaVersion: 1,
    clock: { nowDate: () => observedAt },
    repository: {
      readVerificationSummary: async () => summary(1),
      scanPage: async () => [pageRow(stored)],
      rebuildExpected: async () => [...results],
    },
  });
}

function summary(count: number) {
  return {
    userCount: count,
    documentCount: count,
    documentSubjectCount: count,
    distinctDocumentSubjectCount: count,
    orphanDocumentCount: 0,
  };
}

function pageRow(currentDocument: ReturnType<typeof publishedProfile>) {
  return {
    userId: currentDocument.userId,
    subjectIdentifier: currentDocument.subjectIdentifier,
    accountAvailable: true,
    currentDocument,
    backfillCompleted: true,
    documentIssue: null,
  };
}

function factsRecord(source: ReturnType<typeof publishedProfile>) {
  const record = createDocumentFactsCacheRecord(source);
  if (record.kind !== "document") throw new Error("Fixture requires document");
  return record;
}

function barrierRecord(source: ReturnType<typeof publishedProfile>, state: "disabled" | "enabled") {
  return {
    version: 1 as const,
    subjectIdentifier: source.subjectIdentifier,
    state,
    transitionId: "10000000-0000-4000-8000-000000000001",
    updatedAt: observedAt.toISOString(),
  };
}

function publishedProfile(userId: number, sourceVersion: string) {
  return publication(userId, sourceVersion);
}
