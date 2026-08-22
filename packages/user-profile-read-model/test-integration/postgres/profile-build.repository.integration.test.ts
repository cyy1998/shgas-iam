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
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createProfileBuildRepository } from "../../src/profile-build.repository";
import { createPostgresTestHarness } from "./postgres-test-harness";

const at = new Date("2026-08-20T12:00:00.000Z");

describe("User Profile v3 build repository", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  afterAll(async () => {
    await harness?.close();
  });

  test("loads the resolver identity with the current cross-tree target path", async () => {
    await harness.db.insert(users).values({ id: 1, username: "user1", name: "User 1" });
    await harness.db.insert(positions).values({
      id: 10,
      posCode: "holder-position",
      posName: "Holder Position",
      status: PositionStatus.Enable,
    });
    await harness.db.insert(organizations).values([
      organization({ id: 20, code: "HOLDER", path: "20", level: OrganizationLevel.One }),
      organization({ id: 30, code: "TARGET-ROOT", path: "30", level: OrganizationLevel.One }),
      organization({ id: 31, code: "TARGET", path: "30/31", level: OrganizationLevel.Two }),
    ]);
    await harness.db.insert(organizationClosures).values([
      { ancestorId: 20, descendantId: 20, depth: 0 },
      { ancestorId: 30, descendantId: 30, depth: 0 },
      { ancestorId: 31, descendantId: 31, depth: 0 },
      { ancestorId: 30, descendantId: 31, depth: 1 },
    ]);
    await harness.db.insert(employments).values({
      id: 100,
      userId: 1,
      posId: 10,
      orgId: 20,
      status: EmploymentStatus.Enable,
      startTime: new Date("2026-01-01T00:00:00.000Z"),
    });
    await harness.db.insert(organizationResponsibilityAssignments).values({
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 31,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    });
    const resolveEffectiveRoles = mock(async () => new Map());
    const repository = createProfileBuildRepository(
      harness.db,
      { resolveEffectiveRoles },
      createOrganizationResponsibilityResolver(harness.db),
    );

    const dataset = await repository.loadByUserIds([1], at);

    expect(dataset.responsibilityRows).toEqual([{
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganization: {
        code: "TARGET",
        name: "TARGET",
        type: OrganizationType.Department,
        path: [
          { code: "TARGET-ROOT", name: "TARGET-ROOT", type: OrganizationType.Department },
          { code: "TARGET", name: "TARGET", type: OrganizationType.Department },
        ],
      },
    }]);
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
