import type {
  CreateSessionManagementAdapterDeps,
  SessionManagementAdapter,
} from "@admin-api/routes/admin/session-management/session-management.adapter";
import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { Context } from "hono";
import { createSessionManagementAdapter } from "@admin-api/routes/admin/session-management/session-management.adapter";
import {
  SessionManagementListLoginRestrictionsInputSchema,
  SessionManagementListSessionsInputSchema,
  SessionManagementReleaseLoginRestrictionInputSchema,
  SessionManagementRevokeSessionsInputSchema,
} from "@admin-api/routes/admin/session-management/session-management.schema";
import {
  AdminLoginStateAuditFailedAfterEffectError,
  AdminLoginStateAuditFailedError,
  AdminLoginStateUnavailableError,
  AdminSessionCurrentProtectedError,
} from "@admin-api/services/session-management/session-management.error";
import { createSessionManagementService } from "@admin-api/services/session-management/session-management.service";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { getApiRuntimeErrorFormatterData } from "@iam/api-core/trpc";
import { TRPCError } from "@trpc/server";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";
import { getTestAdminAuthorizationValue } from "../helpers/admin-authorization";

function sessionListResult() {
  return {
    result: [{
      principalSessionId: "ps-42",
      user: {
        id: 42,
        subjectId: "00000000-0000-4000-8000-000000000042",
        username: "alice",
        name: "Alice",
        accountStatus: "normal" as const,
      },
      authMethods: ["password" as const],
      authTime: 1_753_689_600_000,
      expiresAt: 1_753_776_000_000,
      origin: {
        ip: "203.0.113.42",
        deviceType: "desktop" as const,
        operatingSystem: "windows" as const,
        browser: "edge" as const,
      },
      isCurrentSession: true,
      isCurrentUser: true,
      lastActiveAt: 1_753_700_000_000,
      userAgent: "must-not-leave-adapter",
    }],
    total: 1,
    pageNum: 1,
    pageSize: 20,
    pages: 1,
  };
}

const unusedRevokeSessions = mock(async () => ({
  changed: false,
  scope: "session" as const,
  revoked: {
    principalSessions: 0,
    bindings: 0,
    credentials: 0,
    artifacts: 0,
  },
  currentPrincipalSessionExcluded: false,
  cleanup: {
    attempted: 0,
    succeeded: 0,
    failed: 0,
  },
}));

const unusedListLoginRestrictions = mock(async () => ({
  result: [],
  total: 0,
  pageNum: 1,
  pageSize: 20,
  pages: 0,
}));

const unusedReleaseLoginRestriction = mock(async () => ({
  changed: false,
  failureStateCleared: true as const,
}));

function createContext(
  json: unknown,
  options: {
    method?: string;
    params?: unknown;
    path?: string;
  } = {},
) {
  return {
    get: mock((key: string) => {
      if (key === "userDetailDto")
        return { name: "Root Admin", roles: ["iam:admin"] };
      const authorizationValue = getTestAdminAuthorizationValue(key);
      if (authorizationValue !== undefined)
        return authorizationValue;
      if (key === "userId")
        return 7;
      if (key === "username")
        return "root";
      if (key === "principalSessionId")
        return "ps-admin";
      if (key === "requestId")
        return "req-adapter";
      return undefined;
    }),
    req: {
      header: mock((name: string) => {
        if (name.toLowerCase() === "user-agent")
          return "actor-browser";
        if (name.toLowerCase() === "x-forwarded-for")
          return "203.0.113.7";
        return undefined;
      }),
      method: options.method ?? "POST",
      path: options.path ?? "/admin/session-management/sessions/revoke",
      valid: mock((target: string) => {
        if (target === "json")
          return json;
        if (target === "param")
          return options.params;
        return undefined;
      }),
    },
    json: mock((body: unknown) => body),
  } as unknown as Context & {
    get: ReturnType<typeof mock>;
    req: { valid: ReturnType<typeof mock> };
    json: ReturnType<typeof mock>;
  };
}

interface MutationTransportMappingCase {
  name: string;
  error: Error;
  serviceCode: string;
  serviceMessage: string;
  httpStatus: number;
  forbiddenPublicDetails?: RegExp;
}

interface RevokeTransportMappingCase extends MutationTransportMappingCase {
  principalSessionId: string;
  trpcCode: TRPCError["code"];
}

