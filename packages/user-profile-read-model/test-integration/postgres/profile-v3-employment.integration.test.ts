import type { PostgresTestHarness } from "./postgres-test-harness";
import {
  ApiErrorCode,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  PositionStatus,
  PrivilegeStatus,
  RoleAssignmentTargetType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import {
  clients,
  employments,
  organizationClosures,
  organizationResponsibilityAssignments,
  organizations,
  positions,
  privileges,
  rolePrivileges,
  roles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { createUserProfileRowRepository } from "../../src/user-profile-row.repository";
import {
  createV3UserProfileBuilder,
  createV3UserProfileQueryRepository,
  createV3UserProfileQueryService,
  V3UserProfileSearchRequestSchema,
} from "../../src/v3";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-22T12:00:00.000Z");
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.sql.unsafe(
    "TRUNCATE TABLE organization_responsibility_assignment, role_assignment, role_privilege, "
    + "privilege, role, client, employment, "
    + "organization_closure, organization, position, user_profile, \"user\" RESTART IDENTITY CASCADE",
  );
});

afterAll(async () => {
  await harness?.close();
});

describe("User Profile v3 Employment tracer", () => {
  test("publishes only strict Effective Employment facts without internal identity or period fields", async () => {
    await seedEmploymentProjectionGraph();
    const { builder } = createTracer();

    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });

    expect(candidate?.searchDoc).toEqual({
      user: {
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        username: "alice",
        name: "Alice",
        mobile: null,
        wxId: "wx-alice",
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [{
        isPrimary: true,
        organization: {
          code: "org-effective",
          name: "Organization effective",
          type: OrganizationType.Department,
          path: [
            {
              code: "org-root",
              name: "Organization root",
              type: OrganizationType.Department,
              distanceToTarget: 1,
            },
            {
              code: "org-effective",
              name: "Organization effective",
              type: OrganizationType.Department,
              distanceToTarget: 0,
            },
          ],
        },
        position: {
          code: "position-effective",
          name: "Position effective",
        },
        roles: ["role-effective"],
        privileges: ["profile:read", "profile:write"],
        responsibilities: [],
      }],
    });
  });

  test("matches Organization subtrees through the public Path including the target itself", async () => {
    await seedEmploymentProjectionGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const byRootSubtree = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization", op: "withinSubtreeOf", value: "org-root" },
        },
      },
    });
    const byTargetSubtree = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization", op: "withinSubtreeOf", value: "org-effective" },
        },
      },
    });
    const byEquivalentPath = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            exists: {
              path: "organization.path",
              where: { field: "code", op: "eq", value: "org-root" },
            },
          },
        },
      },
    });
    const byPathNodeDistance = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            exists: {
              path: "organization.path",
              where: {
                and: [
                  { field: "code", op: "eq", value: "org-root" },
                  { field: "distanceToTarget", op: "eq", value: 1 },
                ],
              },
            },
          },
        },
      },
    });
    const byPathNodeDistanceIn = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            exists: {
              path: "organization.path",
              where: {
                field: "distanceToTarget",
                op: "in",
                value: [99, 1, 1],
              },
            },
          },
        },
      },
    });
    const byPrimaryIn = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            field: "isPrimary",
            op: "in",
            value: [false, true, true],
          },
        },
      },
    });
    const outsideSubtree = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: { field: "organization", op: "withinSubtreeOf", value: "org-other" },
        },
      },
    });

    expect(byRootSubtree).toEqual([candidate!.detail]);
    expect(byTargetSubtree).toEqual([candidate!.detail]);
    expect(byEquivalentPath).toEqual(byRootSubtree);
    expect(byPathNodeDistance).toEqual(byRootSubtree);
    expect(byPathNodeDistanceIn).toEqual(byRootSubtree);
    expect(byPrimaryIn).toEqual(byRootSubtree);
    expect(outsideSubtree).toEqual([]);
  });

  test("keeps Responsibility identity across same-element, independent, subtree, and negated scopes", async () => {
    await seedEmploymentProjectionGraph();
    await seedResponsibilityGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });

    expect(candidate?.searchDoc.employments[0]?.responsibilities).toEqual([
      {
        type: { code: OrganizationResponsibilityTypeCode.Head, name: "负责人" },
        targetOrganization: {
          code: "target-a",
          name: "Target A",
          type: OrganizationType.Department,
          path: [
            {
              code: "target-root",
              name: "Target root",
              type: OrganizationType.Department,
              distanceToTarget: 1,
            },
            {
              code: "target-a",
              name: "Target A",
              type: OrganizationType.Department,
              distanceToTarget: 0,
            },
          ],
        },
      },
      {
        type: { code: OrganizationResponsibilityTypeCode.Supervising, name: "分管领导" },
        targetOrganization: {
          code: "target-b",
          name: "Target B",
          type: OrganizationType.Department,
          path: [
            {
              code: "target-root",
              name: "Target root",
              type: OrganizationType.Department,
              distanceToTarget: 1,
            },
            {
              code: "target-b",
              name: "Target B",
              type: OrganizationType.Department,
              distanceToTarget: 0,
            },
          ],
        },
      },
    ]);
    await candidatePersistence.upsert(candidate!);

    const sameResponsibility = await query.search({
      filter: employmentResponsibilities({
        and: [
          { field: "type.code", op: "eq", value: OrganizationResponsibilityTypeCode.Head },
          { field: "targetOrganization.code", op: "eq", value: "target-b" },
        ],
      }),
    });
    const independentResponsibilities = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            and: [
              {
                exists: {
                  path: "responsibilities",
                  where: { field: "type.code", op: "eq", value: OrganizationResponsibilityTypeCode.Head },
                },
              },
              {
                exists: {
                  path: "responsibilities",
                  where: { field: "targetOrganization.code", op: "eq", value: "target-b" },
                },
              },
            ],
          },
        },
      },
    });
    const targetSubtree = await query.search({
      filter: employmentResponsibilities({
        field: "targetOrganization",
        op: "withinSubtreeOf",
        value: "target-root",
      }),
    });
    const notExistsHead = await query.search({
      filter: {
        not: employmentResponsibilities({
          field: "type.code",
          op: "eq",
          value: OrganizationResponsibilityTypeCode.Head,
        }),
      },
    });
    const existsNotHead = await query.search({
      filter: employmentResponsibilities({
        not: {
          field: "type.code",
          op: "eq",
          value: OrganizationResponsibilityTypeCode.Head,
        },
      }),
    });

    expect(sameResponsibility).toEqual([]);
    expect(independentResponsibilities).toEqual([candidate!.detail]);
    expect(targetSubtree).toEqual([candidate!.detail]);
    expect(notExistsHead).toEqual([]);
    expect(existsNotHead).toEqual([candidate!.detail]);
  });

  test("keeps conditions in one Employment scope while independent scopes can match different Employments", async () => {
    await seedEmploymentProjectionGraph();
    await harness!.db
      .update(employments)
      .set({ status: EmploymentStatus.Enable })
      .where(eq(employments.id, 101));
    await harness!.db.insert(roles).values({
      id: 201,
      roleCode: "role-second",
      roleName: "Second role",
      clientId: 1,
    });
    await harness!.db.insert(privileges).values({
      id: 302,
      privilegeCode: "second:read",
      privilegeName: "Second read",
      status: PrivilegeStatus.Enable,
    });
    await harness!.db.insert(rolePrivileges).values({ roleId: 201, privilegeId: 302 });
    await harness!.db.insert(roleAssignments).values({
      roleId: 201,
      targetType: RoleAssignmentTargetType.Employment,
      targetId: 101,
    });
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const crossEmploymentJoin = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            and: [
              { field: "organization.code", op: "eq", value: "org-effective" },
              { field: "position.code", op: "eq", value: "position-1" },
            ],
          },
        },
      },
    });
    const independentScopes = await query.search({
      filter: {
        and: [
          {
            exists: {
              path: "employments",
              where: { field: "organization.code", op: "eq", value: "org-effective" },
            },
          },
          {
            exists: {
              path: "employments",
              where: { field: "position.code", op: "eq", value: "position-1" },
            },
          },
        ],
      },
    });
    const oneCompleteEmployment = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            and: [
              { field: "isPrimary", op: "eq", value: true },
              { field: "organization.code", op: "eq", value: "org-effective" },
              { field: "organization.name", op: "eq", value: "Organization effective" },
              { field: "organization.type", op: "eq", value: OrganizationType.Department },
              { field: "position.code", op: "eq", value: "position-effective" },
              { field: "position.name", op: "eq", value: "Position effective" },
              { field: "roles", op: "containsAll", value: ["role-effective"] },
              { field: "privileges", op: "containsAny", value: ["profile:write"] },
            ],
          },
        },
      },
    });

    expect(crossEmploymentJoin).toEqual([]);
    expect(independentScopes).toEqual([candidate!.detail]);
    expect(oneCompleteEmployment).toEqual([candidate!.detail]);
  });

  test("supports strict, normalized Role and Privilege array conditions", async () => {
    await seedEmploymentProjectionGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceDirtyVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const normalized = V3UserProfileSearchRequestSchema.parse({
      filter: {
        exists: {
          path: "employments",
          where: {
            field: "roles",
            op: "containsAny",
            value: ["missing-role", "role-effective", "role-effective"],
          },
        },
      },
    });
    const containsAny = await query.search(normalized);
    const containsAll = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            field: "privileges",
            op: "containsAll",
            value: ["profile:read", "profile:write", "profile:read"],
          },
        },
      },
    });
    const missingAll = await query.search({
      filter: {
        exists: {
          path: "employments",
          where: {
            field: "privileges",
            op: "containsAll",
            value: ["profile:read", "missing:privilege"],
          },
        },
      },
    });

    expect(normalized.filter).toEqual({
      exists: {
        path: "employments",
        where: {
          field: "roles",
          op: "containsAny",
          value: ["missing-role", "role-effective"],
        },
      },
    });
    expect(containsAny).toEqual([candidate!.detail]);
    expect(containsAll).toEqual([candidate!.detail]);
    expect(missingAll).toEqual([]);

    const invalidRequests = [
      { filter: { exists: { path: "employments", where: { field: "roles", op: "in", value: ["role-effective"] } } } },
      { filter: { exists: { path: "employments", where: { field: "privileges", op: "eq", value: "profile:read" } } } },
      { filter: { exists: { path: "employments", where: { field: "roles", op: "containsAny", value: [] } } } },
      { filter: { exists: { path: "employments", where: { field: "roles", op: "containsAll", value: [123] } } } },
      { filter: { exists: { path: "employments", where: { field: "isPrimary", op: "containsAny", value: [true] } } } },
      { filter: { exists: { path: "employments", where: { field: "user.username", op: "eq", value: "alice" } } } },
      { filter: { exists: { path: "employments", where: { field: "organization.id", op: "eq", value: 20 } } } },
      { filter: { exists: { path: "employments", where: { field: "organization.ancestorCodes", op: "containsAny", value: ["org-root"] } } } },
      { filter: { exists: { path: "employments", where: { field: "organization.ancestorDepths", op: "containsAny", value: [1] } } } },
      { filter: { exists: { path: "employments", where: { field: "organization.ancestorKeys", op: "containsAny", value: ["org-root#1"] } } } },
      { filter: { exists: { path: "employments", where: { field: "organization.companyCodes", op: "containsAny", value: ["org-root"] } } } },
      { filter: { exists: { path: "employments", where: { field: "position", op: "withinSubtreeOf", value: "position-effective" } } } },
      { filter: employmentResponsibilities({ field: "id", op: "eq", value: 1 }) },
      { filter: employmentResponsibilities({ field: "targetOrganization.id", op: "eq", value: 31 }) },
      { filter: employmentResponsibilities({ field: "targetOrganization.ancestorCodes", op: "containsAny", value: ["target-root"] }) },
    ];
    for (const request of invalidRequests) {
      const error = await query.search(request).catch(error => error);
      expect(error).toMatchObject({
        code: ApiErrorCode.ValidationFailed,
        httpStatus: 422,
        name: "V3UserProfileFilterValidationError",
      });
    }
  });
});

