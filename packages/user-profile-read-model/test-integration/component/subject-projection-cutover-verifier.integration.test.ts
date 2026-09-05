import type { PublishedUserProfile } from "../../src/schema/user-profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectProjectionCutoverVerifier } from "../../src/cutover/subject-projection-cutover-verifier";

const verifiedAt = new Date("2026-08-01T04:00:00.000Z");
const enabledProfile = profile(1, "3", UserStatus.Enable, false);
const disabledProfile = profile(2, "5", UserStatus.Disable, true);

describe("Subject Projection cutover verifier", () => {
  test("returns a localized fail-closed report for projection, Facts, Barrier, and Client failures", async () => {
    const verify = createSubjectProjectionCutoverVerifier({
      projection: {
        readVerificationSummary: mock(async () => ({
          userCount: 2,
          profileCount: 1,
          profileSubjectCount: 1,
          distinctProfileSubjectCount: 1,
          orphanProfileCount: 0,
        })),
        scanPage: mock(async () => [{
          userId: 1,
          subjectIdentifier: enabledProfile.subjectIdentifier,
          accountAvailable: true,
          currentProfile: enabledProfile,
        }, {
          userId: 2,
          subjectIdentifier: disabledProfile.subjectIdentifier,
          accountAvailable: false,
          currentProfile: null,
        }]),
      },
      subjectFacts: {
        inspectMany: mock(async () => [{
          status: "valid" as const,
          record: factsRecord(enabledProfile, "2"),
        }, { status: "missing" as const }]),
      },
      subjectAccess: {
        inspectMany: mock(async () => [{
          status: "valid" as const,
          record: {
            version: 1 as const,
            subjectIdentifier: enabledProfile.subjectIdentifier,
            state: "disabled" as const,
            transitionId: "10000000-0000-4000-8000-000000000001",
            updatedAt: verifiedAt.toISOString(),
          },
        }, { status: "missing" as const }]),
      },
      clients: {
        verifyManifest: mock(async () => ({
          failures: [{ clientCode: "independent", reason: "secret-delivery-unconfirmed" }],
        })),
      },
      clock: { nowDate: () => verifiedAt },
    });

    const report = await verify.verify({
      version: 1,
      batchSize: 100,
      manifest: { cutoverId: "cutover-v1" },
    });

    expect(report.status).toBe("failed");
    expect(report.counts).toEqual({ users: 2, profiles: 1, verifiedUsers: 2 });
    expect(report.failures).toEqual([
      { code: "profile-count-mismatch", count: 1, samples: ["expected:2", "actual:1"] },
      { code: "profile-subject-count-mismatch", count: 1, samples: ["expected:2", "actual:1"] },
      { code: "profile-subject-not-unique", count: 1, samples: ["expected:2", "actual:1"] },
      { code: "profile-not-current", count: 1, samples: ["user:2"] },
      { code: "facts-version-mismatch", count: 1, samples: [enabledProfile.subjectIdentifier] },
      { code: "facts-missing", count: 1, samples: [disabledProfile.subjectIdentifier] },
      { code: "barrier-state-mismatch", count: 1, samples: [enabledProfile.subjectIdentifier] },
      { code: "barrier-missing", count: 1, samples: [disabledProfile.subjectIdentifier] },
      { code: "client-secret-delivery-unconfirmed", count: 1, samples: ["independent"] },
    ]);
    expect(JSON.stringify(report)).not.toContain("subjectFacts");
    expect(JSON.stringify(report)).not.toContain("transitionId");
  });

  test("passes only when every database and Redis record is current", async () => {
    const rows = [enabledProfile, disabledProfile].map(currentProfile => ({
      userId: currentProfile.userId,
      subjectIdentifier: currentProfile.subjectIdentifier,
      accountAvailable: currentProfile.status === UserStatus.Enable && !currentProfile.isDelete,
      currentProfile,
    }));
    const verify = createSubjectProjectionCutoverVerifier({
      projection: {
        readVerificationSummary: mock(async () => ({
          userCount: 2,
          profileCount: 2,
          profileSubjectCount: 2,
          distinctProfileSubjectCount: 2,
          orphanProfileCount: 0,
        })),
        scanPage: mock(async ({ afterUserId }: { afterUserId: number }) => afterUserId === 0 ? rows : []),
      },
      subjectFacts: {
        inspectMany: mock(async () => rows.map(row => ({
          status: "valid" as const,
          record: factsRecord(row.currentProfile, row.currentProfile.sourceDirtyVersion),
        }))),
      },
      subjectAccess: {
        inspectMany: mock(async () => rows.map(row => ({
          status: "valid" as const,
          record: {
            version: 1 as const,
            subjectIdentifier: row.subjectIdentifier,
            state: row.accountAvailable ? "enabled" as const : "disabled" as const,
            transitionId: "10000000-0000-4000-8000-000000000001",
            updatedAt: verifiedAt.toISOString(),
          },
        }))),
      },
      clients: { verifyManifest: mock(async () => ({ failures: [] })) },
      clock: { nowDate: () => verifiedAt },
    });

    await expect(verify.verify({
      version: 1,
      batchSize: 2,
      manifest: { cutoverId: "cutover-v1" },
    })).resolves.toEqual({
      version: 1,
      cutoverId: "cutover-v1",
      verifiedAt: verifiedAt.toISOString(),
      status: "passed",
      counts: { users: 2, profiles: 2, verifiedUsers: 2 },
      failures: [],
    });
  });
});

function factsRecord(profile: PublishedUserProfile, sourceDirtyVersion: string) {
  return {
    schemaVersion: 1 as const,
    sourceDirtyVersion,
    publishedAt: verifiedAt.toISOString(),
    subjectIdentifier: profile.subjectIdentifier,
    profile: { username: profile.username, name: profile.name, phone: profile.mobile },
    facts: profile.subjectFacts,
  };
}

function profile(
  userId: number,
  sourceDirtyVersion: string,
  status: UserStatus,
  isDelete: boolean,
): PublishedUserProfile {
  return {
    userId,
    subjectIdentifier: `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`,
    username: `user-${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status,
    isDelete,
    searchVisible: status === UserStatus.Enable && !isDelete,
    profileSchemaVersion: 1,
    sourceDirtyVersion,
    detail: {
      id: userId,
      username: `user-${userId}`,
      name: `User ${userId}`,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: userId,
      status,
      isDelete,
      createTime: verifiedAt,
      updateTime: verifiedAt,
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
        status,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: verifiedAt,
  };
}
