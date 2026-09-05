import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createUserProfileInvalidation } from "../../src/invalidation/user-profile-invalidation";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-20T12:00:00.000Z");

describe("User Profile responsibility invalidation", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("unions employment subtree users with cross-tree responsibility holders", async () => {
    await harness.db.insert(users).values([
      { id: 1, username: "tree-user", name: "Tree User" },
      { id: 2, username: "holder-user", name: "Holder User" },
    ]);
    await harness.db.insert(positions).values({
      id: 10,
      posCode: "position",
      posName: "Position",
      status: PositionStatus.Enable,
    });
    await harness.db.insert(organizations).values([
      organization({ id: 20, code: "CHANGED", path: "20", level: OrganizationLevel.One }),
      organization({ id: 21, code: "TARGET", path: "20/21", level: OrganizationLevel.Two }),
      organization({ id: 30, code: "ELSEWHERE", path: "30", level: OrganizationLevel.One }),
    ]);
    await harness.db.insert(organizationClosures).values([
      { ancestorId: 20, descendantId: 20, depth: 0 },
      { ancestorId: 21, descendantId: 21, depth: 0 },
      { ancestorId: 20, descendantId: 21, depth: 1 },
      { ancestorId: 30, descendantId: 30, depth: 0 },
    ]);
    await harness.db.insert(employments).values([
      employment({ id: 100, userId: 1, orgId: 21 }),
      employment({ id: 101, userId: 2, orgId: 30 }),
    ]);
    await harness.db.insert(organizationResponsibilityAssignments).values({
      employmentId: 101,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 21,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    });
    const afterCommitTasks: Array<() => Promise<void> | void> = [];
    const invalidation = createUserProfileInvalidation({
      db: harness.db,
      jobProducer: { enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })) },
      lifecycle: {
        afterCommit: {
          bestEffort: (_name, callback) => afterCommitTasks.push(callback),
        },
        observability: null,
      },
      clock: { nowDate: () => now },
    });

    await invalidation.recordChanges([{ kind: "organization", organizationId: 20 }]);

    const rows = await harness.sql<{
      userId: number;
      reasonCodes: string[];
      dirtyVersion: string;
    }[]>`
      SELECT user_id AS "userId", reason_codes AS "reasonCodes",
             dirty_version::text AS "dirtyVersion"
      FROM user_profile_dirty
      ORDER BY user_id
    `;
    expect([...rows]).toEqual([
      { userId: 1, reasonCodes: ["organization-updated"], dirtyVersion: "1" },
      { userId: 2, reasonCodes: ["organization-updated"], dirtyVersion: "1" },
    ]);
    expect(afterCommitTasks).toHaveLength(1);
  });
});

function organization(input: {
  id: number;
  code: string;
  path: string;
  level: OrganizationLevel;
}) {
  return {
    id: input.id,
    orgCode: input.code,
    orgName: input.code,
    path: input.path,
    level: input.level,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function employment(input: { id: number; userId: number; orgId: number }) {
  return {
    ...input,
    posId: 10,
    status: EmploymentStatus.Enable,
    startTime: new Date("2026-01-01T00:00:00.000Z"),
  };
}
