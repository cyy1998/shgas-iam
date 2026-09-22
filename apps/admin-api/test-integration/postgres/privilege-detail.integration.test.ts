import type { AdminEmploymentTransactionPorts } from "@admin-api/services/employment/employment.port";
import type { AdminUserServiceDeps, AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import { createUserService } from "@admin-api/services/user/user.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  PrivilegeStatus,
  RoleAssignmentTargetType,
  UserType,
} from "@iam/contracts";
import {
  clients,
  employments,
  organizationClosures,
  organizations,
  positions,
  privileges,
  rolePrivileges,
  roles,
  users,
} from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
  await harness.sql`truncate role_privilege, role_assignment, privilege, role, client restart identity cascade`;
});

afterAll(async () => {
  await harness.close();
});

test("User and Employment details expose only distinct enabled non-deleted privileges", async () => {
  const seeded = await seedPrivilegeDetailGraph();
  const { employmentService, userService } = createSubjects();

  const employmentDetail = await employmentService.getEmploymentDetailByIdForAdmin(seeded.employmentId);
  const userDetail = await userService.getUserDetailByUsernameForAdmin("privilege-holder");
  const userEmploymentDetail = userDetail.employments.find(item => item.id === seeded.employmentId);
  const expectedPrivileges = ["shared:read", "unique:write"];
  const expectedPrivilegeNames = {
    "shared:read": "Shared read",
    "unique:write": "Unique write",
  };

  expect([...employmentDetail.privileges].sort()).toEqual(expectedPrivileges);
  expect(employmentDetail.privilegeNames).toEqual(expectedPrivilegeNames);
  expect([...userDetail.privileges].sort()).toEqual(expectedPrivileges);
  expect(userDetail.privilegeNames).toEqual(expectedPrivilegeNames);
  expect([...userEmploymentDetail!.privileges].sort()).toEqual(expectedPrivileges);
  expect(userEmploymentDetail!.privilegeNames).toEqual(expectedPrivilegeNames);
});

function createSubjects() {
  const repositories = createAdminApiRepositories(harness.db);
  const roleAssignmentResolver = createRoleAssignmentResolver(harness.db);
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: { nowDate: () => new Date("2026-09-22T00:00:00Z") },
  });
  const employmentService = createEmploymentService({
    employmentRepository: repositories.employment,
    roleAssignmentResolver,
    roleRepository: repositories.role,
    privilegeRepository: repositories.privilege,
    uow: mapUnitOfWork(unitOfWork, tx => ({
      employmentRepository: tx.repositories.employment,
      auditService: tx.auditService,
      userProfileInvalidation: tx.userProfileInvalidation,
    } satisfies AdminEmploymentTransactionPorts)),
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
    privilegeRepository: repositories.privilege,
    passwordHasher: { hashPassword: async password => password },
    random: {
      password: () => "unused-password",
      uuid: () => "10000000-0000-4000-8000-000000000001",
    },
    sessionRevocation: { revokeUserSessions: async () => ({}) },
    subjectAccessLifecycle,
    uow: mapUnitOfWork(unitOfWork, tx => ({
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
      userProfileInvalidation: tx.userProfileInvalidation,
    } satisfies AdminUserTransactionPorts)),
  });
  return { employmentService, userService };
}

async function seedPrivilegeDetailGraph() {
  const [client] = await harness.db.insert(clients).values({
    clientCode: "privilege-detail",
    clientName: "Privilege detail",
    clientSecret: "synthetic",
    extAttributes: {},
  }).returning();
  const [user] = await harness.db.insert(users).values({
    username: "privilege-holder",
    name: "Privilege Holder",
    userType: UserType.Formal,
  }).returning();
  const [organization] = await harness.db.insert(organizations).values({
    orgCode: "PRIVILEGE",
    orgName: "Privilege Organization",
    parentId: -1,
    businessParentId: -1,
    path: "/PRIVILEGE",
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
  }).returning();
  await harness.db.insert(organizationClosures).values({
    ancestorId: organization!.id,
    descendantId: organization!.id,
    depth: 0,
  });
  const [position] = await harness.db.insert(positions).values({
    posCode: "PRIVILEGE",
    posName: "Privilege Position",
  }).returning();
  const [employment] = await harness.db.insert(employments).values({
    userId: user!.id,
    orgId: organization!.id,
    posId: position!.id,
    status: EmploymentStatus.Enable,
    startTime: new Date("2026-01-01T00:00:00Z"),
  }).returning();
  const seededRoles = await harness.db.insert(roles).values([
    { roleCode: "PRIVILEGE:FIRST", roleName: "First role", clientId: client!.id },
    { roleCode: "PRIVILEGE:SECOND", roleName: "Second role", clientId: client!.id },
  ]).returning();
  await harness.db.insert(roleAssignments).values(seededRoles.map(role => ({
    roleId: role.id,
    targetType: RoleAssignmentTargetType.Employment,
    targetId: employment!.id,
    includeDescendants: false,
  })));
  const seededPrivileges = await harness.db.insert(privileges).values([
    { privilegeCode: "shared:read", privilegeName: "Shared read", status: PrivilegeStatus.Enable },
    { privilegeCode: "unique:write", privilegeName: "Unique write", status: PrivilegeStatus.Enable },
    { privilegeCode: "paused:read", privilegeName: "Paused read", status: PrivilegeStatus.Pause },
    { privilegeCode: "disabled:read", privilegeName: "Disabled read", status: PrivilegeStatus.Disable },
    { privilegeCode: "deleted:read", privilegeName: "Deleted read", status: PrivilegeStatus.Enable, isDelete: true },
  ]).returning();
  const privilegeId = (code: string) =>
    seededPrivileges.find(item => item.privilegeCode === code)!.id;
  await harness.db.insert(rolePrivileges).values([
    { roleId: seededRoles[0]!.id, privilegeId: privilegeId("shared:read") },
    { roleId: seededRoles[1]!.id, privilegeId: privilegeId("shared:read") },
    { roleId: seededRoles[1]!.id, privilegeId: privilegeId("unique:write") },
    { roleId: seededRoles[0]!.id, privilegeId: privilegeId("paused:read") },
    { roleId: seededRoles[0]!.id, privilegeId: privilegeId("disabled:read") },
    { roleId: seededRoles[1]!.id, privilegeId: privilegeId("deleted:read") },
  ]);
  return { employmentId: employment!.id };
}
