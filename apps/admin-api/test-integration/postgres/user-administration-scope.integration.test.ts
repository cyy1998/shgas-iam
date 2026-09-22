import type { createUnifiedAdminLifecycleRevocation } from "@admin-api/composition/session/unified-lifecycle";
import type { AdminUserAuthorization } from "@admin-api/services/admin-authorization/admin-user-authorization.type";
import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import { createAdminApiRepositories } from "@admin-api/composition/repositories";
import { createAdminApiUnitOfWork } from "@admin-api/composition/tx";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { createUserService } from "@admin-api/services/user/user.service";
import { mapUnitOfWork } from "@iam/api-core/uow";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  PositionStatus,
  UserStatus,
  UserType,
} from "@iam/contracts";
import {
  auditLogs,
  employments,
  organizations,
  positions,
  users,
} from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { asc, eq, inArray } from "drizzle-orm";
import { createAdminApiPostgresTestHarness } from "./postgres-test-harness";

type AdminSessionRevocationPort = ReturnType<typeof createUnifiedAdminLifecycleRevocation>;

let harness: Awaited<ReturnType<typeof createAdminApiPostgresTestHarness>>;

beforeAll(async () => {
  harness = await createAdminApiPostgresTestHarness();
});

beforeEach(async () => {
  await harness.reset();
});

afterAll(async () => {
  await harness.close();
});

