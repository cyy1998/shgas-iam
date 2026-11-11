import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createRoleAdapter } from "@admin-api/routes/admin/role/role.adapter";
import { createRoleRoute } from "@admin-api/routes/admin/role/role.index";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createUserRoute } from "@admin-api/routes/admin/user/user.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createHrAdministrationScopeResolver } from "@admin-api/services/admin-authorization/hr-administration-scope.resolver";
import type { AdminEmploymentTransactionPorts } from "@admin-api/services/employment/employment.port";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createRoleService } from "@admin-api/services/role/role.service";
import type { AdminUserServiceDeps, AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import { createUserService } from "@admin-api/services/user/user.service";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createRoleAssignmentResolver } from "@iam/assignment-resolution/role-assignment";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  RoleAssignmentTargetType,
  RoleKind,
  RoleStatus,
  RoleType,
  UserType,
} from "@iam/contracts";
import { clients, employments, organizationClosures, organizations, positions, roles, users } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import type { SubjectAccessMutationReceipt, SubjectAccessTransitionTarget } from "@iam/subject-access";
import { mapUnitOfWork } from "@iam/unit-of-work";
import { Hono } from "hono";
import { createAdminApiPostgresTestHarness } from "../support/postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate role_assignment, role, client restart identity cascade`;
});

afterAll(async () => {
  await harness.close();
});

test("User and Employment details preserve effective roles with the current complete response shape", async () => {
  const seeded = await seedRoleDetailGraph();
  const { employmentService, userService } = createSubjects();
  const employmentDetail = await employmentService.getEmploymentDetailByIdForAdmin(seeded.employmentId);
  const userDetail = await userService.getUserDetailByUsernameForAdmin("role-holder");
  const userEmploymentDetail = userDetail.employments.find((item) => item.id === seeded.employmentId)!;
  const employmentFields = [
    "id",
    "userId",
    "orgId",
    "posId",
    "isPrimary",
    "status",
    "startTime",
    "endTime",
    "description",
    "isDelete",
    "createTime",
    "updateTime",
    "user",
    "position",
    "organization",
    "roles",
    "roleNames",
  ];
  expect(Object.keys(employmentDetail).sort()).toEqual([...employmentFields, "userStatus"].sort());
  expect(Object.keys(userEmploymentDetail).sort()).toEqual(employmentFields.sort());
  expect(Object.keys(userDetail).sort()).toEqual(
    [
      "id",
      "username",
      "wxId",
      "name",
      "mobile",
      "userType",
      "orderNum",
      "status",
      "isDelete",
      "createTime",
      "updateTime",
      "employments",
      "roles",
      "roleNames",
    ].sort(),
  );
  for (const detail of [employmentDetail, userEmploymentDetail, userDetail]) {
    expect([...detail.roles].sort()).toEqual(["ROLE:FIRST", "ROLE:SECOND", "global:reviewer"]);
    expect(detail.roleNames).toEqual({
      "ROLE:FIRST": "First role",
      "ROLE:SECOND": "Second role",
      "global:reviewer": "Reviewer",
    });
  }
});

