import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";
import { UserDocumentRebuildReason, UserStatus, UserType } from "@iam/contracts";
import { publication } from "../../src/__tests__/document-fixture";
import { PublishedUserDocumentSchema } from "../../src/index";
import { createCurrentUserDocumentProjectionBundle, createUserDocumentRedisAccessGate } from "../../src/worker";
import { createRedisTestHarness } from "../support/redis-test-harness";

const OBSERVED_AT = new Date("2026-08-22T08:00:00.000Z");
const PROCESS_COMPLETED_AT = new Date("2026-08-22T08:00:01.000Z");

describe("User Document schema 1 Redis readiness", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });
  afterEach(async () => {
    await harness?.reset();
  });

  test("rejects old and missing Facts before accepting the complete current inventory", async () => {
    const scope = await harness.createScope();
    const projection = createCurrentUserDocumentProjectionBundle();
    const profiles = [profile(1, "3"), profile(2, "5"), profile(3, "7")];
    const publisher = projection.subjectFacts.createPublisher(scope.projectionRedis.publisher, {
      keyPrefix: scope.projectionRedis.keyPrefix,
    });
    const inspector = projection.subjectFacts.createInspector(scope.projectionRedis.inspector, {
      keyPrefix: scope.projectionRedis.keyPrefix,
    });
    await publisher.publish(projection.subjectFacts.createRecord(profiles[0]!));
    const staleFacts = {
      ...projection.subjectFacts.createRecord(profiles[1]!),
      schemaVersion: 3,
    };
    await scope.projectionRedis.publisher.eval(
      "redis.call('SET', KEYS[1], ARGV[2]); return 1",
      1,
      `${scope.projectionRedis.keyPrefix}${profiles[1]!.subjectIdentifier}`,
      staleFacts.sourceVersion,
      JSON.stringify(staleFacts),
    );
    await scope.subjectAccessBootstrap.seedMany(
      profiles.map((item) => ({
        subjectIdentifier: item.subjectIdentifier,
        state: "enabled" as const,
      })),
      OBSERVED_AT,
    );

    const gate = createUserDocumentRedisAccessGate({
      schemaVersion: projection.schemaVersion,
      inventory: inventory(profiles),
      subjectFacts: {
        createRecord: projection.subjectFacts.createRecord,
        inspectMany: inspector.inspectMany,
      },
      subjectAccess: scope.subjectAccessBootstrap,
      clock: { nowDate: () => OBSERVED_AT },
    });

    const incompleteReport = await gate.verify({ batchSize: 2 });
    expect(incompleteReport.failures).toEqual([
      { code: "facts-invalid", count: 1, samples: ["user:2"] },
      { code: "facts-missing", count: 1, samples: ["user:3"] },
    ]);

    for (const item of profiles.slice(1)) await publisher.publish(projection.subjectFacts.createRecord(item));
    const passedReport = await gate.verify({ batchSize: 2 });
    expect(passedReport).toMatchObject({
      version: 1,
      status: "passed",
      counts: { users: 3, documents: 3, verifiedUsers: 3 },
      failures: [],
    });
  });
});

function inventory(profiles: ReturnType<typeof profile>[]) {
  return {
    async readVerificationSummary() {
      return {
        userCount: profiles.length,
        documentCount: profiles.length,
        documentSubjectCount: profiles.length,
        distinctDocumentSubjectCount: profiles.length,
        orphanDocumentCount: 0,
      };
    },
    async scanPage({ afterUserId, limit }: { afterUserId: number; limit: number }) {
      return profiles
        .filter((item) => item.userId > afterUserId)
        .slice(0, limit)
        .map((item) => ({
          userId: item.userId,
          subjectIdentifier: item.subjectIdentifier,
          accountAvailable: true,
          currentDocument: item,
          backfillCompleted: true,
          documentIssue: null,
        }));
    },
  };
}

function profile(userId: number, sourceVersion: string) {
  return publication(userId, sourceVersion);
}