describe("User administration PostgreSQL authorization", () => {
  test("commits an HR-managed profile and password before revoking Sessions", async () => {
    const seed = await seedUserAdministrationGraph(harness.db);
    const authorization = await scopedAuthorization(seed.inScopeOrganizationId);
    const revocationObservations: Array<{
      password: string | null;
      auditActions: string[];
    }> = [];
    const sessionRevocation = mock(async () => {
      const [persistedUser, persistedAudits] = await Promise.all([
        harness.db
          .select({ password: users.password })
          .from(users)
          .where(eq(users.username, "managed")),
        harness.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .orderBy(asc(auditLogs.id)),
      ]);
      revocationObservations.push({
        password: persistedUser[0]?.password ?? null,
        auditActions: persistedAudits.map(row => row.action),
      });
      return revokeSummary();
    });
    const fixture = createService(sessionRevocation);

    const profileUpdated = await fixture.service.updateUser(
      "managed",
      {
        name: "Managed Updated",
        mobile: "13900000000",
        wxId: "managed-wx",
        userType: UserType.Informal,
      },
      undefined,
      authorization,
    );
    const newPassword = await fixture.service.resetPasswordByUsername(
      "managed",
      undefined,
      authorization,
    );
    const [persistedUser] = await harness.db
      .select({
        name: users.name,
        mobile: users.mobile,
        wxId: users.wxId,
        userType: users.userType,
        password: users.password,
      })
      .from(users)
      .where(eq(users.username, "managed"));
    const persistedAudits = await harness.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .orderBy(asc(auditLogs.id));

    expect(profileUpdated).toEqual({ changed: true, result: null });
    expect(newPassword).toEqual({ changed: true, result: "Rand1234" });
    expect(persistedUser).toEqual({
      name: "Managed Updated",
      mobile: "13900000000",
      wxId: "managed-wx",
      userType: UserType.Informal,
      password: "hashed:Rand1234",
    });
    expect(persistedAudits.map(row => row.action)).toEqual([
      "admin.user.update",
      "admin.user.reset_password",
    ]);
    expect(revocationObservations).toEqual([{
      password: "hashed:Rand1234",
      auditActions: ["admin.user.update", "admin.user.reset_password"],
    }]);
    expect(sessionRevocation).toHaveBeenCalledTimes(1);
  });

  test("commits a self-target HR User status change when every Open Employment is in scope", async () => {
    const seed = await seedUserAdministrationGraph(harness.db);
    const authorization = await scopedAuthorization(seed.inScopeOrganizationId);
    const revocationObservations: Array<{
      status: UserStatus | null;
      auditActions: string[];
    }> = [];
    const sessionRevocation = mock(async () => {
      const [persistedUser, persistedAudits] = await Promise.all([
        harness.db
          .select({ status: users.status })
          .from(users)
          .where(eq(users.username, "status-history")),
        harness.db
          .select({ action: auditLogs.action })
          .from(auditLogs)
          .orderBy(asc(auditLogs.id)),
      ]);
      revocationObservations.push({
        status: persistedUser[0]?.status ?? null,
        auditActions: persistedAudits.map(row => row.action),
      });
      return revokeSummary();
    });
    const fixture = createService(sessionRevocation);

    const updated = await fixture.service.updateUserStatus(
      "status-history",
      UserStatus.Disable,
      {
        actorType: "admin",
        actorUserId: seed.statusHistoryUserId,
      },
      authorization,
    );
    const [persistedUser] = await harness.db
      .select({ status: users.status })
      .from(users)
      .where(eq(users.username, "status-history"));
    const persistedAudits = await harness.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .orderBy(asc(auditLogs.id));

    expect(updated).toEqual({ changed: true, result: null });
    expect(persistedUser).toEqual({ status: UserStatus.Disable });
    expect(persistedAudits.map(row => row.action)).toEqual([
      "admin.user.status_update",
    ]);
    expect(revocationObservations).toEqual([{
      status: UserStatus.Disable,
      auditActions: ["admin.user.status_update"],
    }]);
  });

  test("restoring Pause does not let HR enable a User with an outside Open Employment", async () => {
    const seed = await seedUserAdministrationGraph(harness.db);
    const authorization = await scopedAuthorization(seed.inScopeOrganizationId);
    const fixture = createService(mock(async () => revokeSummary()));
    await fixture.service.updateUserStatus("mixed-paused", UserStatus.Disable);
    await fixture.service.updateUserStatus("mixed-paused", UserStatus.Pause);
    const beforeUsers = await harness.db.select().from(users);
    const beforeEmployments = await harness.db.select().from(employments);
    const beforeAudits = await harness.db.select().from(auditLogs);
    let failure: unknown;
    try {
      await fixture.service.updateUserStatus("mixed-paused", UserStatus.Enable, undefined, authorization);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ httpStatus: 403 });
    const afterUsers = await harness.db.select().from(users);
    const afterEmployments = await harness.db.select().from(employments);
    const afterAudits = await harness.db.select().from(auditLogs);
    expect(afterUsers).toEqual(beforeUsers);
    expect(afterEmployments).toEqual(beforeEmployments);
    expect(afterAudits).toEqual(beforeAudits);
  });

  test("rejects mixed-scope and zero-Open HR User status changes without writes", async () => {
    const seed = await seedUserAdministrationGraph(harness.db);
    const authorization = await scopedAuthorization(seed.inScopeOrganizationId);
    const sessionRevocation = mock(async () => revokeSummary());
    const fixture = createService(sessionRevocation);
    const failures: unknown[] = [];

    for (const username of ["managed", "mixed-paused", "ended"]) {
      try {
        await fixture.service.updateUserStatus(
          username,
          UserStatus.Disable,
          undefined,
          authorization,
        );
      }
      catch (error) {
        failures.push(error);
      }
    }
    const persistedUsers = await harness.db
      .select({ username: users.username, status: users.status })
      .from(users)
      .where(inArray(users.username, ["managed", "mixed-paused", "ended"]))
      .orderBy(asc(users.username));
    const persistedAudits = await harness.db.select().from(auditLogs);

    expect(failures).toHaveLength(3);
    for (const failure of failures)
      expect(failure).toMatchObject({ httpStatus: 403 });
    expect(persistedUsers).toEqual([
      { username: "ended", status: UserStatus.Enable },
      { username: "managed", status: UserStatus.Enable },
      { username: "mixed-paused", status: UserStatus.Enable },
    ]);
    expect(persistedAudits).toEqual([]);
    expect(fixture.subjectAccessLifecycle.run).not.toHaveBeenCalled();
    expect(sessionRevocation).not.toHaveBeenCalled();
  });

  test("rejects ended-only, outside-only, soft-deleted, and non-enabled targets without writes or Session revocation", async () => {
    const seed = await seedUserAdministrationGraph(harness.db);
    const authorization = await scopedAuthorization(seed.inScopeOrganizationId);
    const sessionRevocation = mock(async () => revokeSummary());
    const fixture = createService(sessionRevocation);

    const failures: unknown[] = [];
    for (const username of ["ended", "outside", "deleted"]) {
      try {
        await fixture.service.updateUser(
          username,
          { name: "Forbidden Update" },
          undefined,
          authorization,
        );
      }
      catch (error) {
        failures.push(error);
      }
    }
    try {
      await fixture.service.resetPasswordByUsername(
        "paused-user",
        undefined,
        authorization,
      );
    }
    catch (error) {
      failures.push(error);
    }
    const persistedUsers = await harness.db
      .select({ username: users.username, name: users.name, password: users.password })
      .from(users)
      .orderBy(asc(users.username));
    const persistedAudits = await harness.db.select().from(auditLogs);

    expect(failures).toHaveLength(4);
    for (const failure of failures)
      expect(failure).toMatchObject({ httpStatus: 403 });
    expect(persistedUsers).toEqual([
      { username: "deleted", name: "deleted", password: "old:deleted" },
      { username: "ended", name: "ended", password: "old:ended" },
      { username: "managed", name: "managed", password: "old:managed" },
      {
        username: "mixed-paused",
        name: "mixed-paused",
        password: "old:mixed-paused",
      },
      { username: "outside", name: "outside", password: "old:outside" },
      { username: "paused-user", name: "paused-user", password: "old:paused-user" },
      {
        username: "status-history",
        name: "status-history",
        password: "old:status-history",
      },
    ]);
    expect(persistedAudits).toEqual([]);
    expect(fixture.random.password).not.toHaveBeenCalled();
    expect(sessionRevocation).not.toHaveBeenCalled();
  });

  test("fails a non-enabled guarded password write before success audit, revocation, or plaintext return", async () => {
    await seedUserAdministrationGraph(harness.db);
    const sessionRevocation = mock(async () => revokeSummary());
    const fixture = createService(sessionRevocation);

    let failure: unknown;
    try {
      await fixture.service.resetPasswordByUsername("paused-user");
    }
    catch (error) {
      failure = error;
    }
    const [persistedUser] = await harness.db
      .select({ password: users.password })
      .from(users)
      .where(eq(users.username, "paused-user"));
    const persistedAudits = await harness.db.select().from(auditLogs);

    expect(failure).toBeInstanceOf(Error);
    expect(persistedUser).toEqual({ password: "old:paused-user" });
    expect(persistedAudits).toEqual([]);
    expect(sessionRevocation).not.toHaveBeenCalled();
  });
});