test("inherited Admin roles change later requests and HR scope follows only the carrier employment", async () => {
  const { employmentId, organizationId, positionId, reviewerRoleId } = await seedRoleDetailGraph(false);
  const [adminClient] = await harness.db
    .insert(clients)
    .values({
      clientCode: "iam-admin",
      clientName: "Admin",
      clientSecret: "synthetic",
      extAttributes: {},
    })
    .returning({ id: clients.id });
  const [hr] = await harness.db.insert(users).values({ username: "hr", name: "HR" }).returning({ id: users.id });
  const [hrEmployment] = await harness.db
    .insert(employments)
    .values({
      userId: hr!.id,
      orgId: organizationId,
      posId: positionId,
      startTime: new Date("2026-01-01T00:00:00Z"),
    })
    .returning({ id: employments.id });
  const [otherOrg] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "OTHER",
      orgName: "Other organization",
      path: "/OTHER",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    })
    .returning({ id: organizations.id });
  await harness.db.insert(organizationClosures).values({
    ancestorId: otherOrg!.id,
    descendantId: otherOrg!.id,
    depth: 0,
  });
  await harness.db.insert(employments).values({
    userId: hr!.id,
    orgId: otherOrg!.id,
    posId: positionId,
    startTime: new Date("2026-01-01T00:00:00Z"),
  });
  const [hrRole, fullRole] = await harness.db
    .insert(roles)
    .values([
      { roleCode: "iam:hr-admin", roleName: "HR administrator", clientId: adminClient!.id },
      { roleCode: "iam:admin", roleName: "Full administrator", clientId: adminClient!.id },
    ])
    .returning({ id: roles.id });
  const { employmentService, userService, roleService } = createSubjects();
  await roleService.updateRole("ROLE:FIRST", {
    inclusions: { addRoleIds: [reviewerRoleId], removeRoleIds: [] },
  });
  const duty = await roleService.createRole({
    roleCode: "role-detail:hr-duties",
    roleName: "HR duties",
    roleKind: RoleKind.Composite,
    clientCode: "role-detail",
    status: RoleStatus.Enable,
  });
  await harness.db.insert(roleAssignments).values({
    roleId: duty.result.id,
    targetType: RoleAssignmentTargetType.Employment,
    targetId: hrEmployment!.id,
  });

  const hrAdministrationScopeResolver = createHrAdministrationScopeResolver({
    db: harness.db,
    roleAssignmentResolver: createRoleAssignmentResolver(harness.db),
  });
  const policy = createAdminAuthorizationPolicy({ hrAdministrationScopeResolver, logger: { warn: mock() } });
  const actor = async () => {
    const user = await userService.getUserDetailByUsernameForAdmin("hr");
    return { userId: user.id, username: user.username, roles: user.roles };
  };
  const app = new Hono<{
    Variables: {
      adminAuthorizationPolicy: typeof policy;
      userId: number;
      username: string;
      userDetailDto: { roles: string[] };
    };
  }>();
  app.use("*", async (context, next) => {
    context.set("adminAuthorizationPolicy", policy);
    const current = await actor();
    context.set("userId", current.userId);
    context.set("username", current.username);
    context.set("userDetailDto", { roles: current.roles });
    await next();
  });
  app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
  app.route("/admin", createUserRoute(createUserAdapter({ userService, random: { password: () => "unused" } })));
  app.route("/admin", createRoleRoute(createRoleAdapter({ roleService })));
  const userDetailRequest = () => app.request("/admin/users/role-holder");
  const updateAsActor = () =>
    app.request("/admin/roles/ROLE%3AFIRST", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName: "Updated by inherited administrator" }),
    });
  const patchDuty = (addRoleIds: number[], removeRoleIds: number[] = []) =>
    roleService.updateRole(duty.result.roleCode, { inclusions: { addRoleIds, removeRoleIds } });

  expect((await userDetailRequest()).status).toBe(403);
  await patchDuty([hrRole!.id]);
  const authorization = await policy.getEmploymentAuthorization(await actor());
  expect(authorization).toMatchObject({ kind: "scoped", organizationIds: [organizationId] });
  const employmentDetail = await employmentService.getEmploymentDetailByIdForAdmin(employmentId, authorization);
  expect(employmentDetail.roleNames).toHaveProperty("global:reviewer", "Reviewer");
  const user = await userDetailRequest();
  expect(user.status).toBe(200);
  const userDetail = await user.json();
  expect(userDetail).toMatchObject({
    data: {
      roleNames: { "global:reviewer": "Reviewer" },
      employments: [expect.objectContaining({ id: employmentId, roles: expect.arrayContaining(["global:reviewer"]) })],
    },
  });
  expect((await updateAsActor()).status).toBe(403);
  await patchDuty([fullRole!.id]);
  expect((await updateAsActor()).status).toBe(200);
  await patchDuty([], [fullRole!.id]);
  expect((await updateAsActor()).status).toBe(403);
  await patchDuty([], [hrRole!.id]);
  expect((await userDetailRequest()).status).toBe(403);

  const [ancestor, bridge] = await Promise.all(
    ["ancestor", "bridge"].map((suffix) =>
      roleService.createRole({
        roleCode: `role-detail:${suffix}`,
        roleName: suffix,
        roleKind: RoleKind.Composite,
        clientCode: "role-detail",
        status: RoleStatus.Enable,
      }),
    ),
  );
  await patchDuty([ancestor!.result.id]);
  await roleService.updateRole(ancestor!.result.roleCode, {
    inclusions: { addRoleIds: [bridge!.result.id], removeRoleIds: [] },
  });
  await roleService.updateRole(bridge!.result.roleCode, {
    inclusions: { addRoleIds: [fullRole!.id], removeRoleIds: [] },
  });
  expect((await updateAsActor()).status).toBe(200);
  await roleService.deleteRole(bridge!.result.roleCode);
  expect((await updateAsActor()).status).toBe(403);
});

