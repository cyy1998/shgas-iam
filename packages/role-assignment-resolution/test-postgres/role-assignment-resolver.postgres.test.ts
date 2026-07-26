import type { DbClient } from "@iam/db";
import type { RoleAssignmentResolver } from "../src/index.ts";
import type { PostgresTestHarness } from "./postgres-harness.ts";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import {
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { createRoleAssignmentResolver } from "../src/index.ts";
import { createPostgresTestHarness } from "./postgres-harness.ts";

let harness: PostgresTestHarness | undefined;
let resolver: RoleAssignmentResolver;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
  resolver = createRoleAssignmentResolver(harness.db);
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("resolveEffectiveRoles", () => {
  test("merges every assignment source into complete, deduplicated, sorted employment results", async () => {
    await seedActiveEmploymentGraph(harness!.db);
    await seedUnassignedEmployment(harness!.db);
    await harness!.db.insert(roles).values([
      activeRole({ id: 200, roleCode: "zeta", clientId: 1 }),
      activeRole({ id: 201, roleCode: "alpha", clientId: 1 }),
      activeRole({ id: 202, roleCode: "other-client", clientId: 2 }),
      activeRole({ id: 203, roleCode: "no-inheritance", clientId: 1 }),
      activeRole({ id: 204, roleCode: "direct-only", clientId: 1 }),
      activeRole({ id: 205, roleCode: "inherited-only", clientId: 1 }),
    ]);
    await harness!.db.insert(roleAssignments).values([
      assignment(200, RoleAssignmentTargetType.Employment, 100),
      assignment(200, RoleAssignmentTargetType.Position, 20),
      assignment(200, RoleAssignmentTargetType.Organization, 10, true),
      assignment(201, RoleAssignmentTargetType.Organization, 12),
      assignment(202, RoleAssignmentTargetType.Position, 20),
      assignment(203, RoleAssignmentTargetType.Organization, 10),
      assignment(204, RoleAssignmentTargetType.Employment, 100),
      assignment(205, RoleAssignmentTargetType.Organization, 10, true),
    ]);

    const result = await resolver.resolveEffectiveRoles({ employmentIds: [100, 100, 105, 999] });

    expect([...result.entries()]).toEqual([
      [100, [
        { id: 201, roleCode: "alpha" },
        { id: 204, roleCode: "direct-only" },
        { id: 205, roleCode: "inherited-only" },
        { id: 202, roleCode: "other-client" },
        { id: 200, roleCode: "zeta" },
      ]],
      [105, []],
      [999, []],
    ]);
  });

  test("limits Effective Roles to the requested client when clientId is present", async () => {
    await seedActiveEmploymentGraph(harness!.db);
    await harness!.db.insert(roles).values([
      activeRole({ id: 200, roleCode: "client-one-zeta", clientId: 1 }),
      activeRole({ id: 201, roleCode: "client-one-alpha", clientId: 1 }),
      activeRole({ id: 202, roleCode: "client-two", clientId: 2 }),
    ]);
    await harness!.db.insert(roleAssignments).values([
      assignment(200, RoleAssignmentTargetType.Employment, 100),
      assignment(201, RoleAssignmentTargetType.Position, 20),
      assignment(202, RoleAssignmentTargetType.Organization, 10, true),
    ]);

    const clientOne = await resolver.resolveEffectiveRoles({ employmentIds: [100], clientId: 1 });
    const clientTwo = await resolver.resolveEffectiveRoles({ employmentIds: [100], clientId: 2 });

    expect([...clientOne.entries()]).toEqual([[100, [
      { id: 201, roleCode: "client-one-alpha" },
      { id: 200, roleCode: "client-one-zeta" },
    ]]]);
    expect([...clientTwo.entries()]).toEqual([[100, [
      { id: 202, roleCode: "client-two" },
    ]]]);
  });

  for (const source of getForwardAssignmentSources()) {
    for (const invalidation of getCommonStrictValidityInvalidations()) {
      test(`${source.name} excludes roles when ${invalidation.name}`, async () => {
        await seedActiveEmploymentGraph(harness!.db);
        await harness!.db.insert(roles).values(activeRole({ id: 200, roleCode: "effective", clientId: 1 }));
        await harness!.db.insert(roleAssignments).values(source.createAssignment(200));
        await invalidation.apply(harness!.db);

        const result = await resolver.resolveEffectiveRoles({ employmentIds: [100] });

        expect(result.get(100)).toEqual([]);
      });
    }
  }

  for (const invalidation of getOrganizationTargetInvalidations()) {
    test(`organization assignment excludes roles when ${invalidation.name}`, async () => {
      await seedActiveEmploymentGraph(harness!.db);
      await harness!.db.insert(roles).values(activeRole({ id: 200, roleCode: "effective", clientId: 1 }));
      await harness!.db.insert(roleAssignments).values(
        assignment(200, RoleAssignmentTargetType.Organization, 10, true),
      );
      await invalidation.apply(harness!.db);

      const result = await resolver.resolveEffectiveRoles({ employmentIds: [100] });

      expect(result.get(100)).toEqual([]);
    });
  }

  test("uses an input-size-independent number of database queries", async () => {
    await seedActiveEmploymentGraph(harness!.db);
    await harness!.db.insert(roles).values(activeRole({ id: 200, roleCode: "effective", clientId: 1 }));
    await harness!.db.insert(roleAssignments).values(assignment(200, RoleAssignmentTargetType.Employment, 100));

    const single = await harness!.measureQueries(
      () => resolver.resolveEffectiveRoles({ employmentIds: [100] }),
    );
    const batch = await harness!.measureQueries(
      () => resolver.resolveEffectiveRoles({ employmentIds: [100, 101, 102, 103, 104, 105] }),
    );

    expect(batch.queryCount).toBe(single.queryCount);
  });
});

describe("resolveAffectedUserIds", () => {
  for (const source of getReverseAssignmentSources()) {
    test(`${source.name} remains conservative when the role, position, and organizations are inactive`, async () => {
      await seedActiveEmploymentGraph(harness!.db);
      await harness!.db.insert(roles).values({
        ...activeRole({ id: 300, roleCode: "retired-role", clientId: 1 }),
        status: RoleStatus.Disable,
        isDelete: true,
      });
      await harness!.db.insert(roleAssignments).values(source.createAssignment(300));
      await retirePositionAndOrganizations(harness!.db);

      const result = await resolver.resolveAffectedUserIds({ roleIds: [300] });

      expect(result).toEqual([900]);
    });

    for (const invalidation of getReverseEmploymentInvalidations()) {
      test(`${source.name} excludes users when ${invalidation.name}`, async () => {
        await seedActiveEmploymentGraph(harness!.db);
        await harness!.db.insert(roles).values(activeRole({ id: 300, roleCode: "role", clientId: 1 }));
        await harness!.db.insert(roleAssignments).values(source.createAssignment(300));
        await invalidation.apply(harness!.db);

        const result = await resolver.resolveAffectedUserIds({ roleIds: [300] });

        expect(result).toEqual([]);
      });
    }
  }

  test("deduplicates and sorts users across overlapping sources and repeated inputs", async () => {
    await seedActiveEmploymentGraph(harness!.db);
    await harness!.db.insert(positions).values([
      {
        id: 21,
        posCode: "disabled-position",
        posName: "Disabled position",
        status: PositionStatus.Disable,
        isDelete: true,
      },
      {
        id: 22,
        posCode: "other-position",
        posName: "Other position",
        status: PositionStatus.Enable,
      },
    ]);
    await harness!.db.insert(employments).values([
      { id: 101, userId: 800, posId: 21, orgId: 11 },
      { id: 102, userId: 900, posId: 22, orgId: 10 },
      { id: 103, userId: 700, posId: 22, orgId: 11, status: EmploymentStatus.Disable },
      { id: 104, userId: 600, posId: 22, orgId: 11, isDelete: true },
    ]);
    await harness!.db.insert(roles).values({
      ...activeRole({ id: 300, roleCode: "retired-role", clientId: 1 }),
      status: RoleStatus.Disable,
      isDelete: true,
    });
    await harness!.db.insert(roleAssignments).values([
      assignment(300, RoleAssignmentTargetType.Employment, 100),
      assignment(300, RoleAssignmentTargetType.Employment, 103),
      assignment(300, RoleAssignmentTargetType.Employment, 104),
      assignment(300, RoleAssignmentTargetType.Position, 21),
      assignment(300, RoleAssignmentTargetType.Organization, 10, true),
      assignment(300, RoleAssignmentTargetType.Organization, 11),
    ]);
    await harness!.db.update(organizations).set({ status: OrganizationStatus.Disable }).where(eq(organizations.id, 12));
    await harness!.db.update(organizations).set({ isDelete: true }).where(eq(organizations.id, 10));

    const result = await resolver.resolveAffectedUserIds({ roleIds: [300, 300, 999] });

    expect(result).toEqual([800, 900]);
  });

  test("uses an input-size-independent number of database queries", async () => {
    await seedActiveEmploymentGraph(harness!.db);
    await harness!.db.insert(roles).values(activeRole({ id: 300, roleCode: "role", clientId: 1 }));
    await harness!.db.insert(roleAssignments).values(
      assignment(300, RoleAssignmentTargetType.Employment, 100),
    );

    const single = await harness!.measureQueries(
      () => resolver.resolveAffectedUserIds({ roleIds: [300] }),
    );
    const batch = await harness!.measureQueries(
      () => resolver.resolveAffectedUserIds({ roleIds: [300, 301, 302, 303, 304, 305] }),
    );

    expect(batch.queryCount).toBe(single.queryCount);
  });
});

function getReverseAssignmentSources(): Array<{
  name: string;
  createAssignment: (roleId: number) => ReturnType<typeof assignment>;
}> {
  return [
    {
      name: "employment assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Employment, 100),
    },
    {
      name: "position assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Position, 20),
    },
    {
      name: "exact organization assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Organization, 12),
    },
    {
      name: "descendant organization assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Organization, 10, true),
    },
  ];
}

function getReverseEmploymentInvalidations(): Array<{
  name: string;
  apply: (db: DbClient) => Promise<void>;
}> {
  return [
    {
      name: "the employment is disabled",
      apply: async (db) => {
        await db.update(employments).set({ status: EmploymentStatus.Disable }).where(eq(employments.id, 100));
      },
    },
    {
      name: "the employment is soft-deleted",
      apply: async (db) => {
        await db.update(employments).set({ isDelete: true }).where(eq(employments.id, 100));
      },
    },
  ];
}

async function retirePositionAndOrganizations(db: DbClient) {
  await db.update(positions).set({ status: PositionStatus.Disable, isDelete: true }).where(eq(positions.id, 20));
  await db
    .update(organizations)
    .set({ status: OrganizationStatus.Disable, isDelete: true })
    .where(inArray(organizations.id, [10, 12]));
}

function getForwardAssignmentSources(): Array<{
  name: string;
  createAssignment: (roleId: number) => ReturnType<typeof assignment>;
}> {
  return [
    {
      name: "employment assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Employment, 100),
    },
    {
      name: "position assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Position, 20),
    },
    {
      name: "organization assignment",
      createAssignment: roleId => assignment(roleId, RoleAssignmentTargetType.Organization, 10, true),
    },
  ];
}

function getCommonStrictValidityInvalidations(): Array<{
  name: string;
  apply: (db: DbClient) => Promise<void>;
}> {
  return [
    {
      name: "the employment is disabled",
      apply: async (db) => {
        await db.update(employments).set({ status: EmploymentStatus.Disable }).where(eq(employments.id, 100));
      },
    },
    {
      name: "the employment is soft-deleted",
      apply: async (db) => {
        await db.update(employments).set({ isDelete: true }).where(eq(employments.id, 100));
      },
    },
    {
      name: "the employment position is disabled",
      apply: async (db) => {
        await db.update(positions).set({ status: PositionStatus.Disable }).where(eq(positions.id, 20));
      },
    },
    {
      name: "the employment position is soft-deleted",
      apply: async (db) => {
        await db.update(positions).set({ isDelete: true }).where(eq(positions.id, 20));
      },
    },
    {
      name: "the employment organization is disabled",
      apply: async (db) => {
        await db.update(organizations).set({ status: OrganizationStatus.Disable }).where(eq(organizations.id, 12));
      },
    },
    {
      name: "the employment organization is soft-deleted",
      apply: async (db) => {
        await db.update(organizations).set({ isDelete: true }).where(eq(organizations.id, 12));
      },
    },
    {
      name: "the role is disabled",
      apply: async (db) => {
        await db.update(roles).set({ status: RoleStatus.Disable }).where(eq(roles.id, 200));
      },
    },
    {
      name: "the role is soft-deleted",
      apply: async (db) => {
        await db.update(roles).set({ isDelete: true }).where(eq(roles.id, 200));
      },
    },
  ];
}

function getOrganizationTargetInvalidations(): Array<{
  name: string;
  apply: (db: DbClient) => Promise<void>;
}> {
  return [
    {
      name: "the assignment target organization is disabled",
      apply: async (db) => {
        await db.update(organizations).set({ status: OrganizationStatus.Disable }).where(eq(organizations.id, 10));
      },
    },
    {
      name: "the assignment target organization is soft-deleted",
      apply: async (db) => {
        await db.update(organizations).set({ isDelete: true }).where(eq(organizations.id, 10));
      },
    },
  ];
}

async function seedActiveEmploymentGraph(db: DbClient) {
  await db.insert(organizations).values([
    activeOrganization({ id: 10, orgCode: "root", path: "10", level: OrganizationLevel.One }),
    activeOrganization({ id: 11, orgCode: "child", path: "10/11", level: OrganizationLevel.Two }),
    activeOrganization({ id: 12, orgCode: "leaf", path: "10/11/12", level: OrganizationLevel.Three }),
  ]);
  await db.insert(organizationClosures).values([
    { ancestorId: 10, descendantId: 10, depth: 0 },
    { ancestorId: 11, descendantId: 11, depth: 0 },
    { ancestorId: 12, descendantId: 12, depth: 0 },
    { ancestorId: 10, descendantId: 11, depth: 1 },
    { ancestorId: 11, descendantId: 12, depth: 1 },
    { ancestorId: 10, descendantId: 12, depth: 2 },
  ]);
  await db.insert(positions).values({
    id: 20,
    posCode: "developer",
    posName: "Developer",
    status: PositionStatus.Enable,
  });
  await db.insert(employments).values({
    id: 100,
    userId: 900,
    posId: 20,
    orgId: 12,
  });
}

async function seedUnassignedEmployment(db: DbClient) {
  await db.insert(organizations).values(
    activeOrganization({ id: 13, orgCode: "isolated", path: "13", level: OrganizationLevel.One }),
  );
  await db.insert(organizationClosures).values({ ancestorId: 13, descendantId: 13, depth: 0 });
  await db.insert(positions).values({
    id: 21,
    posCode: "unassigned",
    posName: "Unassigned",
    status: PositionStatus.Enable,
  });
  await db.insert(employments).values({ id: 105, userId: 905, posId: 21, orgId: 13 });
}

function activeOrganization(input: {
  id: number;
  level: OrganizationLevel;
  orgCode: string;
  path: string;
}) {
  return {
    ...input,
    orgName: input.orgCode,
    parentId: -1,
    businessParentId: -1,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function activeRole(input: { id: number; roleCode: string; clientId: number }) {
  return {
    ...input,
    roleName: input.roleCode,
    status: RoleStatus.Enable,
  };
}

function assignment(
  roleId: number,
  targetType: RoleAssignmentTargetType,
  targetId: number,
  includeDescendants = false,
) {
  return { roleId, targetType, targetId, includeDescendants };
}
