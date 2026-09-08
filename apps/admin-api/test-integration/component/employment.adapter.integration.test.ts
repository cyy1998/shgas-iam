import type { AdminApiRestContext } from "@admin-api/lib/admin-api-adapter";
import type { AdminEmploymentAuthorization } from "@admin-api/services/admin-authorization/admin-employment-authorization.type";
import type { Context } from "hono";
import { createEmploymentAdapter } from "@admin-api/routes/admin/employment/employment.adapter";
import { createEmploymentRoute } from "@admin-api/routes/admin/employment/employment.index";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { ApiErrorCode, EmploymentStatus, OrganizationLevel, OrganizationType } from "@iam/contracts";
import { EmploymentAlreadyExistsError, EmploymentNotEditableError, EmploymentNotFoundError } from "@iam/domain/employment";
import { UserNotFoundError } from "@iam/domain/user";
import { TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { addTestAdminAuthorizationMiddleware, getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

function createRestContext(username: string) {
  return {
    get: mock((key: string) => {
      const authorizationValue = getTestAdminAuthorizationValue(key);
      if (authorizationValue !== undefined)
        return authorizationValue;
      if (key === "userId")
        return 1001;
      if (key === "username")
        return "admin";
      if (key === "requestId")
        return "req-1";
      if (key === "traceId")
        return "trace-1";
      return undefined;
    }),
    req: {
      header: mock((name: string) => name === "x-trace-id" ? "trace-1" : undefined),
      method: "POST",
      path: `/admin/employments/${username}/resign`,
      valid: mock(() => ({ username })),
    },
    json: mock((body: unknown) => body),
  } as unknown as AdminApiRestContext & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

function createHrContext(
  logger = { warn: mock() },
  resolveForActor = mock(async () => ({
    rootOrganizationIds: [10],
    organizationIds: [10, 11],
  })),
) {
  const policy = createAdminAuthorizationPolicy({
    hrAdministrationScopeResolver: { resolveForActor },
    logger,
  });
  return {
    req: { header: () => undefined },
    get(key: string) {
      if (key === "adminAuthorizationPolicy")
        return policy;
      if (key === "userId")
        return 7;
      if (key === "username")
        return "hradmin";
      if (key === "userDetailDto")
        return { roles: ["iam:hr-admin"] };
      return undefined;
    },
  } as unknown as Context;
}

describe("admin employment adapter", () => {
  test("passes server-resolved scope to HR Employment reads and approved mutations", async () => {
    const searchEmploymentsFuzzyForAdmin = mock(async () => ({
      result: [],
      total: 0,
      pageNum: 1,
      pageSize: 20,
      pages: 0,
    }));
    const getEmploymentDetailByIdForAdmin = mock(async () => {
      return {
        id: 4,
        userId: 8,
        orgId: 11,
        posId: 12,
        isPrimary: false,
        startTime: new Date("2026-01-01T00:00:00Z"),
        endTime: null,
        description: null,
        status: EmploymentStatus.Enable,
        isDelete: false,
        createTime: new Date("2026-01-01T00:00:00Z"),
        updateTime: new Date("2026-01-01T00:00:00Z"),
        user: { id: 8, username: "user", name: "User", mobile: null, wxId: null },
        organization: {
          assignedOrg: {
            id: 11,
            orgCode: "CHILD",
            orgName: "Child",
            orgType: OrganizationType.Department,
            level: OrganizationLevel.Two,
            parentId: 10,
            isVirtual: false,
            isEntity: true,
            pathIndex: 0,
            distanceToAssignedOrg: 0,
          },
          fullOrgPath: [],
          companyNodes: [],
        },
        position: { id: 12, posCode: "DEV", posName: "Developer" },
        roles: [],
        privileges: [],
      };
    });
    const createEmployment = mock(async () => ({ changed: true, result: { id: 5 } }));
    const updateEmployment = mock(async () => ({ changed: true, result: null }));
    const changeEmploymentAvailability = mock(async (
      input: { employmentId: number },
      options: { authorization: AdminEmploymentAuthorization },
    ) => {
      if (input.employmentId === 404) {
        options.authorization.denyMutation({ operationId: "admin.employment.pause", resourceIdentifier: 404, reason: "RESOURCE_OUT_OF_SCOPE", concealExistence: true });
      }
      return { changed: true, result: null };
    });
    const endEmployment = mock(async () => ({ changed: true, result: null }));
    const managePrimaryEmployment = mock(async () => ({ changed: true, result: null }));
    const transferEmployment = mock(async () => ({ changed: true, result: { id: 6 } }));
    const authorizationLogger = { warn: mock() };
    const resolveForActor = mock(async () => ({
      rootOrganizationIds: [10],
      organizationIds: [10, 11],
    }));
    const guardEmploymentMutationForAdmin = mock(async (
      id: number,
      operationId:
        | "admin.employment.pause"
        | "admin.employment.resume"
        | "admin.employment.end"
        | "admin.employment.transfer"
        | "admin.employment.setPrimary"
        | "admin.employment.clearPrimary",
      authorization: AdminEmploymentAuthorization,
    ) => {
      if (id === 404) {
        authorization.denyMutation({
          operationId,
          resourceIdentifier: id,
          reason: "RESOURCE_OUT_OF_SCOPE",
          concealExistence: true,
        });
      }
    });
    const adapter = createEmploymentAdapter({
      changeEmploymentAvailability: { execute: changeEmploymentAvailability },
      createEmployment: { execute: createEmployment },
      endEmployment: { execute: endEmployment },
      employmentService: {
        getEmploymentDetailByIdForAdmin,
        guardEmploymentMutationForAdmin,
        searchEmploymentsFuzzyForAdmin,
        updateEmployment,
      },
      managePrimaryEmployment: { execute: managePrimaryEmployment },
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
      transferEmployment: { execute: transferEmployment },
    } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createHrContext(authorizationLogger, resolveForActor),
    });
    const query = {
      pageNum: 1,
      pageSize: 20,
      conditions: { fuzzyConditions: {}, exactConditions: {} },
    };

    await caller.search(query);
    const detail = await caller.detail({ id: 4 });
    await caller.create({ username: "user", orgCode: "CHILD", posCode: "DEV" });
    await caller.update({ id: 4, data: { description: "updated" } });
    await caller.pause({ id: 4 });
    await caller.resume({ id: 4, expectedAncestorOrgCode: "ROOT" });
    await caller.end({ id: 4 });
    await caller.transfer({
      id: 4,
      data: {
        newOrgCode: "ROOT_TWO",
        expectedAncestorOrgCode: "ROOT_TWO",
        newPosCode: "DEV",
        isPrimary: false,
      },
    });
    await caller.setPrimary({ id: 4 });
    await caller.clearPrimary({ id: 4 });
    let concealedLifecycle: unknown;
    try {
      await caller.pause({ id: 404 });
    }
    catch (error) {
      concealedLifecycle = error;
    }

    const scoped = expect.objectContaining({
      kind: "scoped",
      rootOrganizationIds: [10],
      organizationIds: [10, 11],
    });
    expect(searchEmploymentsFuzzyForAdmin).toHaveBeenCalledWith(query, scoped);
    expect(getEmploymentDetailByIdForAdmin).toHaveBeenCalledWith(4, scoped);
    expect(createEmployment).toHaveBeenCalledWith(
      expect.objectContaining({ username: "user", orgCode: "CHILD", posCode: "DEV" }),
      expect.objectContaining({ authorization: scoped }),
    );
    expect(updateEmployment).toHaveBeenCalledWith(
      4,
      { description: "updated" },
      expect.anything(),
      scoped,
    );
    expect(detail.allowedActions).toEqual({
      editDescription: { allowed: true, reason: null },
      pause: { allowed: true, reason: null },
      resume: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
      end: { allowed: true, reason: null },
      transfer: { allowed: true, reason: null },
      setPrimary: { allowed: true, reason: null },
      clearPrimary: { allowed: false, reason: "RESOURCE_STATE_NOT_ACTIONABLE" },
    });
    expect(concealedLifecycle).toBeInstanceOf(TRPCError);
    expect((concealedLifecycle as TRPCError).code).toBe("NOT_FOUND");
    expect(changeEmploymentAvailability).toHaveBeenNthCalledWith(1, {
      command: "pause",
      employmentId: 4,
    }, expect.anything());
    expect(changeEmploymentAvailability).toHaveBeenNthCalledWith(2, {
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "ROOT",
    }, expect.anything());
    expect(endEmployment).toHaveBeenCalledWith({ employmentId: 4 }, expect.anything());
    expect(transferEmployment).toHaveBeenCalledWith({
      employmentId: 4,
      newOrgCode: "ROOT_TWO",
      expectedAncestorOrgCode: "ROOT_TWO",
      newPosCode: "DEV",
      isPrimary: false,
      description: undefined,
    }, expect.objectContaining({
      authorization: scoped,
      auditContext: expect.anything(),
    }));
    expect(managePrimaryEmployment).toHaveBeenNthCalledWith(1, {
      command: "set",
      employmentId: 4,
    }, expect.anything());
    expect(managePrimaryEmployment).toHaveBeenNthCalledWith(2, {
      command: "clear",
      employmentId: 4,
    }, expect.anything());
    expect(guardEmploymentMutationForAdmin).not.toHaveBeenCalled();
    expect(resolveForActor).toHaveBeenCalledTimes(10);
    expect(authorizationLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.employment.pause",
        resourceType: "employment",
        resourceIdentifier: 404,
        reasonCode: "RESOURCE_OUT_OF_SCOPE",
      }),
      "admin mutation authorization denied",
    );
  });

  test("exposes an explicit End lifecycle command", async () => {
    const execute = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      changeEmploymentAvailability: { execute: mock(async () => ({ changed: true, result: null })) },
      createEmployment: { execute: mock(async () => ({ changed: true, result: { id: 10 } })) },
      endEmployment: { execute },
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
    } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("unused") as unknown as Context,
    });

    await expect(caller.end({ id: 4 })).resolves.toEqual({ changed: true, result: null });

    expect(execute).toHaveBeenCalledWith({ employmentId: 4 }, {
      authorization: expect.objectContaining({ kind: "full" }),
      auditContext: expect.objectContaining({ actorType: "admin", actorUserId: 1001 }),
    });
  });

  test("exposes explicit Pause and Resume lifecycle commands", async () => {
    const execute = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      changeEmploymentAvailability: { execute },
      createEmployment: { execute: mock(async () => ({ changed: true, result: { id: 10 } })) },
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
    } as any);
    const context = createRestContext("unused");
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: context as unknown as Context,
    });

    await expect(caller.pause({ id: 4 })).resolves.toEqual({ changed: true, result: null });
    await expect(caller.resume({
      id: 4,
      expectedAncestorOrgCode: "COMPANY",
    })).resolves.toEqual({ changed: true, result: null });

    expect(execute).toHaveBeenNthCalledWith(1, {
      command: "pause",
      employmentId: 4,
    }, {
      authorization: expect.objectContaining({ kind: "full" }),
      auditContext: expect.objectContaining({ actorType: "admin", actorUserId: 1001 }),
    });
    expect(execute).toHaveBeenNthCalledWith(2, {
      command: "resume",
      employmentId: 4,
      expectedAncestorOrgCode: "COMPANY",
    }, {
      authorization: expect.objectContaining({ kind: "full" }),
      auditContext: expect.objectContaining({ actorType: "admin", actorUserId: 1001 }),
    });
  });

  test("does not expose legacy status update or delete mutations", () => {
    const adapter = createEmploymentAdapter({
      changeEmploymentAvailability: { execute: mock(async () => ({ changed: true, result: null })) },
      createEmployment: { execute: mock(async () => ({ changed: true, result: { id: 10 } })) },
      endEmployment: { execute: mock(async () => ({ changed: true, result: null })) },
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
    } as any);
    const procedureNames = Object.keys(adapter.employmentAdminRouter._def.procedures);
    expect(procedureNames).not.toContain("updateStatus");
    expect(procedureNames).not.toContain("delete");
    expect((adapter as any).employmentsStatusUpdate).toBeUndefined();
    expect((adapter as any).employmentsDelete).toBeUndefined();
  });

  test("rejects lifecycle fields from the generic Employment edit contract", async () => {
    const updateEmployment = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      changeEmploymentAvailability: { execute: mock(async () => ({ changed: true, result: null })) },
      createEmployment: { execute: mock(async () => ({ changed: true, result: { id: 10 } })) },
      endEmployment: { execute: mock(async () => ({ changed: true, result: null })) },
      employmentService: { updateEmployment },
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
    } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("unused") as unknown as Context,
    });

    await expect(caller.update({
      id: 4,
      data: { startTime: new Date("2020-01-01T00:00:00.000Z") },
    } as any)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.update({
      id: 4,
      data: { isPrimary: true },
    } as any)).rejects.toBeInstanceOf(TRPCError);

    expect(updateEmployment).not.toHaveBeenCalled();
  });

  test("delegates creation to the Employment Lifecycle interface", async () => {
    const execute = mock(async () => ({ changed: true, result: { id: 10 } }));
    const adapter = createEmploymentAdapter({
      createEmployment: { execute },
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
    } as any);
    const context = createRestContext("unused");
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: context as unknown as Context,
    });

    await expect(caller.create({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
      isPrimary: false,
      startTime: new Date("2020-01-01T00:00:00.000Z"),
      endTime: new Date("2020-02-01T00:00:00.000Z"),
      status: 3,
    } as any)).resolves.toEqual({ changed: true, result: { id: 10 } });

    expect(execute).toHaveBeenCalledWith({
      username: "zhangsan",
      orgCode: "ORG",
      posCode: "DEV",
      isPrimary: false,
      description: undefined,
      expectedAncestorOrgCode: undefined,
    }, expect.objectContaining({
      auditContext: expect.objectContaining({
        actorType: "admin",
        actorUserId: 1001,
      }),
    }));
  });

  test("REST preserves its envelope around the unified create and lifecycle result", async () => {
    const adapter = createEmploymentAdapter({
      createEmployment: { execute: mock(async () => ({ changed: true, result: { id: 10 } })) },
      endEmployment: { execute: mock(async () => ({ changed: false, result: null })) },
    } as any);
    const context = createRestContext("unused");
    context.req.valid.mockImplementation(() => ({ username: "user", orgCode: "ORG", posCode: "DEV" }));
    await adapter.employmentsCreate(
      context as unknown as Parameters<typeof adapter.employmentsCreate>[0],
      async () => {},
    );
    expect(context.json).toHaveBeenLastCalledWith({
      code: 200,
      data: { changed: true, result: { id: 10 } },
      message: "success",
    }, 200);
    context.req.valid.mockImplementation(() => ({ id: 10 }));
    await adapter.employmentsEnd(context as unknown as Parameters<typeof adapter.employmentsEnd>[0], async () => {});
    expect(context.json).toHaveBeenLastCalledWith({
      code: 200,
      data: { changed: false, result: null },
      message: "success",
    }, 200);
  });

  test("rejects empty description input at the tRPC boundary", async () => {
    const updateEmployment = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({ employmentService: { updateEmployment } } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("unused") as unknown as Context,
    });
    let failure: unknown;
    try {
      await caller.update({ id: 4, data: {} });
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(TRPCError);
    expect((failure as TRPCError).code).toBe("BAD_REQUEST");
    expect(updateEmployment).not.toHaveBeenCalled();
  });

  test("delegates REST resignation to the independent use-case facade", async () => {
    const execute = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const context = createRestContext("zhangsan");

    await expect(adapter.employmentsResignUser(
      context as unknown as Parameters<typeof adapter.employmentsResignUser>[0],
      async () => {},
    )).resolves.toMatchObject({ code: 200 });

    expect(execute).toHaveBeenCalledWith(
      { username: "zhangsan" },
      { auditContext: expect.objectContaining({
        actorType: "admin",
        actorUserId: 1001,
        actorUsername: "admin",
        requestId: "req-1",
        traceId: "trace-1",
      }), authorization: expect.objectContaining({
        kind: "full",
        organizationIds: null,
      }) },
    );
    expect(context.json).toHaveBeenCalledWith({
      code: 200,
      data: { changed: true, result: null },
      message: "success",
    }, 200);
  });

  test("keeps the tRPC resignUser key, input, result, and normalized audit context", async () => {
    const execute = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const context = createRestContext("zhangsan");
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: context as unknown as Context,
    });

    const result = await caller.resignUser({ username: "zhangsan" });
    expect(result).toEqual({ changed: true, result: null });
    expect(execute).toHaveBeenCalledWith(
      { username: "zhangsan" },
      { auditContext: expect.objectContaining({
        actorType: "admin",
        actorUserId: 1001,
        requestId: "req-1",
        traceId: "trace-1",
      }), authorization: expect.objectContaining({
        kind: "full",
        organizationIds: null,
      }) },
    );
  });

  for (const committed of [true, false]) {
    test(`public resignation transports distinguish ${committed ? "confirmed commit" : "unknown failure"}`, async () => {
      const error = committed ? new AdminMutationCommittedError() : new Error("private transaction failure");
      const execute = mock(async () => {
        throw error;
      });
      const adapter = createEmploymentAdapter({ employmentService: {}, resignUser: { execute } } as any);
      const app = new Hono();
      addTestAdminAuthorizationMiddleware(app);
      app.onError(createErrorHandler({ error: mock(), warn: mock(), info: mock() }));
      app.route("/admin", createEmploymentRoute(adapter));
      const response = await app.request("/admin/employments/users/zhangsan/resign", { method: "POST" });
      const rest = await response.json();
      const serviceCode = committed ? ApiErrorCode.AdminMutationCommitted : ApiErrorCode.InternalError;
      expect(response.status).toBe(500);
      expect(rest).toMatchObject({ code: serviceCode });
      expect(rest).not.toHaveProperty("changed");
      expect(JSON.stringify(rest)).not.toContain("private transaction failure");

      const trpcResponse = await fetchRequestHandler({
        endpoint: "/trpc",
        req: new Request("http://localhost/trpc/resignUser", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "zhangsan" }),
        }),
        router: adapter.employmentAdminRouter,
        createContext: () => ({ hono: createRestContext("zhangsan") as unknown as Context }),
      });
      const trpc = await trpcResponse.json();
      expect(trpcResponse.status).toBe(500);
      expect(trpc).toMatchObject({ error: { data: {
        code: "INTERNAL_SERVER_ERROR",
        httpStatus: 500,
        serviceCode,
      } } });
      expect(trpc).not.toHaveProperty("result");
      expect(JSON.stringify(trpc)).not.toContain("private transaction failure");
      expect(execute).toHaveBeenCalledTimes(2);
    });
  }

  test("preserves no-op resignation results through REST and tRPC", async () => {
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: false, result: null })) },
    } as any);
    const context = createRestContext("zhangsan");
    const response = await adapter.employmentsResignUser(
      context as unknown as Parameters<typeof adapter.employmentsResignUser>[0],
      async () => {},
    );
    expect(response).toMatchObject({ code: 200, data: { changed: false, result: null } });
    const caller = adapter.employmentAdminRouter.createCaller({ hono: context as unknown as Context });
    const result = await caller.resignUser({ username: "zhangsan" });
    expect(result).toEqual({ changed: false, result: null });
  });

  test("passes request-time User authorization to an HR resignation direct call", async () => {
    const execute = mock(async () => ({ changed: true, result: null }));
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createHrContext(),
    });

    const result = await caller.resignUser({ username: "zhangsan" });

    expect(result).toEqual({ changed: true, result: null });
    expect(execute).toHaveBeenCalledWith(
      { username: "zhangsan" },
      expect.objectContaining({
        authorization: expect.objectContaining({
          kind: "scoped",
          organizationIds: [10, 11],
        }),
      }),
    );
  });

  test("preserves REST errors and normalizes tRPC user-not-found errors", async () => {
    const error = new UserNotFoundError("用户不存在");
    const execute = mock(async () => {
      throw error;
    });
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute },
    } as any);
    const restContext = createRestContext("missing");

    await expect(adapter.employmentsResignUser(
      restContext as unknown as Parameters<typeof adapter.employmentsResignUser>[0],
      async () => {},
    )).rejects.toBe(error);

    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("missing") as unknown as Context,
    });
    try {
      await caller.resignUser({ username: "missing" });
      throw new Error("expected tRPC resignation to fail");
    }
    catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("NOT_FOUND");
      expect((err as TRPCError).message).toBe("用户不存在");
    }
  });

  test.each([true, false])("exposes Set and Clear Primary outcomes through both protocols: changed=%s", async (changed) => {
    const outcome = { changed, result: null };
    const execute = mock(async () => outcome);
    const adapter = createEmploymentAdapter({
      employmentService: {},
      managePrimaryEmployment: { execute },
    } as any);
    const context = createRestContext("unused");
    context.req.valid.mockImplementation(() => ({ id: 4 }));
    const caller = adapter.employmentAdminRouter.createCaller({ hono: context as unknown as Context });
    for (const handler of [adapter.employmentsSetPrimary, adapter.employmentsClearPrimary]) {
      const response = await handler(context as unknown as Parameters<typeof handler>[0], async () => {});
      expect(response).toMatchObject({ code: 200, data: outcome });
    }
    const set = await caller.setPrimary({ id: 4 });
    const clear = await caller.clearPrimary({ id: 4 });
    expect(set).toEqual(outcome);
    expect(clear).toEqual(outcome);
  });

  test("delegates Transfer with an explicit Primary choice to the lifecycle interface", async () => {
    const execute = mock(async () => ({ changed: true, result: { id: 10 } }));
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
      transferEmployment: { execute },
    } as any);
    const context = createRestContext("unused");
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: context as unknown as Context,
    });

    const outcome = await caller.transfer({
      id: 4,
      data: {
        newOrgCode: "TARGET_ORG",
        expectedAncestorOrgCode: "COMPANY",
        newPosCode: "TARGET_POS",
        isPrimary: false,
        description: null,
      },
    });
    expect(outcome).toEqual({ changed: true, result: { id: 10 } });
    context.req.valid.mockImplementation((target: string) => target === "param" ? { id: 4 } : { newOrgCode: "TARGET_ORG", newPosCode: "TARGET_POS", isPrimary: false });
    const rest = await adapter.employmentsTransfer(
      context as unknown as Parameters<typeof adapter.employmentsTransfer>[0],
      async () => {},
    );
    expect(rest).toMatchObject({ code: 200, data: outcome });

    expect(execute).toHaveBeenCalledWith({
      employmentId: 4,
      newOrgCode: "TARGET_ORG",
      expectedAncestorOrgCode: "COMPANY",
      newPosCode: "TARGET_POS",
      isPrimary: false,
      description: null,
    }, expect.objectContaining({
      authorization: expect.objectContaining({
        kind: "full",
        organizationIds: null,
      }),
      auditContext: expect.objectContaining({ actorType: "admin", actorUserId: 1001 }),
    }));
  });

  test.each([
    [new EmploymentNotFoundError(), "NOT_FOUND"],
    [new EmploymentNotEditableError(), "CONFLICT"],
    [new EmploymentAlreadyExistsError(), "CONFLICT"],
  ] as const)("preserves lifecycle failure semantics across Primary and Transfer", async (error, code) => {
    const execute = mock(async () => {
      throw error;
    });
    const adapter = createEmploymentAdapter({
      employmentService: {},
      managePrimaryEmployment: { execute },
      transferEmployment: { execute },
    } as any);
    const context = createRestContext("unused");
    context.req.valid.mockImplementation((target: string) => target === "param"
      ? { id: 4 }
      : { newOrgCode: "ORG", newPosCode: "POS", isPrimary: false });
    const caller = adapter.employmentAdminRouter.createCaller({ hono: context as unknown as Context });
    for (const run of [
      () => caller.setPrimary({ id: 4 }),
      () => caller.clearPrimary({ id: 4 }),
      () => caller.transfer({ id: 4, data: { newOrgCode: "ORG", newPosCode: "POS", isPrimary: false } }),
    ]) {
      const failure = await run().catch((cause: unknown) => cause);
      expect(failure).toBeInstanceOf(TRPCError);
      expect(failure).toMatchObject({ code });
    }
    for (const handler of [
      adapter.employmentsSetPrimary,
      adapter.employmentsClearPrimary,
      adapter.employmentsTransfer,
    ]) {
      let failure: unknown;
      try {
        await handler(
          context as unknown as Parameters<typeof handler>[0],
          async () => {},
        );
      }
      catch (cause) {
        failure = cause;
      }
      expect(failure).toBe(error);
    }
  });

  test("rejects Transfer without an explicit Primary choice or with legacy lifecycle fields", async () => {
    const execute = mock(async () => ({ changed: true, result: { id: 10 } }));
    const adapter = createEmploymentAdapter({
      employmentService: {},
      resignUser: { execute: mock(async () => ({ changed: true, result: null })) },
      transferEmployment: { execute },
    } as any);
    const caller = adapter.employmentAdminRouter.createCaller({
      hono: createRestContext("unused") as unknown as Context,
    });

    await expect(caller.transfer({
      id: 4,
      data: {
        newOrgCode: "TARGET_ORG",
        newPosCode: "TARGET_POS",
      },
    } as any)).rejects.toBeInstanceOf(TRPCError);
    await expect(caller.transfer({
      id: 4,
      data: {
        newOrgCode: "TARGET_ORG",
        newPosCode: "TARGET_POS",
        isPrimary: false,
        inheritPrimary: true,
        startTime: new Date("2020-01-01T00:00:00.000Z"),
        endTime: null,
        status: 1,
      },
    } as any)).rejects.toBeInstanceOf(TRPCError);

    expect(execute).not.toHaveBeenCalled();
  });
});
