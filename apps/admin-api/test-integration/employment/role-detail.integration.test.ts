import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import type { AdminEmploymentTransactionPorts } from "@admin-api/services/employment/employment.port";
import { createEmploymentService } from "@admin-api/services/employment/employment.service";
import type { AdminUserServiceDeps, AdminUserTransactionPorts } from "@admin-api/services/user/user.port";
import { createUserService } from "@admin-api/services/user/user.service";
import type { SubjectAccessMutationReceipt, SubjectAccessTransitionTarget } from "@iam/api-core/subject-access";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  RoleAssignmentTargetType,
  UserType,
} from "@iam/contracts";
import { clients, employments, organizationClosures, organizations, positions, roles, users } from "@iam/db/schema";
import { roleAssignments } from "@iam/db/schema/role-assignments";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
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
    expect([...detail.roles].sort()).toEqual(["ROLE:FIRST", "ROLE:SECOND"]);
    expect(detail.roleNames).toEqual({ "ROLE:FIRST": "First role", "ROLE:SECOND": "Second role" });
  }
});

function createSubjects() {
  const repositories = createAdminApiRepositories(harness.db);
  const roleAssignmentResolver = createRoleAssignmentResolver(harness.db);
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    organizationSearchJobProducer: {
      async enqueueSourceChanges() {
        return { enqueued: 0 };
      },
    },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
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
          userProfileInvalidation: tx.userProfileInvalidation,
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
          userProfileInvalidation: tx.userProfileInvalidation,
        }) satisfies AdminUserTransactionPorts,
    ),
  });
  return { employmentService, userService };
}

async function seedRoleDetailGraph() {
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
      { roleCode: "ROLE:FIRST", roleName: "First role", clientId: client!.id },
      { roleCode: "ROLE:SECOND", roleName: "Second role", clientId: client!.id },
    ])
    .returning();
  await harness.db.insert(roleAssignments).values(
    seededRoles.map((role) => ({
      roleId: role.id,
      targetType: RoleAssignmentTargetType.Employment,
      targetId: employment!.id,
      includeDescendants: false,
    })),
  );
  return { employmentId: employment!.id };
}
