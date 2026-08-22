import {
  UserProfileDirtyStatus,
  UserStatus,
} from "@iam/contracts";
import {
  userProfileDirty,
  userProfiles,
  users,
} from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectAccessAuthorityRepository } from "../../src/subject-access-authority.repository";

const subjectIdentifier = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Access authority repository", () => {
  test("publishes one narrow current Profile row before reporting enabled/current", async () => {
    const { db, select, limit } = createDb([authorityRow()]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "enabled",
      factsState: "current",
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(publish).toHaveBeenCalledWith({
      schemaVersion: 2,
      sourceDirtyVersion: "7",
      publishedAt: "2026-07-31T10:00:00.000Z",
      subjectIdentifier,
      profile: {
        username: "alice",
        name: "Alice",
        phone: null,
      },
      facts: {
        employments: [],
      },
    });
  });

  test.each([
    ["profile missing", { ...authorityRow(), profileSubjectIdentifier: null }],
    ["Dirty pending", { ...authorityRow(), dirtyStatus: UserProfileDirtyStatus.Pending }],
    ["version mismatch", { ...authorityRow(), dirtyVersion: "8" }],
    ["Facts invalid", { ...authorityRow(), subjectFacts: { employments: "legacy" } }],
  ])("keeps an enabled account not-current when %s", async (_, row) => {
    const { db } = createDb([row]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "enabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });

  test.each([
    ["disabled", { ...authorityRow(), accountStatus: UserStatus.Disable }],
    ["deleted", { ...authorityRow(), accountDeleted: true }],
    ["missing", undefined],
  ])("reports %s accounts disabled without reading or publishing Facts", async (_, row) => {
    const { db } = createDb(row === undefined ? [] : [row]);
    const publish = mock(async () => ({ status: "published" as const }));
    const authority = createSubjectAccessAuthorityRepository({
      db,
      subjectFactsPublisher: { publish },
    });

    await expect(authority.resolve(subjectIdentifier)).resolves.toEqual({
      accountState: "disabled",
      factsState: "not_current",
    });
    expect(publish).not.toHaveBeenCalled();
  });
});

function createDb(rows: unknown[]) {
  const limit = mock(async () => rows);
  const where = mock(() => ({ limit }));
  const secondLeftJoin = mock((table: unknown) => {
    expect(table).toBe(userProfileDirty);
    return { where };
  });
  const firstLeftJoin = mock((table: unknown) => {
    expect(table).toBe(userProfiles);
    return { leftJoin: secondLeftJoin };
  });
  const from = mock((table: unknown) => {
    expect(table).toBe(users);
    return { leftJoin: firstLeftJoin };
  });
  const select = mock((columns: Record<string, unknown>) => {
    expect(Object.keys(columns)).toEqual([
      "accountStatus",
      "accountDeleted",
      "profileSubjectIdentifier",
      "username",
      "name",
      "mobile",
      "profileSchemaVersion",
      "sourceDirtyVersion",
      "subjectFacts",
      "rebuiltAt",
      "dirtyVersion",
      "dirtyStatus",
    ]);
    expect(columns).not.toHaveProperty("detail");
    expect(columns).not.toHaveProperty("searchDoc");
    return { from };
  });
  return {
    db: { select } as never,
    select,
    limit,
  };
}

function authorityRow() {
  return {
    accountStatus: UserStatus.Enable,
    accountDeleted: false,
    profileSubjectIdentifier: subjectIdentifier,
    username: "alice",
    name: "Alice",
    mobile: null,
    profileSchemaVersion: 2,
    sourceDirtyVersion: "7",
    subjectFacts: {
      employments: [],
    },
    rebuiltAt: new Date("2026-07-31T10:00:00.000Z"),
    dirtyVersion: "7",
    dirtyStatus: UserProfileDirtyStatus.Processed,
  };
}