type LoginRestrictionReleaseTransportMappingCase
  = MutationTransportMappingCase;

type SessionManagementTestContext = ReturnType<typeof createContext>;
type SessionManagementCaller = ReturnType<
  SessionManagementAdapter["sessionManagementAdminRouter"]["createCaller"]
>;

interface MutationTransportOperation<TInput> {
  method: "DELETE" | "POST";
  path: string;
  input: TInput;
  trpcCode: TRPCError["code"];
  createContext: (input: TInput) => SessionManagementTestContext;
  createService: (
    mutation: () => Promise<never>,
  ) => CreateSessionManagementAdapterDeps["sessionManagementService"];
  invokeRest: (
    adapter: SessionManagementAdapter,
    context: SessionManagementTestContext,
  ) => unknown;
  invokeTrpc: (
    caller: SessionManagementCaller,
    input: TInput,
  ) => unknown;
}

async function assertMutationTransportMapping<TInput>(
  mapping: MutationTransportMappingCase,
  operation: MutationTransportOperation<TInput>,
) {
  const mutation = mock(async () => {
    throw mapping.error;
  });
  const adapter = createSessionManagementAdapter({
    sessionManagementService: operation.createService(mutation),
  });
  const context = operation.createContext(operation.input);
  const appLogger = {
    bindings: () => ({ sourceApp: "iam-admin-api-test" }),
    error: mock(() => undefined),
    info: mock(() => undefined),
    warn: mock(() => undefined),
  };
  const app = new Hono();
  app.onError(createErrorHandler(appLogger as never));
  app.on(operation.method, operation.path, async (c) => {
    await operation.invokeRest(adapter, context);
    return c.body(null, 204);
  });

  const restResponse = await app.request(`http://localhost${operation.path}`, {
    method: operation.method,
  });
  const restBody = await restResponse.json();
  expect(restResponse.status).toBe(mapping.httpStatus);
  expect(restBody).toEqual({
    code: mapping.serviceCode,
    data: null,
    message: mapping.serviceMessage,
  });

  let caught: unknown;
  try {
    const caller = adapter.sessionManagementAdminRouter.createCaller({
      hono: context,
    });
    await operation.invokeTrpc(caller, operation.input);
  }
  catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TRPCError);
  const trpcError = caught as TRPCError;
  expect(trpcError.code).toBe(operation.trpcCode);
  const formatterData = getApiRuntimeErrorFormatterData(trpcError.cause);
  expect(formatterData).toEqual({
    serviceCode: mapping.serviceCode,
    serviceMessage: mapping.serviceMessage,
    httpStatus: mapping.httpStatus,
  });
  expect(mutation).toHaveBeenCalledTimes(2);

  if (mapping.forbiddenPublicDetails) {
    expect(JSON.stringify({
      restBody,
      trpc: {
        code: trpcError.code,
        message: trpcError.message,
        stack: trpcError.stack,
        formatterData,
      },
    })).not.toMatch(mapping.forbiddenPublicDetails);
  }
}

async function assertRevokeTransportMapping(mapping: RevokeTransportMappingCase) {
  const input = {
    target: {
      type: "session" as const,
      principalSessionId: mapping.principalSessionId,
    },
  };
  await assertMutationTransportMapping(mapping, {
    method: "POST",
    path: "/admin/session-management/sessions/revoke",
    input,
    trpcCode: mapping.trpcCode,
    createContext: value => createContext(value),
    createService: revokeSessions => ({
      listLoginRestrictions: unusedListLoginRestrictions,
      listSessions: mock(async () => sessionListResult()),
      releaseLoginRestriction: unusedReleaseLoginRestriction,
      revokeSessions,
    }),
    invokeRest: (adapter, context) =>
      adapter.sessionsRevoke(context as never, async () => {}),
    invokeTrpc: (caller, value) => caller.revokeSessions(value),
  });
}