function createTracer() {
  return {
    builder: createV3UserProfileBuilder({
      db: harness!.db,
      roleAssignmentResolver: createRoleAssignmentResolver(harness!.db),
      responsibilityResolver: createOrganizationResponsibilityResolver(harness!.db),
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    }),
    candidatePersistence: createUserProfileRowRepository(harness!.db),
    query: createV3UserProfileQueryService({
      profileRepository: createV3UserProfileQueryRepository(harness!.db),
    }),
  };
}

async function seedEmploymentProjectionGraph() {
  await harness!.db.insert(users).values({
    id: 1,
    subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
    username: "alice",
    name: "Alice",
    mobile: null,
    wxId: "wx-alice",
    userType: UserType.Formal,
    status: UserStatus.Enable,
  });
  await harness!.db.insert(positions).values(Array.from({ length: 7 }, (_, index) => ({
    id: 10 + index,
    posCode: index === 0 ? "position-effective" : `position-${index}`,
    posName: index === 0 ? "Position effective" : `Position ${index}`,
    status: PositionStatus.Enable,
  })));
  await harness!.db.insert(organizations).values([
    {
      id: 19,
      orgCode: "org-root",
      orgName: "Organization root",
      path: "19",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      id: 20 + index,
      orgCode: index === 0 ? "org-effective" : `org-${index}`,
      orgName: index === 0 ? "Organization effective" : `Organization ${index}`,
      path: index === 0 ? "19/20" : `${20 + index}`,
      level: index === 0 ? OrganizationLevel.Two : OrganizationLevel.One,
      parentId: index === 0 ? 19 : -1,
      orgType: OrganizationType.Department,
    })),
  ]);
  await harness!.db.insert(organizationClosures).values([
    { ancestorId: 19, descendantId: 19, depth: 0 },
    { ancestorId: 19, descendantId: 20, depth: 1 },
    ...Array.from({ length: 7 }, (_, index) => ({
      ancestorId: 20 + index,
      descendantId: 20 + index,
      depth: 0,
    })),
  ]);
  await harness!.db.insert(employments).values([
    employment({ id: 100, offset: 0, isPrimary: true }),
    employment({ id: 101, offset: 1, status: EmploymentStatus.Pause }),
    employment({ id: 102, offset: 2, status: EmploymentStatus.Disable }),
    employment({ id: 103, offset: 3, startTime: new Date("2026-08-23T00:00:00.000Z") }),
    employment({ id: 104, offset: 4, endTime: new Date("2026-08-21T00:00:00.000Z") }),
    employment({ id: 105, offset: 5, endTime: new Date("2026-08-23T00:00:00.000Z") }),
    employment({ id: 106, offset: 6, isDelete: true }),
  ]);
  await harness!.db.insert(clients).values({
    id: 1,
    clientCode: "profile-client",
    clientName: "Profile client",
    clientSecret: "test-secret",
    extAttributes: {},
  });
  await harness!.db.insert(roles).values({
    id: 200,
    roleCode: "role-effective",
    roleName: "Effective role",
    clientId: 1,
  });
  await harness!.db.insert(privileges).values([
    {
      id: 300,
      privilegeCode: "profile:write",
      privilegeName: "Profile write",
      status: PrivilegeStatus.Enable,
    },
    {
      id: 301,
      privilegeCode: "profile:read",
      privilegeName: "Profile read",
      status: PrivilegeStatus.Enable,
    },
  ]);
  await harness!.db.insert(rolePrivileges).values([
    { roleId: 200, privilegeId: 300 },
    { roleId: 200, privilegeId: 301 },
  ]);
  await harness!.db.insert(roleAssignments).values({
    roleId: 200,
    targetType: RoleAssignmentTargetType.Employment,
    targetId: 100,
  });
}

