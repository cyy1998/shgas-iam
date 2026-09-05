import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createUserProfileBuildRepository } from "../../src/build/user-profile-build.repository";
import { createPostgresTestHarness } from "./postgres-test-harness";

describe("User Profile build repository", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("loads every Open Employment and unfiltered parent facts for the Builder integrity guard", async () => {
    await harness.db.insert(users).values({ id: 1, username: "user1", name: "User 1" });
    await harness.db.insert(positions).values([
      { id: 10, posCode: "active", posName: "Active", status: PositionStatus.Enable },
      { id: 11, posCode: "inactive", posName: "Inactive", status: PositionStatus.Disable, isDelete: true },
    ]);
    await harness.db.insert(organizations).values([
      {
        id: 20,
        orgCode: "active",
        orgName: "Active",
        path: "20",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Department,
        status: OrganizationStatus.Enable,
      },
      {
        id: 21,
        orgCode: "inactive",
        orgName: "Inactive",
        path: "21",
        level: OrganizationLevel.One,
        orgType: OrganizationType.Department,
        status: OrganizationStatus.Disable,
        isDelete: true,
      },
    ]);
    await harness.db.insert(organizationClosures).values([
      { ancestorId: 20, descendantId: 20, depth: 0 },
      { ancestorId: 21, descendantId: 21, depth: 0 },
    ]);
    await harness.db.insert(employments).values([
      { id: 100, userId: 1, posId: 10, orgId: 20, status: EmploymentStatus.Enable },
      { id: 101, userId: 1, posId: 11, orgId: 21, status: EmploymentStatus.Pause },
      { id: 102, userId: 1, posId: 10, orgId: 21, status: EmploymentStatus.Disable },
      { id: 103, userId: 1, posId: 11, orgId: 20, status: EmploymentStatus.Enable, isDelete: true },
    ]);
    const resolveEffectiveRoles = mock(async (
      _input: { employmentIds: readonly number[] },
    ) => new Map());
    const repository = createUserProfileBuildRepository(harness.db, { resolveEffectiveRoles });

    const dataset = await repository.loadByUserIds([1]);

    expect(dataset.employments.map(row => row.id).sort((left, right) => left - right)).toEqual([100, 101]);
    expect(dataset.positions
      .map(row => ({ id: row.id, status: row.status, isDelete: row.isDelete }))
      .sort((left, right) => left.id - right.id)).toEqual([
      { id: 10, status: PositionStatus.Enable, isDelete: false },
      { id: 11, status: PositionStatus.Disable, isDelete: true },
    ]);
    expect(dataset.orgPathRows
      .map(row => ({ id: row.id, status: row.status, isDelete: row.isDelete }))
      .sort((left, right) => left.id - right.id)).toEqual([
      { id: 20, status: OrganizationStatus.Enable, isDelete: false },
      { id: 21, status: OrganizationStatus.Disable, isDelete: true },
    ]);
    expect(resolveEffectiveRoles).toHaveBeenCalledTimes(1);
    const resolvedEmploymentIds = resolveEffectiveRoles.mock.calls[0]?.[0].employmentIds;
    expect(resolvedEmploymentIds?.toSorted((left, right) => left - right)).toEqual([100, 101]);
  });
});
