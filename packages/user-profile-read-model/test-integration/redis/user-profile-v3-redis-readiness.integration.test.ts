import { UserProfileDirtyReason, UserStatus, UserType } from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  V3UserProfileSchema,
} from "../../src/v3";
import {
  createCurrentUserProfileProjectionBundle,
  createUserProfileRebuildProcessor,
  createUserProfileRedisAccessGate,
} from "../../src/worker";
import { createRedisTestHarness } from "./redis-test-harness";

const OBSERVED_AT = new Date("2026-08-22T08:00:00.000Z");
const PROCESS_COMPLETED_AT = new Date("2026-08-22T08:00:01.000Z");

describe("User Profile v3 Redis readiness", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("rejects old and missing Facts before accepting the complete v3 inventory", async () => {
    const scope = await harness.createScope();
    try {
      const projection = createCurrentUserProfileProjectionBundle();
      const profiles = [profile(1, "3"), profile(2, "5"), profile(3, "7")];
      const publisher = projection.subjectFacts.createPublisher(
        scope.projectionRedis.publisher,
        { keyPrefix: scope.projectionRedis.keyPrefix },
      );
      const inspector = projection.subjectFacts.createInspector(
        scope.projectionRedis.inspector,
        { keyPrefix: scope.projectionRedis.keyPrefix },
      );
      await publisher.publish(
        projection.subjectFacts.createRecord(profiles[0]!, OBSERVED_AT),
      );
      const staleFacts = {
        ...projection.subjectFacts.createRecord(profiles[1]!, OBSERVED_AT),
        schemaVersion: 2,
      };
      await scope.projectionRedis.publisher.eval(
        "redis.call('SET', KEYS[1], ARGV[2]); return 1",
        1,
        `${scope.projectionRedis.keyPrefix}${profiles[1]!.subjectIdentifier}`,
        staleFacts.sourceDirtyVersion,
        JSON.stringify(staleFacts),
      );
      await scope.subjectAccessBootstrap.seedMany(profiles.map(item => ({
        subjectIdentifier: item.subjectIdentifier,
        state: "enabled" as const,
      })), OBSERVED_AT);

      const gate = createUserProfileRedisAccessGate({
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

      for (const item of profiles.slice(1)) {
        const processor = createUserProfileRebuildProcessor({
          dirtyRepository: {
            claimForProcessing: async () => item,
            markFailed: async () => item,
          },
          builder: { buildOne: async () => item },
          publicationRepository: {
            publishCandidate: async () => ({ status: "published" as const }),
          },
          createSubjectFactsRecord: projection.subjectFacts.createRecord,
          subjectFactsPublisher: publisher,
          subjectAccessRepair: { repairSubject: async () => ({ status: "enabled" }) },
          logger: { warn() {} },
          clock: { nowDate: () => PROCESS_COMPLETED_AT },
        });
        const result = await processor.process({
          userId: item.userId,
          dirtyVersion: item.sourceDirtyVersion,
          reason: UserProfileDirtyReason.Backfill,
        });
        expect(result.status).toBe("rebuilt");
      }
      const passedReport = await gate.verify({ batchSize: 2 });
      expect(passedReport).toMatchObject({
        version: 3,
        status: "passed",
        counts: { users: 3, profiles: 3, verifiedUsers: 3 },
        failures: [],
      });
    }
    finally {
      await scope.close();
    }
  });
});

function inventory(profiles: ReturnType<typeof profile>[]) {
  return {
    async readVerificationSummary() {
      return {
        userCount: profiles.length,
        profileCount: profiles.length,
        profileSubjectCount: profiles.length,
        distinctProfileSubjectCount: profiles.length,
        orphanProfileCount: 0,
      };
    },
    async scanPage({ afterUserId, limit }: { afterUserId: number; limit: number }) {
      return profiles
        .filter(item => item.userId > afterUserId)
        .slice(0, limit)
        .map(item => ({
          userId: item.userId,
          subjectIdentifier: item.subjectIdentifier,
          accountAvailable: true,
          currentProfile: item,
          backfillCompleted: true,
          profileIssue: null,
        }));
    },
  };
}

function profile(userId: number, sourceDirtyVersion: string) {
  const subjectIdentifier
    = `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`;
  return V3UserProfileSchema.parse({
    userId,
    subjectIdentifier,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 3,
    sourceDirtyVersion,
    detail: {
      id: userId,
      username: `user-${userId}`,
      name: `User ${userId}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: userId,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: OBSERVED_AT,
      updateTime: OBSERVED_AT,
      employments: [],
      roles: [],
      privileges: [],
    },
    searchDoc: {
      user: {
        subjectIdentifier,
        username: `user-${userId}`,
        name: `User ${userId}`,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: OBSERVED_AT,
  });
}
