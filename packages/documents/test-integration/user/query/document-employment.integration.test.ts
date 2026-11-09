import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createOrganizationResponsibilityResolver } from "@iam/assignment-resolution/organization-responsibility";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationType,
  PositionStatus,
  RoleAssignmentTargetType,
  UserDocumentSchema,
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
  roles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { eq } from "drizzle-orm";
import {
  createUserDocumentSearchRepository,
  createUserDocumentSearchService,
  UserDocumentSearchRequestSchema,
} from "../../../src/user/index";
import { createUserDocumentRowRepository } from "../../../src/user/publication/user-document-row.repository";
import { createUserDocumentBuilder } from "../../../src/user/worker";
import type { PostgresTestHarness } from "../support/postgres-test-harness";
import { createPostgresTestHarness } from "../support/postgres-test-harness";

const now = new Date("2026-08-22T12:00:00.000Z");
const aliceBase = {
  subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
  username: "alice",
  name: "Alice",
  mobile: null,
  wxId: "wx-alice",
};
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.sql.unsafe(
    "TRUNCATE TABLE organization_responsibility_assignment, role_assignment, " +
      "role, client, employment, " +
      'organization_closure, organization, position, user_document, "user" RESTART IDENTITY CASCADE',
  );
});

afterAll(async () => {
  await harness?.close();
});