function createService(
  revokeUserSessions: AdminSessionRevocationPort["revokeUserSessions"],
) {
  const repositories = createAdminApiRepositories(harness.db);
  const unitOfWork = createAdminApiUnitOfWork({
    db: harness.db,
    logger: { error: mock(() => undefined), warn: mock(() => undefined) },
    userProfileJobProducer: {
      enqueueRebuildJobs: mock(async () => ({ enqueued: 0, jobIds: [] })),
    } as never,
    clock: { nowDate: () => new Date("2026-08-24T00:00:00Z") },
  });
  const random = {
    password: mock((_length: number) => "Rand1234"),
    uuid: mock(() => "10000000-0000-4000-8000-000000000001"),
  };
  const subjectAccessLifecycle = {
    run: mock(async (input: {
      mutate: (receipt: never) => Promise<unknown>;
      revokeSessions?: (
        result: unknown,
        context: { invalidatedSubjectAccessTransitionId: string },
      ) => Promise<unknown>;
    }) => {
      const result = await input.mutate({} as never);
      await input.revokeSessions?.(result, {
        invalidatedSubjectAccessTransitionId:
          "20000000-0000-4000-8000-000000000001",
      });
      return result;
    }),
  };
  const service = createUserService({
    userRepository: repositories.user,
    employmentRepository: repositories.employment,
    roleAssignmentResolver: {
      resolveEffectiveRoles: mock(async () => new Map()),
    },
    roleRepository: repositories.role,
    privilegeRepository: {
      getPrivilegesByRoleIds: mock(async () => []),
    },
    passwordHasher: {
      hashPassword: mock(async (password: string) => `hashed:${password}`),
    },
    random,
    sessionRevocation: { revokeUserSessions },
    subjectAccessLifecycle: subjectAccessLifecycle as never,
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
    })),
  });
  return { random, service, subjectAccessLifecycle };
}

