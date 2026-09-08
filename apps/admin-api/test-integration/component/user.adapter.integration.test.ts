import type { Context } from "hono";
import { createUserAdapter } from "@admin-api/routes/admin/user/user.adapter";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import {
  EmploymentStatus,
  OrganizationLevel,
  OrganizationType,
  UserStatus,
  UserType,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const createdAt = new Date("2026-01-01T00:00:00.000Z");
const denied = { allowed: false, reason: "ACTION_NOT_GRANTED" } as const;
const allowed = { allowed: true, reason: null } as const;

function createContext(
  roles: string[],
  resolveForActor = mock(async () => roles.includes("iam:hr-admin")
    ? { rootOrganizationIds: [10], organizationIds: [10] }
    : null),
  warn = mock(),
) {
  const policy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: { resolveForActor },
    logger: { warn },
  });
  return {
    req: { header: () => undefined },
    get(key: string) {
      if (key === "adminAuthorizationPolicy")
        return policy;
      if (key === "userId")
        return 7;
      if (key === "username")
        return "operator";
      if (key === "userDetailDto")
        return { roles };
      return undefined;
    },
  } as unknown as Context;
}

function userDetail(
  employments: unknown[] = [],
  status: UserStatus = UserStatus.Enable,
) {
  return {
    id: 42,
    username: "target",
    wxId: null,
    name: "Target User",
    mobile: "13800000001",
    userType: UserType.Formal,
    orderNum: 1,
    status,
    isDelete: false,
    createTime: createdAt,
    updateTime: createdAt,
    employments,
    privileges: [],
    roles: [],
  };
}

function employment(id: number, orgId: number, status: EmploymentStatus) {
  const node = {
    id: orgId,
    orgCode: `ORG-${orgId}`,
    orgName: `Organization ${orgId}`,
    orgType: OrganizationType.Department,
    level: OrganizationLevel.Two,
    parentId: 10,
    isVirtual: false,
    isEntity: true,
    pathIndex: 0,
    distanceToAssignedOrg: 0,
  };
  return {
    id,
    userId: 42,
    orgId,
    posId: 3,
    isPrimary: false,
    status,
    startTime: createdAt,
    endTime: status === EmploymentStatus.Disable ? createdAt : null,
    description: null,
    isDelete: false,
    createTime: createdAt,
    updateTime: createdAt,
    user: { id: 42, username: "target", name: "Target User", mobile: null, wxId: null },
    organization: { assignedOrg: node, fullOrgPath: [node], companyNodes: [] },
    position: { id: 3, posCode: "DEV", posName: "Developer" },
    roles: [],
    privileges: [],
  };
}