describe("User Document v4 Employment tracer", () => {
  test("publishes only strict Effective Employment facts without internal identity or period fields", async () => {
    await seedEmploymentProjectionGraph();
    const { builder } = createTracer();

    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });

    expect(candidate?.document).toEqual({
      subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
      username: "alice",
      name: "Alice",
      mobile: null,
      wxId: "wx-alice",
      userType: UserType.Formal,
      status: UserStatus.Enable,
      employments: [
        {
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
                level: OrganizationLevel.One,
                distanceToTarget: 1,
              },
              {
                code: "org-effective",
                name: "Organization effective",
                type: OrganizationType.Department,
                level: OrganizationLevel.Two,
                distanceToTarget: 0,
              },
            ],
          },
          position: {
            code: "position-effective",
            name: "Position effective",
          },
          clientAuthorizations: [{ clientCode: "profile-client", roles: [{ code: "role-effective" }] }],
          responsibilities: [],
        },
        {
          isPrimary: false,
          organization: {
            code: "org-5",
            name: "Organization 5",
            type: OrganizationType.Department,
            path: [
              {
                code: "org-5",
                name: "Organization 5",
                type: OrganizationType.Department,
                level: OrganizationLevel.One,
                distanceToTarget: 0,
              },
            ],
          },
          position: { code: "position-5", name: "Position 5" },
          clientAuthorizations: [],
          responsibilities: [],
        },
      ],
    });
  });

  test("matches Organization subtrees through the public Path including the target itself", async () => {
    await seedEmploymentProjectionGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const { items: byRootSubtree } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          exists: {
            path: "employments",
            where: { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "org-root" } } },
          },
        },
      },
      "profile-client",
    );
    const { items: byTargetSubtree } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          exists: {
            path: "employments",
            where: {
              exists: { path: "organization.path", where: { field: "code", op: "eq", value: "org-effective" } },
            },
          },
        },
      },
      "profile-client",
    );
    const { items: byPathNodeDistance } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: byPathNodeDistanceIn } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: byPrimaryIn } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: outsideSubtree } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          exists: {
            path: "employments",
            where: { exists: { path: "organization.path", where: { field: "code", op: "eq", value: "org-other" } } },
          },
        },
      },
      "profile-client",
    );

    expect(byRootSubtree).toMatchObject([aliceBase]);
    expect(byTargetSubtree).toMatchObject([aliceBase]);

    expect(byPathNodeDistance).toEqual(byRootSubtree);
    expect(byPathNodeDistanceIn).toEqual(byRootSubtree);
    expect(byPrimaryIn).toEqual(byRootSubtree);
    expect(outsideSubtree).toEqual([]);
  });

  test("keeps Responsibility identity across same-element, independent, subtree, and negated scopes", async () => {
    await seedEmploymentProjectionGraph();
    await seedResponsibilityGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });

    expect(candidate?.document?.employments[0]?.responsibilities).toEqual([
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
              level: OrganizationLevel.One,
              distanceToTarget: 1,
            },
            {
              code: "target-a",
              name: "Target A",
              type: OrganizationType.Department,
              level: OrganizationLevel.Two,
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
              level: OrganizationLevel.One,
              distanceToTarget: 1,
            },
            {
              code: "target-b",
              name: "Target B",
              type: OrganizationType.Department,
              level: OrganizationLevel.Two,
              distanceToTarget: 0,
            },
          ],
        },
      },
    ]);
    await candidatePersistence.upsert(candidate!);

    const { items: sameResponsibility } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: employmentResponsibilities({
          and: [
            { field: "type.code", op: "eq", value: OrganizationResponsibilityTypeCode.Head },
            { field: "targetOrganization.code", op: "eq", value: "target-b" },
          ],
        }),
      },
      "profile-client",
    );
    const { items: independentResponsibilities } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: targetSubtree } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: employmentResponsibilities({
          exists: { path: "targetOrganization.path", where: { field: "code", op: "eq", value: "target-root" } },
        }),
      },
      "profile-client",
    );
    const { items: notExistsHead } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          not: employmentResponsibilities({
            field: "type.code",
            op: "eq",
            value: OrganizationResponsibilityTypeCode.Head,
          }),
        },
      },
      "profile-client",
    );
    const { items: existsNotHead } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: employmentResponsibilities({
          not: {
            field: "type.code",
            op: "eq",
            value: OrganizationResponsibilityTypeCode.Head,
          },
        }),
      },
      "profile-client",
    );

    expect(sameResponsibility).toEqual([]);
    expect(independentResponsibilities).toMatchObject([aliceBase]);
    expect(targetSubtree).toMatchObject([aliceBase]);
    expect(notExistsHead).toEqual([]);
    expect(existsNotHead).toMatchObject([aliceBase]);
  });

  test("keeps conditions in one Employment scope while independent scopes can match different Employments", async () => {
    await seedEmploymentProjectionGraph();
    await harness!.db.update(employments).set({ status: EmploymentStatus.Enable }).where(eq(employments.id, 101));
    await harness!.db.insert(roles).values({
      id: 201,
      roleCode: "role-second",
      roleName: "Second role",
      clientId: 1,
    });
    await harness!.db.insert(roleAssignments).values({
      roleId: 201,
      targetType: RoleAssignmentTargetType.Employment,
      targetId: 101,
    });
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const { items: crossEmploymentJoin } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: independentScopes } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
      },
      "profile-client",
    );
    const { items: oneCompleteEmployment } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
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
              ],
            },
          },
        },
      },
      "profile-client",
    );

    expect(crossEmploymentJoin).toEqual([]);
    expect(independentScopes).toMatchObject([aliceBase]);
    expect(oneCompleteEmployment).toMatchObject([aliceBase]);
  });

  test("supports strict, normalized Role array conditions", async () => {
    await seedEmploymentProjectionGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    const normalized = UserDocumentSearchRequestSchema.parse({
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
    const { items: containsAny } = await query.searchDocuments(
      { ...normalized, select: Object.keys(UserDocumentSchema.shape) },
      "profile-client",
    );
    const { items: containsAll } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          exists: {
            path: "employments",
            where: {
              field: "roles",
              op: "containsAll",
              value: ["role-effective", "role-effective"],
            },
          },
        },
      },
      "profile-client",
    );
    const { items: missingAll } = await query.searchDocuments(
      {
        select: Object.keys(UserDocumentSchema.shape),
        filter: {
          exists: {
            path: "employments",
            where: {
              field: "roles",
              op: "containsAll",
              value: ["role-effective", "missing-role"],
            },
          },
        },
      },
      "profile-client",
    );

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
    expect(containsAny).toMatchObject([aliceBase]);
    expect(containsAll).toMatchObject([aliceBase]);
    expect(missingAll).toEqual([]);
  });

  test("rejects a retired authorization condition without broadening a matching user query", async () => {
    await seedEmploymentProjectionGraph();
    const { builder, candidatePersistence, query } = createTracer();
    const candidate = await builder.buildOne({ userId: 1, sourceVersion: "1" });
    await candidatePersistence.upsert(candidate!);

    let failure: unknown;
    try {
      await query.searchDocuments(
        {
          select: Object.keys(UserDocumentSchema.shape),
          filter: {
            and: [
              { field: "username", op: "eq", value: "alice" },
              { exists: { path: "employments", where: { field: "privileges", op: "containsAny", value: ["read"] } } },
            ],
          },
        },
        "profile-client",
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ httpStatus: 422, code: "COMMON.VALIDATION_FAILED" });
  });
});

function createTracer() {
  return {
    builder: createUserDocumentBuilder({
      db: harness!.db,
      roleAssignmentResolver: createRoleAssignmentResolver(harness!.db),
      responsibilityResolver: createOrganizationResponsibilityResolver(harness!.db),
      clock: { nowDate: () => now },
      config: { batchSize: 100 },
    }),
    candidatePersistence: createUserDocumentRowRepository(harness!.db),
    query: createUserDocumentSearchService({
      documentRepository: createUserDocumentSearchRepository(harness!.db),
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
  await harness!.db.insert(positions).values(
    Array.from({ length: 7 }, (_, index) => ({
      id: 10 + index,
      posCode: index === 0 ? "position-effective" : `position-${index}`,
      posName: index === 0 ? "Position effective" : `Position ${index}`,
      status: PositionStatus.Enable,
    })),
  );
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
  await harness!.db
    .insert(employments)
    .values([
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
