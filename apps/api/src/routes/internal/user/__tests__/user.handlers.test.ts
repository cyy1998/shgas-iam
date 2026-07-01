import { UserProfileDirtyReason } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createUserHandlers } from "../user.handlers";
import { createUsersSearchDslRoute } from "../user.routes";

function createHandlers() {
  const deps = {
    auditLogWriter: {
      recordAuditLogFromContext: mock(async () => undefined),
    },
    config: {
      nodeEnv: "test",
    },
    mobileService: {
      getPurveyorWelcomeMessage: mock(() => ""),
      sendMessage: mock(async () => undefined),
    },
    userProfileQuery: {
      searchDsl: mock(async () => []),
    },
    userService: {
      getUserDetailByUsername: mock(async () => ({})),
      searchUsers: mock(async () => [{ username: "zhangsan" }]),
      searchUsersWithPrivilegeDelegation: mock(async () => ({ users: [], delegations: [] })),
    },
    uow: {
      transaction: mock(async () => {
        throw new Error("uow should not be called");
      }),
    },
  };

  return {
    deps,
    handlers: createUserHandlers(deps as never),
  };
}

describe("createUserHandlers", () => {
  test("delegates legacy search through user service facade", async () => {
    const { deps, handlers } = createHandlers();
    const query = { usernames: ["zhangsan"] };
    const context = {
      req: { valid: mock(() => query) },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.usersSearch(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: [{ username: "zhangsan" }],
    });

    expect(deps.userService.searchUsers).toHaveBeenCalledWith(query);
  });

  test("delegates internal DSL search to profile query service", async () => {
    const { deps, handlers } = createHandlers();
    const input = {
      filter: { field: "user.username", op: "eq", value: "zhangsan" },
      limit: 10,
    };
    const context = {
      req: { valid: mock(() => input) },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.usersSearchDsl(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: [],
    });

    expect(deps.userProfileQuery.searchDsl).toHaveBeenCalledWith(input.filter, { limit: 10 });
  });

  test("marks an existing supplier contact dirty when a new employment is created", async () => {
    const { deps, handlers } = createHandlers();
    const profileDirtyMarker = {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [7] })),
    };
    (deps.uow.transaction as any).mockImplementationOnce(async (callback: any) => await callback({
      afterCommit: { bestEffort: mock(() => undefined) },
      employmentRepository: {
        getEmploymentByUserOrgPosId: mock(async () => null),
        setEmployment: mock(async () => ({})),
      },
      organizationRepository: {
        getOrganizationByCode: mock(async () => ({ id: 2 })),
      },
      positionRepository: {
        getPositionByCode: mock(async () => ({ id: 3 })),
      },
      profileDirtyMarker,
      userRepository: {
        getUserByMobile: mock(async () => ({ id: 7 })),
        setUser: mock(async () => {
          throw new Error("setUser should not be called");
        }),
      },
    }));
    const input = { username: "zhangsan", mobile: "13800000000", name: "张三", orgCode: "SUP" };
    const context = {
      req: {
        valid: mock(() => input),
        header: mock((name: string) => name === "Client" ? "portal" : undefined),
      },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.contactRegister(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: true,
    });

    expect(profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [7],
      reasonCodes: [UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: expect.any(Object),
    });
  });

  test("does not mark dirty when supplier contact employment already exists", async () => {
    const { deps, handlers } = createHandlers();
    const profileDirtyMarker = {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [7] })),
    };
    (deps.uow.transaction as any).mockImplementationOnce(async (callback: any) => await callback({
      afterCommit: { bestEffort: mock(() => undefined) },
      employmentRepository: {
        getEmploymentByUserOrgPosId: mock(async () => ({ id: 10 })),
        setEmployment: mock(async () => {
          throw new Error("setEmployment should not be called");
        }),
      },
      organizationRepository: {
        getOrganizationByCode: mock(async () => ({ id: 2 })),
      },
      positionRepository: {
        getPositionByCode: mock(async () => ({ id: 3 })),
      },
      profileDirtyMarker,
      userRepository: {
        getUserByMobile: mock(async () => ({ id: 7 })),
        setUser: mock(async () => {
          throw new Error("setUser should not be called");
        }),
      },
    }));
    const input = { username: "zhangsan", mobile: "13800000000", name: "张三", orgCode: "SUP" };
    const context = {
      req: {
        valid: mock(() => input),
        header: mock((name: string) => name === "Client" ? "portal" : undefined),
      },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.contactRegister(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: true,
    });

    expect(profileDirtyMarker.markUsersDirty).not.toHaveBeenCalled();
  });

  test("marks a new supplier contact user dirty for user and employment changes", async () => {
    const { deps, handlers } = createHandlers();
    const profileDirtyMarker = {
      markUsersDirty: mock(async () => ({ marked: 1, userIds: [9] })),
    };
    (deps.uow.transaction as any).mockImplementationOnce(async (callback: any) => await callback({
      afterCommit: { bestEffort: mock(() => undefined) },
      employmentRepository: {
        getEmploymentByUserOrgPosId: mock(async () => null),
        setEmployment: mock(async () => ({})),
      },
      organizationRepository: {
        getOrganizationByCode: mock(async () => ({ id: 2 })),
      },
      positionRepository: {
        getPositionByCode: mock(async () => ({ id: 3 })),
      },
      profileDirtyMarker,
      userRepository: {
        getUserByMobile: mock(async () => null),
        setUser: mock(async () => ({ id: 9 })),
      },
    }));
    const input = { username: "newuser", mobile: "13900000000", name: "新用户", orgCode: "SUP" };
    const context = {
      req: {
        valid: mock(() => input),
        header: mock((name: string) => name === "Client" ? "portal" : undefined),
      },
      json: mock((payload: unknown) => payload),
    };

    await expect(handlers.contactRegister(context as never, undefined as never)).resolves.toMatchObject({
      code: 200,
      data: true,
    });

    expect(profileDirtyMarker.markUsersDirty).toHaveBeenCalledWith({
      userIds: [9],
      reasonCodes: [UserProfileDirtyReason.UserUpdated, UserProfileDirtyReason.EmploymentUpdated],
      afterCommit: expect.any(Object),
    });
  });
});

describe("createUsersSearchDslRoute", () => {
  test("bounds request limit with configured DSL max", () => {
    const route = createUsersSearchDslRoute(2);
    const schema = route.request.body.content["application/json"].schema;

    expect(schema.safeParse({
      filter: { field: "user.username", op: "eq", value: "zhangsan" },
      limit: 3,
    }).success).toBe(false);
  });
});
