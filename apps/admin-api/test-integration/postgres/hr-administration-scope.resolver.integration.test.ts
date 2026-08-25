import type { DbClient } from "@iam/db";
import {
  createHrAdministrationScopeResolver,
} from "@admin-api/services/admin-authorization/hr-administration-scope.resolver";
import {
  ClientStatus,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  RoleAssignmentTargetType,
  RoleStatus,
} from "@iam/contracts";
import {
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  roles,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
  createAdminApiPostgresTestHarness,
} from "./postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await resetScopeData();
});

afterAll(async () => {
  await harness.close();
});

describe("HR Administration Scope resolver", () => {
  test("derives self-inclusive multi-root scope from every Effective Role assignment source", async () => {
    await seedScopeGraph(harness.db);
    const resolver = createHrAdministrationScopeResolver({
      db: harness.db,
      roleAssignmentResolver: createRoleAssignmentResolver(harness.db),
    });

    const scope = await resolver.resolveForActor(900);

    expect(scope).toEqual({
      rootOrganizationIds: [10, 20, 30],
      organizationIds: [10, 11, 12, 20, 21, 30, 31],
    });
  });

  test("fails closed when a carrier has no unique structural root and observes later role revocation", async () => {
    await seedScopeGraph(harness.db);
    const resolver = createHrAdministrationScopeResolver({
      db: harness.db,
      roleAssignmentResolver: createRoleAssignmentResolver(harness.db),
    });

    const initial = await resolver.resolveForActor(900);
    expect(initial?.rootOrganizationIds).toEqual([10, 20, 30]);

    await harness.db.update(roles).set({ clientId: 2 }).where(eq(roles.id, 500));
    const misbound = await resolver.resolveForActor(900);
    expect(misbound).toBeNull();

    await resetScopeData();
    await seedScopeGraph(harness.db);
    await harness.db.insert(roleAssignments).values(
      assignment(500, RoleAssignmentTargetType.Employment, 1002),
    );
    await harness.db.delete(organizationClosures).where(eq(organizationClosures.descendantId, 31));
    const missingRoot = await resolver.resolveForActor(900);
    expect(missingRoot).toBeNull();

    await resetScopeData();
    await seedScopeGraph(harness.db);
    await harness.db.update(organizations).set({ isDelete: true }).where(eq(organizations.id, 12));
    const deletedCarrier = await resolver.resolveForActor(900);
    expect(deletedCarrier).toBeNull();

    await resetScopeData();
    await seedScopeGraph(harness.db);
    await harness.db.update(roles).set({ status: RoleStatus.Disable }).where(eq(roles.id, 500));
    const revoked = await resolver.resolveForActor(900);
    expect(revoked).toBeNull();
  });
});

async function resetScopeData() {
  await harness.db.delete(roleAssignments);
  await harness.db.delete(roles);
  await harness.db.delete(clients);
  await harness.reset();
}

async function seedScopeGraph(db: DbClient) {
  await db.insert(clients).values([
    client(1, "iam-admin"),
    client(2, "other-client"),
  ]);
  await db.insert(organizations).values([
    organization(10, "root-a", OrganizationLevel.One),
    organization(11, "branch-a", OrganizationLevel.Two),
    organization(12, "leaf-a", OrganizationLevel.Three),
    organization(20, "root-b", OrganizationLevel.One),
    organization(21, "leaf-b", OrganizationLevel.Two),
    organization(30, "root-c", OrganizationLevel.One),
    organization(31, "leaf-c", OrganizationLevel.Two),
    organization(40, "ordinary-root", OrganizationLevel.One),
    organization(41, "ordinary-leaf", OrganizationLevel.Two),
  ]);
  await db.insert(organizationClosures).values([
    closure(10, 10, 0),
    closure(11, 11, 0),
    closure(12, 12, 0),
    closure(10, 11, 1),
    closure(11, 12, 1),
    closure(10, 12, 2),
    closure(20, 20, 0),
    closure(21, 21, 0),
    closure(20, 21, 1),
    closure(30, 30, 0),
    closure(31, 31, 0),
    closure(30, 31, 1),
    closure(40, 40, 0),
    closure(41, 41, 0),
    closure(40, 41, 1),
  ]);
  await db.insert(positions).values([
    position(100, "position-a"),
    position(200, "position-b"),
    position(300, "position-c"),
    position(400, "ordinary-position"),
  ]);
  await db.insert(employments).values([
    employment(1000, 900, 100, 12),
    employment(1001, 900, 200, 21),
    employment(1002, 900, 300, 31),
    employment(1003, 900, 400, 41),
  ]);
  await db.insert(roles).values(role(500, 1, "iam:hr-admin"));
  await db.insert(roleAssignments).values([
    assignment(500, RoleAssignmentTargetType.Employment, 1000),
    assignment(500, RoleAssignmentTargetType.Position, 200),
    assignment(500, RoleAssignmentTargetType.Organization, 30, true),
  ]);
}

function client(id: number, clientCode: string) {
  return {
    id,
    clientCode,
    clientName: clientCode,
    clientSecret: "test-only-secret",
    status: ClientStatus.Enable,
    extAttributes: {},
  };
}

function organization(id: number, orgCode: string, level: OrganizationLevel) {
  return {
    id,
    orgCode,
    orgName: orgCode,
    parentId: -1,
    businessParentId: -1,
    path: orgCode,
    level,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function closure(ancestorId: number, descendantId: number, depth: number) {
  return { ancestorId, descendantId, depth };
}

function position(id: number, posCode: string) {
  return { id, posCode, posName: posCode, status: PositionStatus.Enable };
}

function employment(id: number, userId: number, posId: number, orgId: number) {
  return { id, userId, posId, orgId, status: EmploymentStatus.Enable };
}

function role(id: number, clientId: number, roleCode: string) {
  return { id, clientId, roleCode, roleName: roleCode, status: RoleStatus.Enable };
}

function assignment(
  roleId: number,
  targetType: RoleAssignmentTargetType,
  targetId: number,
  includeDescendants = false,
) {
  return { roleId, targetType, targetId, includeDescendants };
}