function createSubjects() {
  const repositories = createAdminApiRepositories(harness.db);
  const roleAssignmentResolver = createRoleAssignmentResolver(harness.db);
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    organizationDocumentJobProducer: {
      async enqueueOutboxEntries() {
        return { enqueued: 0 };
      },
    },
    userDocumentJobProducer: {
      enqueueOutboxEntries: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: { nowDate: () => new Date("2026-09-22T00:00:00Z") },
  });
  const employmentService = createEmploymentService({
    employmentRepository: repositories.employment,
    roleAssignmentResolver,
    roleRepository: repositories.role,

    uow: mapUnitOfWork(
      unitOfWork,
      (tx) =>
        ({
          employmentRepository: tx.repositories.employment,
          auditService: tx.auditService,
          userDocumentInvalidation: tx.userDocumentInvalidation,
        }) satisfies AdminEmploymentTransactionPorts,
    ),
  });
  const subjectAccessLifecycle: AdminUserServiceDeps["subjectAccessLifecycle"] = {
    async run() {
      throw new Error("Subject Access lifecycle is not used by detail queries");
    },
  };
  const userService = createUserService({
    userRepository: repositories.user,
    employmentRepository: repositories.employment,
    roleAssignmentResolver,
    roleRepository: repositories.role,

    passwordHasher: { hashPassword: async (password) => password },
    random: {
      password: () => "unused-password",
      uuid: () => "10000000-0000-4000-8000-000000000001",
    },
    sessionRevocation: { revokeUserSessions: async () => ({}) },
    subjectAccessLifecycle,
    uow: mapUnitOfWork(
      unitOfWork,
      (tx) =>
        ({
          userRepository: tx.repositories.user,
          auditService: tx.auditService,
          subjectAccessMutation: {
            async runMutation<T>(
              _receipt: SubjectAccessMutationReceipt,
              mutation: () => Promise<T>,
              _resolveTarget: (result: T) => SubjectAccessTransitionTarget,
            ) {
              return await mutation();
            },
          },
          userDocumentInvalidation: tx.userDocumentInvalidation,
        }) satisfies AdminUserTransactionPorts,
    ),
  });
  const roleService = createRoleService({
    roleRepository: repositories.role,
    uow: mapUnitOfWork(unitOfWork, (tx) => ({
      roleRepository: tx.repositories.role,
      auditService: tx.auditService,
      userDocumentInvalidation: tx.userDocumentInvalidation,
    })),
  });
  return { employmentService, userService, roleService };
}

async function seedRoleDetailGraph(assignReviewer = true) {
  const [client] = await harness.db
    .insert(clients)
    .values({
      clientCode: "role-detail",
      clientName: "Role detail",
      clientSecret: "synthetic",
      extAttributes: {},
    })
    .returning();
  const [user] = await harness.db
    .insert(users)
    .values({
      username: "role-holder",
      name: "Role Holder",
      userType: UserType.Formal,
    })
    .returning();
  const [organization] = await harness.db
    .insert(organizations)
    .values({
      orgCode: "ROLE",
      orgName: "Role Organization",
      parentId: -1,
      businessParentId: -1,
      path: "/ROLE",
      level: OrganizationLevel.One,
      orgType: OrganizationType.Department,
    })
    .returning();
  await harness.db.insert(organizationClosures).values({
    ancestorId: organization!.id,
    descendantId: organization!.id,
    depth: 0,
  });
  const [position] = await harness.db
    .insert(positions)
    .values({
      posCode: "ROLE",
      posName: "Role Position",
    })
    .returning();
  const [employment] = await harness.db
    .insert(employments)
    .values({
      userId: user!.id,
      orgId: organization!.id,
      posId: position!.id,
      status: EmploymentStatus.Enable,
      startTime: new Date("2026-01-01T00:00:00Z"),
    })
    .returning();
  const seededRoles = await harness.db
    .insert(roles)
    .values([
      { roleCode: "ROLE:FIRST", roleName: "First role", clientId: client!.id, roleKind: RoleKind.Composite },
      { roleCode: "ROLE:SECOND", roleName: "Second role", clientId: client!.id },
      { roleCode: "global:reviewer", roleName: "Reviewer", roleType: RoleType.Global },
    ])
    .returning();
  await harness.db.insert(roleAssignments).values(
    seededRoles
      .filter((role) => assignReviewer || role.roleType !== RoleType.Global)
      .map((role) => ({
        roleId: role.id,
        targetType: RoleAssignmentTargetType.Employment,
        targetId: employment!.id,
        includeDescendants: false,
      })),
  );
  return {
    employmentId: employment!.id,
    organizationId: organization!.id,
    positionId: position!.id,
    reviewerRoleId: seededRoles.find((role) => role.roleCode === "global:reviewer")!.id,
  };
}