async function assertLoginRestrictionReleaseTransportMapping(
  mapping: LoginRestrictionReleaseTransportMappingCase,
) {
  const input = { userId: 42 };
  await assertMutationTransportMapping(mapping, {
    method: "DELETE",
    path: "/admin/session-management/login-restrictions/42",
    input,
    trpcCode: "INTERNAL_SERVER_ERROR",
    createContext: value => createContext(undefined, {
      method: "DELETE",
      params: value,
      path: "/admin/session-management/login-restrictions/42",
    }),
    createService: releaseLoginRestriction => ({
      listLoginRestrictions: unusedListLoginRestrictions,
      listSessions: mock(async () => sessionListResult()),
      releaseLoginRestriction,
      revokeSessions: unusedRevokeSessions,
    }),
    invokeRest: (adapter, context) =>
      adapter.loginRestrictionRelease(context as never, async () => {}),
    invokeTrpc: (caller, value) =>
      caller.releaseLoginRestriction(value),
  });
}

describe("admin session management adapter", () => {
  test("shares the session revoke mutation, server actor, audit context, and safe VO across REST and tRPC", async () => {
    const revokeSessions = mock(async () => ({
      changed: true,
      scope: "session" as const,
      revoked: {
        principalSessions: 1,
        bindings: 2,
        credentials: 3,
        artifacts: 4,
      },
      currentPrincipalSessionExcluded: false,
      cleanup: {
        attempted: 2,
        succeeded: 1,
        failed: 1,
        failures: [{
          ref: "must-not-leave-adapter",
          error: "must-not-leave-adapter",
        }],
      },
      principalSessionId: "must-not-leave-adapter",
      metadata: { secret: true },
    }));
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: unusedListLoginRestrictions,
        listSessions: mock(async () => sessionListResult()),
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions,
      },
    });
    const input = {
      target: {
        type: "session" as const,
        principalSessionId: "ps-target",
      },
    };
    const context = createContext(input);

    const restResult = await adapter.sessionsRevoke(context as never, async () => {});
    const trpcResult = await adapter.sessionManagementAdminRouter
      .createCaller({ hono: context })
      .revokeSessions(input);

    const expectedAuditContext = {
      actorType: "admin",
      actorUserId: 7,
      actorName: "Root Admin",
      actorUsername: "root",
      actorClientCode: null,
      actorSystemKey: null,
      sourceApp: "iam-admin",
      requestId: "req-adapter",
      traceId: null,
      ip: "203.0.113.7",
      userAgent: "actor-browser",
      route: "/admin/session-management/sessions/revoke",
      method: "POST",
      principalSessionId: "ps-admin",
    };
    expect(revokeSessions).toHaveBeenNthCalledWith(
      1,
      input,
      { actorUserId: 7, principalSessionId: "ps-admin" },
      expectedAuditContext,
    );
    expect(revokeSessions).toHaveBeenNthCalledWith(
      2,
      input,
      { actorUserId: 7, principalSessionId: "ps-admin" },
      expectedAuditContext,
    );
    expect(restResult).toMatchObject({ code: 200, data: trpcResult });
    expect(trpcResult).toEqual({
      changed: true,
      scope: "session",
      revoked: {
        principalSessions: 1,
        bindings: 2,
        credentials: 3,
        artifacts: 4,
      },
      currentPrincipalSessionExcluded: false,
      cleanup: {
        attempted: 2,
        succeeded: 1,
        failed: 1,
      },
    });
    expect(JSON.stringify(trpcResult)).not.toContain("must-not-leave-adapter");
  });

  test("shares a strict user revoke target while keeping the self exception server-owned", async () => {
    const revokeSessions = mock(async () => ({
      changed: true,
      scope: "user" as const,
      revoked: {
        principalSessions: 1,
        bindings: 2,
        credentials: 3,
        artifacts: 4,
      },
      currentPrincipalSessionExcluded: true,
      cleanup: {
        attempted: 2,
        succeeded: 1,
        failed: 1,
        failures: [{
          ref: "must-not-leave-adapter",
          error: "must-not-leave-adapter",
        }],
      },
      exceptPrincipalSessionId: "must-not-leave-adapter",
    }));
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: unusedListLoginRestrictions,
        listSessions: mock(async () => sessionListResult()),
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions,
      },
    });
    const input = {
      target: {
        type: "user" as const,
        userId: 7,
      },
    };
    const context = createContext(input);

    const restResult = await adapter.sessionsRevoke(context as never, async () => {});
    const trpcResult = await adapter.sessionManagementAdminRouter
      .createCaller({ hono: context })
      .revokeSessions(input);

    expect(revokeSessions).toHaveBeenNthCalledWith(
      1,
      input,
      { actorUserId: 7, principalSessionId: "ps-admin" },
      expect.objectContaining({
        actorUserId: 7,
        principalSessionId: "ps-admin",
      }),
    );
    expect(revokeSessions).toHaveBeenNthCalledWith(
      2,
      input,
      { actorUserId: 7, principalSessionId: "ps-admin" },
      expect.objectContaining({
        actorUserId: 7,
        principalSessionId: "ps-admin",
      }),
    );
    expect(restResult).toMatchObject({ code: 200, data: trpcResult });
    expect(trpcResult).toEqual({
      changed: true,
      scope: "user",
      revoked: {
        principalSessions: 1,
        bindings: 2,
        credentials: 3,
        artifacts: 4,
      },
      currentPrincipalSessionExcluded: true,
      cleanup: {
        attempted: 2,
        succeeded: 1,
        failed: 1,
      },
    });
    expect(JSON.stringify(trpcResult)).not.toContain("must-not-leave-adapter");
  });

  test("shares server-owned actor context and a whitelisted VO across REST and tRPC", async () => {
    const listSessions = mock(async () => sessionListResult());
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: unusedListLoginRestrictions,
        listSessions,
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions: unusedRevokeSessions,
      },
    });
    const input = {
      conditions: { userId: 42 },
      pageNum: 1,
      pageSize: 20,
    };
    const context = createContext(input);

    const restResult = await adapter.sessionsSearch(context as never, async () => {});
    const trpcResult = await adapter.sessionManagementAdminRouter
      .createCaller({ hono: context })
      .listSessions(input);

    expect(listSessions).toHaveBeenNthCalledWith(
      1,
      { pageNum: 1, pageSize: 20, userId: 42 },
      { actorUserId: 7, principalSessionId: "ps-admin" },
    );
    expect(listSessions).toHaveBeenNthCalledWith(
      2,
      { pageNum: 1, pageSize: 20, userId: 42 },
      { actorUserId: 7, principalSessionId: "ps-admin" },
    );
    expect(restResult).toMatchObject({ code: 200, data: trpcResult });
    expect(trpcResult.result[0]).toEqual({
      principalSessionId: "ps-42",
      user: {
        id: 42,
        subjectId: "00000000-0000-4000-8000-000000000042",
        username: "alice",
        name: "Alice",
        accountStatus: "normal",
      },
      authMethods: ["password"],
      authTime: 1_753_689_600_000,
      expiresAt: 1_753_776_000_000,
      origin: {
        ip: "203.0.113.42",
        deviceType: "desktop",
        operatingSystem: "windows",
        browser: "edge",
      },
      isCurrentSession: true,
      isCurrentUser: true,
    });
    expect(JSON.stringify(trpcResult)).not.toContain("lastActiveAt");
    expect(JSON.stringify(trpcResult)).not.toContain("userAgent");
  });

  test("shares the Temporary Login Restriction list and safe VO across REST and tRPC", async () => {
    const listLoginRestrictions = mock(async () => ({
      result: [{
        user: {
          id: 42,
          username: "alice",
          name: "Alice",
          accountStatus: "normal" as const,
        },
        cause: "too_many_login_failures" as const,
        triggerMethod: "password" as const,
        restrictedUntil: 1_753_776_000_000,
        remainingSeconds: 1_799,
        rawRestrictionValue: "must-not-leave-adapter",
      }],
      total: 1,
      pageNum: 1,
      pageSize: 20,
      pages: 1,
    }));
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions,
        listSessions: mock(async () => sessionListResult()),
        releaseLoginRestriction: mock(async () => ({
          changed: false,
          failureStateCleared: true as const,
        })),
        revokeSessions: unusedRevokeSessions,
      },
    });
    const input = {
      conditions: { userId: 42 },
      pageNum: 1,
      pageSize: 20,
    };
    const context = createContext(input);

    const restResult = await adapter.loginRestrictionsSearch(
      context as never,
      async () => {},
    );
    const trpcResult = await adapter.sessionManagementAdminRouter
      .createCaller({ hono: context })
      .listLoginRestrictions(input);

    expect(listLoginRestrictions).toHaveBeenNthCalledWith(1, {
      pageNum: 1,
      pageSize: 20,
      userId: 42,
    });
    expect(listLoginRestrictions).toHaveBeenNthCalledWith(2, {
      pageNum: 1,
      pageSize: 20,
      userId: 42,
    });
    expect(restResult).toMatchObject({ code: 200, data: trpcResult });
    expect(trpcResult.result[0]).toEqual({
      user: {
        id: 42,
        username: "alice",
        name: "Alice",
        accountStatus: "normal",
      },
      cause: "too_many_login_failures",
      triggerMethod: "password",
      restrictedUntil: 1_753_776_000_000,
      remainingSeconds: 1_799,
    });
    expect(JSON.stringify(trpcResult)).not.toContain("rawRestrictionValue");
  });

  test("shares the login restriction release mutation and server audit context across REST and tRPC", async () => {
    const releaseLoginRestriction = mock(async () => ({
      changed: true,
      failureStateCleared: true as const,
      restriction: "must-not-leave-adapter",
    }));
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: mock(async () => ({
          result: [],
          total: 0,
          pageNum: 1,
          pageSize: 20,
          pages: 0,
        })),
        listSessions: mock(async () => sessionListResult()),
        releaseLoginRestriction,
        revokeSessions: unusedRevokeSessions,
      },
    });
    const input = { userId: 42 };
    const context = createContext(undefined, {
      method: "DELETE",
      params: input,
      path: "/admin/session-management/login-restrictions/42",
    });

    const restResult = await adapter.loginRestrictionRelease(
      context as never,
      async () => {},
    );
    const trpcResult = await adapter.sessionManagementAdminRouter
      .createCaller({ hono: context })
      .releaseLoginRestriction(input);

    const expectedAuditContext = {
      actorType: "admin",
      actorUserId: 7,
      actorName: "Root Admin",
      actorUsername: "root",
      actorClientCode: null,
      actorSystemKey: null,
      sourceApp: "iam-admin",
      requestId: "req-adapter",
      traceId: null,
      ip: "203.0.113.7",
      userAgent: "actor-browser",
      route: "/admin/session-management/login-restrictions/42",
      method: "DELETE",
      principalSessionId: "ps-admin",
    };
    expect(releaseLoginRestriction).toHaveBeenNthCalledWith(
      1,
      input,
      expectedAuditContext,
    );
    expect(releaseLoginRestriction).toHaveBeenNthCalledWith(
      2,
      input,
      expectedAuditContext,
    );
    expect(restResult).toMatchObject({ code: 200, data: trpcResult });
    expect(trpcResult).toEqual({
      changed: true,
      failureStateCleared: true,
    });
    expect(JSON.stringify(trpcResult)).not.toContain("must-not-leave-adapter");
  });

  test("defaults pagination and rejects client actor fields, string filters, and oversized pages", () => {
    expect(SessionManagementListSessionsInputSchema.parse({})).toEqual({
      conditions: {},
      pageNum: 1,
      pageSize: 20,
    });
    expect(SessionManagementListSessionsInputSchema.safeParse({
      actorUserId: 999,
      conditions: {},
    }).success).toBe(false);
    expect(SessionManagementListSessionsInputSchema.safeParse({
      conditions: { userId: "42" },
    }).success).toBe(false);
    expect(SessionManagementListSessionsInputSchema.safeParse({
      conditions: {},
      pageSize: 101,
    }).success).toBe(false);
  });

  test("keeps login restriction pagination and release inputs strict and server-owned", () => {
    expect(SessionManagementListLoginRestrictionsInputSchema.parse({})).toEqual({
      conditions: {},
      pageNum: 1,
      pageSize: 20,
    });
    expect(SessionManagementListLoginRestrictionsInputSchema.safeParse({
      actorUserId: 999,
      conditions: {},
    }).success).toBe(false);
    expect(SessionManagementListLoginRestrictionsInputSchema.safeParse({
      conditions: { userId: "42" },
    }).success).toBe(false);
    expect(SessionManagementListLoginRestrictionsInputSchema.safeParse({
      conditions: {},
      pageSize: 101,
    }).success).toBe(false);
    expect(SessionManagementReleaseLoginRestrictionInputSchema.parse({
      userId: 42,
    })).toEqual({ userId: 42 });
    expect(SessionManagementReleaseLoginRestrictionInputSchema.safeParse({
      userId: "42",
    }).success).toBe(false);
    expect(SessionManagementReleaseLoginRestrictionInputSchema.safeParse({
      userId: 42,
      actorUserId: 999,
    }).success).toBe(false);
  });

  test("accepts only strict session or user targets without a client-owned self exception", () => {
    expect(SessionManagementRevokeSessionsInputSchema.parse({
      target: {
        type: "session",
        principalSessionId: "ps-target",
      },
    })).toEqual({
      target: {
        type: "session",
        principalSessionId: "ps-target",
      },
    });
    expect(SessionManagementRevokeSessionsInputSchema.parse({
      target: {
        type: "user",
        userId: 42,
      },
    })).toEqual({
      target: {
        type: "user",
        userId: 42,
      },
    });
    expect(SessionManagementRevokeSessionsInputSchema.safeParse({
      target: {
        type: "session",
        principalSessionId: "ps-target",
      },
      actorUserId: 999,
      principalSessionId: "ps-attacker",
    }).success).toBe(false);
    expect(SessionManagementRevokeSessionsInputSchema.safeParse({
      target: {
        type: "user",
        userId: 42,
        exceptPrincipalSessionId: "ps-attacker",
      },
    }).success).toBe(false);
    expect(SessionManagementRevokeSessionsInputSchema.safeParse({
      target: {
        type: "user",
        userId: "42",
      },
    }).success).toBe(false);
    expect(SessionManagementRevokeSessionsInputSchema.safeParse({
      target: {
        type: "user",
        userId: 42,
        principalSessionId: "ps-attacker",
      },
    }).success).toBe(false);
  });

  test("preserves the unavailable state error for REST and tRPC transport mapping", async () => {
    const unavailable = new AdminLoginStateUnavailableError(new Error("redis unavailable"));
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: unusedListLoginRestrictions,
        listSessions: mock(async () => {
          throw unavailable;
        }),
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions: unusedRevokeSessions,
      },
    });
    const context = createContext({});

    await expect(adapter.sessionsSearch(context as never, async () => {})).rejects.toBe(unavailable);

    try {
      await adapter.sessionManagementAdminRouter
        .createCaller({ hono: context })
        .listSessions({});
      throw new Error("expected tRPC session list to fail");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect(getApiRuntimeErrorFormatterData((error as TRPCError).cause)).toEqual({
        serviceCode: "ADMIN_LOGIN_STATE_UNAVAILABLE",
        serviceMessage: "登录状态服务暂时不可用",
        httpStatus: 503,
      });
    }
  });

  test("preserves an unavailable restriction inventory error for REST and tRPC", async () => {
    const unavailable = new AdminLoginStateUnavailableError(
      new Error("redis restriction inventory unavailable"),
    );
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: mock(async () => {
          throw unavailable;
        }),
        listSessions: mock(async () => sessionListResult()),
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions: unusedRevokeSessions,
      },
    });
    const context = createContext({});

    await expect(
      adapter.loginRestrictionsSearch(context as never, async () => {}),
    ).rejects.toBe(unavailable);

    try {
      await adapter.sessionManagementAdminRouter
        .createCaller({ hono: context })
        .listLoginRestrictions({});
      throw new Error("expected tRPC restriction list to fail");
    }
    catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect(getApiRuntimeErrorFormatterData((error as TRPCError).cause)).toEqual({
        serviceCode: "ADMIN_LOGIN_STATE_UNAVAILABLE",
        serviceMessage: "登录状态服务暂时不可用",
        httpStatus: 503,
      });
    }
  });

  test.each<RevokeTransportMappingCase>([
    {
      name: "current-session protection",
      error: new AdminSessionCurrentProtectedError(),
      principalSessionId: "ps-admin",
      trpcCode: "CONFLICT",
      serviceCode: "ADMIN_SESSION_CURRENT_PROTECTED",
      serviceMessage: "当前管理会话不能被强制下线",
      httpStatus: 409,
    },
    {
      name: "unavailable session control",
      error: new AdminLoginStateUnavailableError(
        new Error("redis://secret-control-provider unavailable"),
      ),
      principalSessionId: "ps-target",
      trpcCode: "INTERNAL_SERVER_ERROR",
      serviceCode: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      serviceMessage: "登录状态服务暂时不可用",
      httpStatus: 503,
      forbiddenPublicDetails: /redis:\/\/secret-control-provider/,
    },
    {
      name: "audit failure after an effective revoke",
      error: new AdminLoginStateAuditFailedAfterEffectError(
        new Error("postgres://secret-audit-provider after-effect insert failed"),
      ),
      principalSessionId: "ps-target",
      trpcCode: "INTERNAL_SERVER_ERROR",
      serviceCode: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
      serviceMessage: "登录状态已变更，但审计记录失败；请刷新确认且不要自动重试",
      httpStatus: 500,
      forbiddenPublicDetails: /postgres:\/\/secret-audit-provider/,
    },
    {
      name: "protected-session audit failure before control",
      error: new AdminLoginStateAuditFailedError(Object.assign(
        new Error("postgres://protected-audit secret SQL insert failed"),
        {
          serviceCode: "AUDIT_PROVIDER_FAILURE",
          serviceDetails: { table: "audit_log" },
          stack: "protected-provider-stack-secret",
        },
      )),
      principalSessionId: "ps-admin",
      trpcCode: "INTERNAL_SERVER_ERROR",
      serviceCode: "COMMON.INTERNAL_ERROR",
      serviceMessage: "服务器内部错误",
      httpStatus: 500,
      forbiddenPublicDetails:
        /postgres:\/\/protected-audit|secret SQL|AUDIT_PROVIDER_FAILURE|serviceDetails|audit_log|protected-provider-stack-secret/,
    },
    {
      name: "no-effect audit failure after control",
      error: new AdminLoginStateAuditFailedError(Object.assign(
        new Error("postgres://noop-audit secret SQL insert failed"),
        {
          serviceCode: "AUDIT_PROVIDER_FAILURE",
          serviceDetails: { table: "audit_log" },
          stack: "noop-provider-stack-secret",
        },
      )),
      principalSessionId: "ps-inactive",
      trpcCode: "INTERNAL_SERVER_ERROR",
      serviceCode: "COMMON.INTERNAL_ERROR",
      serviceMessage: "服务器内部错误",
      httpStatus: 500,
      forbiddenPublicDetails:
        /postgres:\/\/noop-audit|secret SQL|AUDIT_PROVIDER_FAILURE|serviceDetails|audit_log|noop-provider-stack-secret/,
    },
  ])("maps $name consistently for REST and tRPC", async (mapping) => {
    await assertRevokeTransportMapping(mapping);
  });

  test.each<LoginRestrictionReleaseTransportMappingCase>([
    {
      name: "unavailable restriction state",
      error: new AdminLoginStateUnavailableError(
        new Error("redis://secret-restriction-provider unavailable"),
      ),
      serviceCode: "ADMIN_LOGIN_STATE_UNAVAILABLE",
      serviceMessage: "登录状态服务暂时不可用",
      httpStatus: 503,
      forbiddenPublicDetails: /redis:\/\/secret-restriction-provider/,
    },
    {
      name: "audit failure after an effective restriction release",
      error: new AdminLoginStateAuditFailedAfterEffectError(
        new Error("postgres://secret-release-audit after-effect insert failed"),
      ),
      serviceCode: "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
      serviceMessage: "登录状态已变更，但审计记录失败；请刷新确认且不要自动重试",
      httpStatus: 500,
      forbiddenPublicDetails: /postgres:\/\/secret-release-audit/,
    },
    {
      name: "no-effect restriction release audit failure",
      error: new AdminLoginStateAuditFailedError(
        new Error("postgres://secret-noop-release-audit insert failed"),
      ),
      serviceCode: "COMMON.INTERNAL_ERROR",
      serviceMessage: "服务器内部错误",
      httpStatus: 500,
      forbiddenPublicDetails: /postgres:\/\/secret-noop-release-audit/,
    },
  ])("maps $name consistently for REST and tRPC", async (mapping) => {
    await assertLoginRestrictionReleaseTransportMapping(mapping);
  });

  test("fails closed at authorization when the authenticated server context is absent", async () => {
    const listSessions = mock(async () => sessionListResult());
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: unusedListLoginRestrictions,
        listSessions,
        releaseLoginRestriction: unusedReleaseLoginRestriction,
        revokeSessions: unusedRevokeSessions,
      },
    });
    const context = createContext({});
    context.get.mockImplementation(() => undefined);

    await expect(adapter.sessionsSearch(context as never, async () => {})).rejects.toMatchObject({
      code: "AUTH.FORBIDDEN",
      httpStatus: 403,
    });
    expect(listSessions).not.toHaveBeenCalled();
  });

  test("audits and rejects self user revocation when the authenticated actor has no current-session ID", async () => {
    const auditWrites: AuditLogInput[] = [];
    const recordAuditLog = mock(async (input: AuditLogInput) => {
      auditWrites.push(input);
    });
    const revokePrincipalSession = mock(async () => {
      throw new Error("single-session control must not run");
    });
    const revokeUserSessions = mock(async () => {
      throw new Error("user control must not run");
    });
    const service = createSessionManagementService({
      audit: { recordAuditLog },
      control: { revokePrincipalSession },
      inventory: {
        listPrincipalSessions: mock(async () => ({ items: [], total: 0 })),
      },
      loginRestrictions: {
        listRestrictions: mock(async () => ({ items: [], total: 0 })),
        clearLoginState: mock(async () => ({
          changed: false,
          failureStateCleared: true as const,
          restriction: null,
        })),
      },
      logger: { error: mock(() => undefined) },
      userControl: { revokeUserSessions },
      users: {
        getSessionManagementUserSummaries: mock(async () => []),
        getSessionManagementUserSummariesBySubjectIdentifiers: mock(async () => []),
      },
    });
    const adapter = createSessionManagementAdapter({
      sessionManagementService: {
        listLoginRestrictions: service.listLoginRestrictions,
        listSessions: service.listSessions,
        releaseLoginRestriction: service.releaseLoginRestriction,
        revokeSessions: service.revokeSessions,
      },
    });
    const input = {
      target: {
        type: "user" as const,
        userId: 7,
      },
    };
    const context = createContext(input);
    context.get.mockImplementation((key: string) => {
      if (key === "adminAuthorizationPolicy")
        return getTestAdminAuthorizationValue(key);
      if (key === "userId")
        return 7;
      if (key === "username")
        return "root";
      if (key === "requestId")
        return "req-adapter";
      if (key === "userDetailDto")
        return { name: "Root Admin", roles: ["iam:admin"] };
      return undefined;
    });

    const appLogger = {
      bindings: () => ({ sourceApp: "iam-admin-api-test" }),
      error: mock(() => undefined),
      info: mock(() => undefined),
      warn: mock(() => undefined),
    };
    const app = new Hono();
    app.onError(createErrorHandler(appLogger as never));
    app.post("/", async (c) => {
      await adapter.sessionsRevoke(context as never, async () => {});
      return c.body(null, 204);
    });
    const restResponse = await app.request("http://localhost/", { method: "POST" });

    expect(restResponse.status).toBe(409);
    expect(await restResponse.json()).toEqual({
      code: "ADMIN_SESSION_CURRENT_PROTECTED",
      data: null,
      message: "当前管理会话不能被强制下线",
    });
    expect(auditWrites).toHaveLength(1);

    let trpcFailure: unknown;
    try {
      await adapter.sessionManagementAdminRouter
        .createCaller({ hono: context })
        .revokeSessions(input);
    }
    catch (error) {
      trpcFailure = error;
    }
    expect(trpcFailure).toBeInstanceOf(TRPCError);
    expect((trpcFailure as TRPCError).code).toBe("CONFLICT");
    expect(getApiRuntimeErrorFormatterData((trpcFailure as TRPCError).cause)).toEqual({
      serviceCode: "ADMIN_SESSION_CURRENT_PROTECTED",
      serviceMessage: "当前管理会话不能被强制下线",
      httpStatus: 409,
    });
    const expectedProtectedUserAudit = {
      action: "admin.session.revoke_user",
      outcome: "failure",
      actorType: "admin",
      actorUserId: 7,
      targetType: "user",
      targetId: 7,
      details: {
        scope: "user",
        changed: false,
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        currentPrincipalSessionProtected: true,
        cleanupFailedCount: 0,
      },
    };
    expect(auditWrites).toHaveLength(2);
    expect(auditWrites).toEqual([
      expect.objectContaining(expectedProtectedUserAudit),
      expect.objectContaining(expectedProtectedUserAudit),
    ]);
    expect(JSON.stringify(auditWrites)).not.toContain("principalSessionId");
    expect(recordAuditLog).toHaveBeenCalledTimes(2);
    expect(revokePrincipalSession).not.toHaveBeenCalled();
    expect(revokeUserSessions).not.toHaveBeenCalled();
  });
});