async function seedResponsibilityGraph() {
  await harness!.db.insert(organizations).values([
    {
      id: 30,
      orgCode: "target-root",
      orgName: "Target root",
      path: "30",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    },
    {
      id: 31,
      orgCode: "target-a",
      orgName: "Target A",
      parentId: 30,
      path: "30/31",
      level: OrganizationLevel.Two,
      orgType: OrganizationType.Department,
    },
    {
      id: 32,
      orgCode: "target-b",
      orgName: "Target B",
      parentId: 30,
      path: "30/32",
      level: OrganizationLevel.Two,
      orgType: OrganizationType.Department,
    },
  ]);
  await harness!.db.insert(organizationClosures).values([
    { ancestorId: 30, descendantId: 30, depth: 0 },
    { ancestorId: 30, descendantId: 31, depth: 1 },
    { ancestorId: 31, descendantId: 31, depth: 0 },
    { ancestorId: 30, descendantId: 32, depth: 1 },
    { ancestorId: 32, descendantId: 32, depth: 0 },
  ]);
  await harness!.db.insert(organizationResponsibilityAssignments).values([
    {
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      targetOrganizationId: 31,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    },
    {
      employmentId: 100,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      targetOrganizationId: 32,
      status: OrganizationResponsibilityAssignmentStatus.Enable,
      startTime: new Date("2026-08-01T00:00:00.000Z"),
    },
  ]);
}

function employmentResponsibilities(where: unknown) {
  return {
    exists: {
      path: "employments",
      where: {
        exists: {
          path: "responsibilities",
          where,
        },
      },
    },
  };
}

function employment(input: {
  id: number;
  offset: number;
  status?: EmploymentStatus;
  isPrimary?: boolean;
  startTime?: Date;
  endTime?: Date;
  isDelete?: boolean;
}) {
  return {
    id: input.id,
    userId: 1,
    posId: 10 + input.offset,
    orgId: 20 + input.offset,
    status: input.status ?? EmploymentStatus.Enable,
    isPrimary: input.isPrimary ?? false,
    startTime: input.startTime ?? new Date("2026-08-21T00:00:00.000Z"),
    endTime: input.endTime ?? null,
    isDelete: input.isDelete ?? false,
  };
}