function revokeSummary() {
  return { userSessionsTerminated: 0, clientSessionsTerminated: 0, results: [], unfinished: [] };
}

async function scopedAuthorization(
  inScopeOrganizationId: number,
): Promise<AdminUserAuthorization> {
  const policy = createAdminAuthorizationPolicy({
    logger: { warn: mock(() => undefined) },
    hrAdministrationScopeResolver: {
      resolveForActor: async () => ({
        rootOrganizationIds: [inScopeOrganizationId],
        organizationIds: [inScopeOrganizationId],
      }),
    },
  });
  return await policy.getUserAuthorization({
    userId: 999,
    username: "hr-admin",
    roles: ["iam:hr-admin"],
  });
}

async function seedUserAdministrationGraph(db: DbClient) {
  const [inScopeOrganization, outsideOrganization] = await db
    .insert(organizations)
    .values([
      organization("IN", "In Scope"),
      organization("OUT", "Outside"),
    ])
    .returning({ id: organizations.id });
  const [position] = await db
    .insert(positions)
    .values({
      posCode: "GLOBAL",
      posName: "Global Position",
      status: PositionStatus.Enable,
    })
    .returning({ id: positions.id });
  const seededUsers = await db
    .insert(users)
    .values([
      user("managed", UserStatus.Enable),
      user("mixed-paused", UserStatus.Enable),
      user("ended", UserStatus.Enable),
      user("outside", UserStatus.Enable),
      user("paused-user", UserStatus.Pause),
      user("deleted", UserStatus.Enable, true),
      user("status-history", UserStatus.Enable),
    ])
    .returning({ id: users.id, username: users.username });
  const userId = (username: string) =>
    seededUsers.find(item => item.username === username)!.id;
  await db.insert(employments).values([
    employment(
      userId("managed"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Pause,
    ),
    employment(
      userId("managed"),
      position!.id,
      outsideOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("mixed-paused"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("mixed-paused"),
      position!.id,
      outsideOrganization!.id,
      EmploymentStatus.Pause,
    ),
    employment(
      userId("ended"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Disable,
    ),
    employment(
      userId("outside"),
      position!.id,
      outsideOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("paused-user"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("deleted"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("status-history"),
      position!.id,
      inScopeOrganization!.id,
      EmploymentStatus.Enable,
    ),
    employment(
      userId("status-history"),
      position!.id,
      outsideOrganization!.id,
      EmploymentStatus.Disable,
    ),
  ]);
  return {
    inScopeOrganizationId: inScopeOrganization!.id,
    statusHistoryUserId: userId("status-history"),
  };
}

function organization(orgCode: string, orgName: string) {
  return {
    orgCode,
    orgName,
    parentId: -1,
    businessParentId: -1,
    path: `/${orgCode}`,
    level: OrganizationLevel.One,
    orgType: OrganizationType.Department,
    status: OrganizationStatus.Enable,
  };
}

function user(username: string, status: UserStatus, isDelete = false) {
  return {
    username,
    name: username,
    password: `old:${username}`,
    userType: UserType.Formal,
    status,
    isDelete,
  };
}

function employment(
  userId: number,
  posId: number,
  orgId: number,
  status: EmploymentStatus,
) {
  return {
    userId,
    posId,
    orgId,
    status,
    isPrimary: false,
    startTime: new Date("2026-01-01T00:00:00Z"),
    endTime: status === EmploymentStatus.Disable
      ? new Date("2026-02-01T00:00:00Z")
      : null,
  };
}