describe("admin User adapter authorization projection", () => {
  test("returns the same safe create result through REST and tRPC", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        setUserForAdmin: mock(async () => ({
          changed: true,
          result: {
            username: "target",
            generatedPassword: "Rand1234",
            user: { ...userDetail(), password: "hash-must-not-leak", subjectIdentifier: "private-subject" },
          },
        })),
      },
    } as never);
    const input = { username: "target", name: "Target User", userType: UserType.Formal };
    const context = createContext(["iam:admin"]);
    const json = mock((body: unknown) => body);
    const restContext = {
      ...context,
      req: { header: () => undefined, valid: () => input },
      json,
    };
    await adapter.usersCreate(restContext as never, async () => {});
    const result = await adapter.userAdminRouter.createCaller({ hono: context }).create(input);
    expect(json).toHaveBeenCalledWith({ code: 200, data: result, message: "success" }, 200);
    expect(result).toMatchObject({
      changed: true,
      result: { username: "target", generatedPassword: "Rand1234", user: { statusText: "正常" } },
    });
    expect(result.result.user).not.toHaveProperty("password");
    expect(result.result.user).not.toHaveProperty("subjectIdentifier");
    expect(result.result.user).not.toHaveProperty("roles");
  });

  test("preserves profile no-op and committed-failure semantics without returning a password", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        updateUser: mock(async () => ({ changed: false, result: null })),
        resetPasswordByUsername: mock(async () => { throw new AdminMutationCommittedError(); }),
      },
    } as never);
    const caller = adapter.userAdminRouter.createCaller({ hono: createContext(["iam:admin"]) });
    const updated = await caller.update({ username: "target", data: { name: "Target User" } });
    expect(updated).toEqual({ changed: false, result: null });
    let failure: unknown;
    try {
      await caller.resetPassword({ username: "target" });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      cause: { code: "ADMIN_MUTATION_COMMITTED" },
    });
    expect(JSON.stringify(failure)).not.toContain("Rand1234");
  });

  test("returns HR-managed profile and password actions from target Employment and User facts", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        getUserDetailByUsernameForAdmin: mock(async () => userDetail([
          employment(1, 20, EmploymentStatus.Enable),
          employment(2, 10, EmploymentStatus.Pause),
        ])),
      },
    } as never);

    const result = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) })
      .detail({ username: "target" });

    expect(result.allowedActions).toEqual({
      editProfile: allowed,
      resetPassword: allowed,
      changeStatus: {
        allowed: false,
        reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      },
      delete: denied,
      resign: {
        allowed: false,
        reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      },
    });
  });

  test("distinguishes ended-only targets from HR-managed Users that are not enabled", async () => {
    const getUserDetailByUsernameForAdmin = mock(async (username: string) => username === "ended"
      ? userDetail([employment(1, 10, EmploymentStatus.Disable)])
      : userDetail([employment(2, 10, EmploymentStatus.Enable)], UserStatus.Pause));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { getUserDetailByUsernameForAdmin },
    } as never);
    const caller = adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) });

    const ended = await caller.detail({ username: "ended" });
    const paused = await caller.detail({ username: "paused" });

    expect(ended.allowedActions).toMatchObject({
      editProfile: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      resetPassword: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
      changeStatus: { allowed: false, reason: "USER_NOT_HR_MANAGED" },
    });
    expect(paused.allowedActions).toMatchObject({
      editProfile: allowed,
      resetPassword: { allowed: false, reason: "USER_NOT_ENABLED" },
      changeStatus: allowed,
    });
    expect(ended.allowedActions.resign).toEqual({
      allowed: false,
      reason: "USER_NOT_HR_MANAGED",
    });
  });

  test("allows completed resignation retry only for a disabled User with in-scope ended history", async () => {
    const getUserDetailByUsernameForAdmin = mock(async (username: string) => userDetail(
      [employment(1, username === "inside" ? 10 : 20, EmploymentStatus.Disable)],
      UserStatus.Disable,
    ));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { getUserDetailByUsernameForAdmin },
    } as never);
    const caller = adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) });

    const inside = await caller.detail({ username: "inside" });
    const outside = await caller.detail({ username: "outside" });

    expect(inside.allowedActions.resign).toEqual(allowed);
    expect(outside.allowedActions.resign).toEqual({
      allowed: false,
      reason: "USER_NOT_HR_MANAGED",
    });
  });

  test("ignores out-of-scope Ended Employment for the User status action", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        getUserDetailByUsernameForAdmin: mock(async () => userDetail([
          employment(1, 10, EmploymentStatus.Enable),
          employment(2, 20, EmploymentStatus.Disable),
        ])),
      },
    } as never);

    const result = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) })
      .detail({ username: "target" });

    expect(result.allowedActions.changeStatus).toEqual(allowed);
  });

  test("adds Employment management actions only for in-scope Open rows", async () => {
    const resolveForActor = mock(async () => ({
      rootOrganizationIds: [10],
      organizationIds: [10],
    }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        getUserDetailByUsernameForAdmin: mock(async () => userDetail([
          employment(1, 10, EmploymentStatus.Enable),
          employment(2, 20, EmploymentStatus.Pause),
          employment(3, 10, EmploymentStatus.Disable),
        ])),
      },
    } as never);

    const result = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"], resolveForActor) })
      .detail({ username: "target" });

    expect(result.employments.map(item => item.managementPath)).toEqual([
      "/employments?employmentId=1",
      null,
      null,
    ]);
    expect(result.employments[0]?.allowedActions).toMatchObject({
      pause: allowed,
      end: allowed,
      transfer: allowed,
      setPrimary: allowed,
    });
    expect(result.employments[1]?.allowedActions.transfer).toEqual({
      allowed: false,
      reason: "RESOURCE_OUT_OF_SCOPE",
    });
    expect(result.employments[2]?.allowedActions.transfer).toEqual({
      allowed: false,
      reason: "RESOURCE_STATE_NOT_ACTIONABLE",
    });
    expect(resolveForActor).toHaveBeenCalledTimes(1);
  });

  test("preserves every User detail action for a full or mixed administrator", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        getUserDetailByUsernameForAdmin: mock(async () => userDetail()),
      },
    } as never);

    const result = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:admin", "iam:hr-admin"]) })
      .detail({ username: "target" });

    expect(result.allowedActions).toEqual({
      editProfile: allowed,
      resetPassword: allowed,
      changeStatus: allowed,
      delete: allowed,
      resign: allowed,
    });
  });

  test("passes request-time User authorization to profile and password mutations", async () => {
    const updateUser = mock(async (..._args: unknown[]) => ({ changed: true, result: null }));
    const resetPasswordByUsername = mock(async (..._args: unknown[]) => ({ changed: true, result: "Rand1234" }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { updateUser, resetPasswordByUsername },
    } as never);

    await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) })
      .update({ username: "target", data: { name: "New Name" } });
    const password = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) })
      .resetPassword({ username: "target" });

    expect(updateUser.mock.calls[0]?.[3]).toMatchObject({
      kind: "scoped",
      organizationIds: [10],
    });
    expect(resetPasswordByUsername.mock.calls[0]?.[2]).toMatchObject({
      kind: "scoped",
      organizationIds: [10],
    });
    expect(password).toEqual({ changed: true, result: "Rand1234" });
  });

  test("passes request-time User authorization to status mutations", async () => {
    const updateUserStatus = mock(async (..._args: unknown[]) => ({ changed: false, result: null }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { updateUserStatus },
    } as never);

    const updated = await adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) })
      .updateStatus({ username: "target", status: UserStatus.Pause });

    expect(updated).toEqual({ changed: false, result: null });
    expect(updateUserStatus.mock.calls[0]?.[3]).toMatchObject({
      kind: "scoped",
      organizationIds: [10],
    });
  });

  test("preserves status/delete outcomes through REST and tRPC", async () => {
    for (const changed of [true, false]) {
      const outcome = { changed, result: null };
      const adapter = createUserAdapter({
        random: { password: mock(() => "unused") },
        userService: {
          updateUserStatus: mock(async () => outcome),
          deleteUser: mock(async () => outcome),
        },
      } as never);
      const context = createContext(["iam:admin"]);
      const caller = adapter.userAdminRouter.createCaller({ hono: context });
      const status = await caller.updateStatus({ username: "target", status: UserStatus.Pause });
      const deleted = await caller.delete({ username: "target" });
      expect(status).toEqual(outcome);
      expect(deleted).toEqual(outcome);
      for (const handler of [adapter.usersStatusUpdate, adapter.usersDelete]) {
        const json = mock((body: unknown) => body);
        await handler({
          ...createContext(["iam:admin"]),
          req: {
            header: () => undefined,
            valid: (kind: string) => kind === "param" ? { username: "target" } : { status: UserStatus.Pause },
          },
          json,
        } as never, async () => {});
        expect(json).toHaveBeenCalledWith({ code: 200, data: outcome, message: "success" }, 200);
      }
    }
  });

  test("preserves explicit committed failures for status and delete", async () => {
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: {
        updateUserStatus: mock(async () => { throw new AdminMutationCommittedError(); }),
        deleteUser: mock(async () => { throw new AdminMutationCommittedError(); }),
      },
    } as never);
    const caller = adapter.userAdminRouter.createCaller({ hono: createContext(["iam:admin"]) });
    for (const run of [
      () => caller.updateStatus({ username: "target", status: UserStatus.Pause }),
      () => caller.delete({ username: "target" }),
    ]) {
      const failure = await run().catch((error: unknown) => error);
      expect(failure).toMatchObject({ code: "INTERNAL_SERVER_ERROR", cause: { code: "ADMIN_MUTATION_COMMITTED" } });
    }
  });

  test("returns 403 and logs a direct HR status denial through the adapter", async () => {
    const warn = mock();
    const updateUserStatus = mock(async (
      username: string,
      _status: UserStatus,
      _auditContext: unknown,
      authorization: {
        denyMutation: (input: {
          operationId: "admin.user.updateStatus";
          resourceIdentifier: string;
          reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT";
        }) => never;
      },
    ) => authorization.denyMutation({
      operationId: "admin.user.updateStatus",
      resourceIdentifier: username,
      reason: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
    }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { updateUserStatus },
    } as never);
    let failure: unknown;

    try {
      await adapter.userAdminRouter
        .createCaller({ hono: createContext(["iam:hr-admin"], undefined, warn) })
        .updateStatus({ username: "target", status: UserStatus.Disable });
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: "FORBIDDEN" });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.user.updateStatus",
        resourceType: "user",
        resourceIdentifier: "target",
        reasonCode: "USER_HAS_OUT_OF_SCOPE_OPEN_EMPLOYMENT",
      }),
      "admin mutation authorization denied",
    );
  });

  test("rejects HR profile fields outside the allowlist without reaching the service", async () => {
    const updateUser = mock(async (..._args: unknown[]) => ({ changed: true, result: null }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { updateUser },
    } as never);

    for (const data of [
      { status: UserStatus.Pause },
      { orderNum: 3 },
      { unexpected: true },
    ]) {
      let failure: unknown;
      try {
        await adapter.userAdminRouter
          .createCaller({ hono: createContext(["iam:hr-admin"]) })
          .update({ username: "target", data } as never);
      }
      catch (error) {
        failure = error;
      }
      expect(failure).toMatchObject({ code: "FORBIDDEN" });
    }
    expect(updateUser).not.toHaveBeenCalled();
  });

  test("rechecks the HR profile allowlist when operation authorization is cached", async () => {
    const updateUser = mock(async (..._args: unknown[]) => ({ changed: true, result: null }));
    const adapter = createUserAdapter({
      random: { password: mock(() => "unused") },
      userService: { updateUser },
    } as never);
    const caller = adapter.userAdminRouter
      .createCaller({ hono: createContext(["iam:hr-admin"]) });

    await caller.update({ username: "target", data: { name: "Allowed" } });
    let failure: unknown;
    try {
      await caller.update({
        username: "target",
        data: { status: UserStatus.Pause },
      } as never);
    }
    catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: "FORBIDDEN" });
    expect(updateUser).toHaveBeenCalledTimes(1);
  });
});
