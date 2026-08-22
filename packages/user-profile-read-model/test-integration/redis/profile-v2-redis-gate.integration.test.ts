import type { SubjectFactsCacheRecord } from "../../src/profile-cache";
import type { PublishedProfile } from "../../src/profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createSubjectFactsCacheRecord } from "../../src/profile-cache";
import { createProfileV2RedisAccessGate } from "../../src/worker";
import { createRedisTestHarness } from "./redis-test-harness";

const OBSERVED_AT = new Date("2026-08-21T08:00:00.000Z");

describe("Profile V2 Redis gate", () => {
  let harness: Awaited<ReturnType<typeof createRedisTestHarness>>;

  beforeAll(async () => {
    harness = await createRedisTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("checks multi-page Facts and Subject Access records with bounded User IDs", async () => {
    const scope = await harness.createScope();
    try {
      const profiles = [profile(1, "3"), profile(2, "5"), profile(3, "7")];
      const currentProfile = profiles[2]!;
      const wrongFacts: SubjectFactsCacheRecord = {
        ...createSubjectFactsCacheRecord(
          currentProfile,
          currentProfile.rebuiltAt,
        ),
        sourceDirtyVersion: "4",
      };
      await Promise.all([
        ...profiles.slice(0, 2).map(async profile =>
          await scope.firstProfilePublisher.publish(
            createSubjectFactsCacheRecord(profile, profile.rebuiltAt),
          )),
        scope.firstProfilePublisher.publish(wrongFacts),
      ]);
      await scope.subjectAccessBootstrap.seedMany(profiles.map((profile, index) => ({
        subjectIdentifier: profile.subjectIdentifier,
        state: index === 2 ? "disabled" as const : "enabled" as const,
      })), OBSERVED_AT);
      let inventoryReads = 0;
      let factsInspections = 0;
      const gate = createProfileV2RedisAccessGate({
        inventory: {
          async readVerificationSummary() {
            return {
              userCount: 3,
              profileCount: 3,
              profileSubjectCount: 3,
              distinctProfileSubjectCount: 3,
              orphanProfileCount: 0,
            };
          },
          async scanPage({ afterUserId }) {
            inventoryReads += 1;
            return profiles
              .filter(profile => profile.userId > afterUserId)
              .slice(0, 2)
              .map(profile => ({
                userId: profile.userId,
                subjectIdentifier: profile.subjectIdentifier,
                accountAvailable: true,
                currentProfile: profile,
                backfillCompleted: true,
                profileIssue: null,
              }));
          },
        },
        subjectFacts: {
          async inspectMany(subjectIdentifiers) {
            factsInspections += 1;
            return await scope.profileInspector.inspectMany(subjectIdentifiers);
          },
        },
        subjectAccess: scope.subjectAccessBootstrap,
        clock: { nowDate: () => OBSERVED_AT },
      });

      const report = await gate.verify({ version: 2, batchSize: 2 });

      expect(report.failures).toEqual([
        { code: "facts-mismatch", count: 1, samples: ["user:3"] },
        { code: "barrier-state-mismatch", count: 1, samples: ["user:3"] },
      ]);
      expect({ inventoryReads, factsInspections }).toEqual({
        inventoryReads: 2,
        factsInspections: 2,
      });
      for (const profile of profiles)
        expect(JSON.stringify(report)).not.toContain(profile.subjectIdentifier);
    }
    finally {
      await scope.close();
    }
  });
});

function profile(userId: number, sourceDirtyVersion: string): PublishedProfile {
  return {
    userId,
    subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 2,
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
        id: userId,
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
  };
}
