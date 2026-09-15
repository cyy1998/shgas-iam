import type { UserDetailDto } from "@admin-api/services/user/user.type";
import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { UserSession } from "@iam/session-kernel";
import { createAdminRootAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { createAdminAuthorizationAdapter } from "@admin-api/routes/admin/authorization/authorization.adapter";
import { createAdminAuthorizationContextHandler } from "@admin-api/services/admin-authorization/admin-authorization.context";
import { createAdminAuthorizationPolicy } from "@admin-api/services/admin-authorization/admin-authorization.policy";
import {
  createSubjectAccessOperations,
  encodeSubjectAccessContext,
  SubjectAccessDisabledError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { createTRPCContext } from "@iam/api-core/trpc";
import { UserStatus, UserType } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

type PrincipalSession = Pick<UserSession, "userSessionId" | "subjectIdentifier" | "subjectContext">;

type TestResponse = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: {
    get: (name: string) => string | null;
    getSetCookie: () => string[];
  };
};

function asTestResponse(response: unknown): TestResponse {
  return response as TestResponse;
}

function createProtectedApp(options: {
  resolvePrincipalSession: (token: string) => Promise<{ status: string; value?: PrincipalSession }>;
  getUserDetailBySubjectIdentifierForAdmin: (subjectIdentifier: string) => Promise<UserDetailDto>;
  allowedClientCodes?: string[];
  readBarrier?: () => Promise<string>;
}) {
  const handlers = createAdminRootAuthenticationHandlers({
    resolveRoot: async (token) => {
      const result = await options.resolvePrincipalSession(token);
      return result.status === "resolved" ? (result.value ?? null) : null;
    },
    subjectAccess: createSubjectAccessOperations({
      barrier: {
        readCommittedTransitionId:
          options.readBarrier ?? (async () => "20000000-0000-4000-8000-000000000001"),
      },
      revocation: {
        revokePrincipalSession: async () => {
          throw new Error("cleanup failed");
        },
        revokeUserSessions: async () => {
          throw new Error("cleanup failed");
        },
      },
    }),
    userService: {
      getUserDetailForPermittedAdmin: async (_operation, subjectIdentifier) =>
        await options.getUserDetailBySubjectIdentifierForAdmin(subjectIdentifier),
    },
    config: {
      allowedClientCodes: options.allowedClientCodes ?? ["iam"],
    },
  });
  const app = new Hono();
  app.use("*", handlers.adminAuthenticationHandler);
  app.get("/rpc/admin.user.search", c => c.json({ ok: true }));
  app.onError((error, c) => {
    const status = "httpStatus" in error && typeof error.httpStatus === "number" ? error.httpStatus : 500;
    return c.text(error.message, status as never);
  });
  return app;
}

describe("admin authentication handler", () => {
  test("rejects missing Kernel PrincipalSession tokens without legacy fallback", async () => {
    const resolvePrincipalSession = mock(async () => ({
      status: "resolved",
      value: principalSession(),
    }));
    const getUserDetailBySubjectIdentifierForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailBySubjectIdentifierForAdmin,
    });

    const res = asTestResponse(
      await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
        },
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("未登录");
    expect(resolvePrincipalSession).toHaveBeenCalledTimes(0);
    expect(getUserDetailBySubjectIdentifierForAdmin).toHaveBeenCalledTimes(0);
    expect(res.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of res.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  });

  test("accepts Kernel PrincipalSession global_session cookies for admin RPC routes", async () => {
    const resolvePrincipalSession = mock(async () => ({
      status: "resolved",
      value: principalSession(),
    }));
    const getUserDetailBySubjectIdentifierForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailBySubjectIdentifierForAdmin,
    });

    const res = asTestResponse(
      await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
          Cookie: "global_session=iam_ps_valid",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(resolvePrincipalSession).toHaveBeenCalledWith("iam_ps_valid");
    expect(getUserDetailBySubjectIdentifierForAdmin).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  test("clears invalid Kernel PrincipalSession cookies instead of falling back to legacy session ids", async () => {
    const resolvePrincipalSession = mock(async () => ({ status: "missing_or_expired" }));
    const getUserDetailBySubjectIdentifierForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailBySubjectIdentifierForAdmin,
    });

    const res = asTestResponse(
      await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
          Cookie: "global_session=legacy-session-id; orcas_sso_sessionid=legacy-orcas",
        },
      }),
    );

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("未登录");
    expect(resolvePrincipalSession).toHaveBeenCalledWith("legacy-session-id");
    expect(getUserDetailBySubjectIdentifierForAdmin).toHaveBeenCalledTimes(0);
    expect(res.headers.getSetCookie()).toHaveLength(2);
    for (const cookie of res.headers.getSetCookie()) {
      expect(cookie).toContain("Path=/");
      expect(cookie).toContain("Max-Age=0");
      expect(cookie).toContain("Expires=Thu, 01 Jan 1970 00:00:00 GMT");
    }
  });

  for (const reason of ["user_disabled", "user_deleted", "session_generation_stale"] as const) {
    test(`returns SESSION_INVALID semantics and clears cookies for ${reason}`, async () => {
      const app = createProtectedApp({
        resolvePrincipalSession: mock(async () => ({ status: "resolved", value: principalSession() })),
        readBarrier: async () => {
          if (reason === "session_generation_stale")
            return "20000000-0000-4000-8000-000000000002";
          throw new SubjectAccessDisabledError();
        },
        getUserDetailBySubjectIdentifierForAdmin: mock(async () => adminUser()),
      });

      const res = asTestResponse(
        await app.request("http://localhost/rpc/admin.user.search", {
          headers: {
            Client: "iam",
            Cookie: "global_session=disabled-session; orcas_sso_sessionid=legacy-orcas",
          },
        }),
      );

      expect(res.status).toBe(401);
      expect(await res.text()).toBe("会话已失效");
      expect(res.headers.get("set-cookie")).toContain("global_session=");
      expect(res.headers.get("set-cookie")).toContain("orcas_sso_sessionid=");
    });
  }

  test("returns unavailable without clearing cookies when Barrier state is uncertain", async () => {
    const app = createProtectedApp({
      resolvePrincipalSession: mock(async () => {
        throw new SubjectAccessUnavailableError(new Error("redis failed"));
      }),
      getUserDetailBySubjectIdentifierForAdmin: mock(async () => adminUser()),
    });

    const res = asTestResponse(
      await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
          Cookie: "global_session=uncertain-session; orcas_sso_sessionid=legacy-orcas",
        },
      }),
    );

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("账号访问状态暂时不可用");
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  test("authenticates enabled users without deciding Admin operation capabilities", async () => {
    const resolvePrincipalSession = mock(async () => ({
      status: "resolved",
      value: principalSession(),
    }));
    const getUserDetailBySubjectIdentifierForAdmin = mock(async () => adminUser({ roles: ["iam:user"] }));
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailBySubjectIdentifierForAdmin,
    });

    const res = asTestResponse(
      await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
          Cookie: "global_session=iam_ps_valid",
        },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

function principalSession(overrides: Partial<PrincipalSession> = {}): PrincipalSession {
  return {
    userSessionId: "30000000-0000-4000-8000-000000000001",
    subjectIdentifier: "00000000-0000-4000-8000-000000000001",
    subjectContext: encodeSubjectAccessContext({
      version: 1,
      subjectIdentifier: "00000000-0000-4000-8000-000000000001",
      transitionId: "20000000-0000-4000-8000-000000000001",
    }),
    ...overrides,
  };
}

function adminUser(overrides: Partial<UserDetailDto> = {}): UserDetailDto {
  return {
    id: 1,
    username: "admin",
    name: "Admin",
    userType: UserType.Formal,
    password: "redacted",
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    orderNum: 0,
    isDelete: false,
    createTime: new Date(),
    updateTime: new Date(),
    employments: [],
    roles: ["iam:admin"],
    privileges: [],
    ...overrides,
  } as UserDetailDto;
}

function createPermittedApp(
  options: {
    readBarrier?: () => Promise<string>;
    loadUser?: (operation: SubjectAccessOperation) => Promise<UserDetailDto>;
  } = {},
) {
  const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
  const transitionId = "20000000-0000-4000-8000-000000000001";
  const readBarrier = mock(options.readBarrier ?? (async () => transitionId));
  const revokePrincipalSession = mock(async () => {
    throw new Error("cleanup failed");
  });
  const revokeUserSessions = mock(async () => {
    throw new Error("cleanup failed");
  });
  const operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: readBarrier },
    revocation: { revokePrincipalSession, revokeUserSessions },
  });
  const loadUser = mock(options.loadUser ?? (async () => adminUser()));
  const handlers = createAdminRootAuthenticationHandlers({
    subjectAccess: operations,
    resolveRoot: async () => ({
      ...principalSession(),
      subjectContext: encodeSubjectAccessContext({ version: 1, subjectIdentifier, transitionId }),
    }),
    userService: { getUserDetailForPermittedAdmin: loadUser },
    config: { allowedClientCodes: ["iam"] },
  });
  const app = new Hono();
  app.use("*", handlers.adminAuthenticationHandler);
  app.use(
    "*",
    createAdminAuthorizationContextHandler(
      createAdminAuthorizationPolicy({
        logger: { warn: mock() },
        hrAdministrationScopeResolver: { resolveForActor: async () => null },
      }),
    ),
  );
  const adapter = createAdminAuthorizationAdapter();
  app.get("/admin/capabilities", c => adapter.capabilitySummary(c as never, async () => {}));
  app.all(
    "/rpc/*",
    async c =>
      await fetchRequestHandler({
        endpoint: "/rpc",
        req: c.req.raw,
        router: adapter.authorizationAdminRouter,
        createContext: () => createTRPCContext({ honoCtx: c }),
      }),
  );
  app.onError((error, c) => c.text(error.message, ("httpStatus" in error ? error.httpStatus : 500) as never));
  const request = (path: string) =>
    app.request(`http://localhost${path}`, {
      headers: { Client: "iam", Cookie: "global_session=valid; orcas_sso_sessionid=orcas" },
    });
  return { request, readBarrier, loadUser, revokePrincipalSession, revokeUserSessions };
}

for (const path of ["/admin/capabilities", "/rpc/capabilitySummary?input=%7B%7D"]) {
  describe(`Admin operation permission ${path}`, () => {
    test("keeps the in-flight permission through a disabled/deleted profile, then denies the next call", async () => {
      let disabled = false;
      let capturedOperation: SubjectAccessOperation | undefined;
      const app = createPermittedApp({
        readBarrier: async () => {
          if (disabled)
            throw new SubjectAccessDisabledError();
          return "20000000-0000-4000-8000-000000000001";
        },
        loadUser: async (operation) => {
          capturedOperation = operation;
          disabled = true;
          operation.requirePermission("00000000-0000-4000-8000-000000000001");
          return adminUser({ status: UserStatus.Disable, isDelete: true });
        },
      });
      const allowed = await app.request(path);
      const payload = await allowed.json();
      expect(allowed.status).toBe(200);
      expect(JSON.stringify(payload)).toContain("visibleModules");
      expect(app.readBarrier).toHaveBeenCalledTimes(1);
      expect(() => capturedOperation!.requirePermission("00000000-0000-4000-8000-000000000001")).toThrow();
      const denied = await app.request(path);
      const message = await denied.text();
      expect(denied.status).toBe(401);
      expect(message).toBe("会话已失效");
      expect(denied.headers.getSetCookie()).toHaveLength(2);
      expect(app.readBarrier).toHaveBeenCalledTimes(2);
      expect(app.loadUser).toHaveBeenCalledTimes(1);
      expect(app.revokeUserSessions).toHaveBeenCalledTimes(1);
    });

    test("keeps independent role authorization after permission", async () => {
      const app = createPermittedApp({ loadUser: async () => adminUser({ roles: ["iam:user"] }) });
      const response = await app.request(path);
      expect(response.status).toBe(403);
      expect(app.readBarrier).toHaveBeenCalledTimes(1);
      expect(response.headers.getSetCookie()).toHaveLength(0);
    });

    test("preserves unauthorized and cookie clearing when the permitted profile is missing", async () => {
      const app = createPermittedApp({
        loadUser: async () => {
          throw new UserNotFoundError();
        },
      });
      const response = await app.request(path);
      const message = await response.text();
      expect(response.status).toBe(401);
      expect(message).toBe("未登录");
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(app.readBarrier).toHaveBeenCalledTimes(1);
    });

    test("does not treat an unrelated profile failure as account denial", async () => {
      const app = createPermittedApp({
        loadUser: async () => {
          throw new Error("profile storage unavailable");
        },
      });
      const response = await app.request(path);
      expect(response.status).toBe(500);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      expect(app.revokePrincipalSession).toHaveBeenCalledTimes(0);
      expect(app.revokeUserSessions).toHaveBeenCalledTimes(0);
    });

    test("preserves cookies and does not revoke on unavailable Barrier", async () => {
      const app = createPermittedApp({
        readBarrier: async () => {
          throw new SubjectAccessUnavailableError();
        },
      });
      const response = await app.request(path);
      expect(response.status).toBe(503);
      expect(response.headers.getSetCookie()).toHaveLength(0);
      expect(app.loadUser).toHaveBeenCalledTimes(0);
      expect(app.revokeUserSessions).toHaveBeenCalledTimes(0);
      expect(app.revokePrincipalSession).toHaveBeenCalledTimes(0);
      expect(app.readBarrier).toHaveBeenCalledTimes(1);
    });

    test("rejects an old session generation and clears cookies despite cleanup failure", async () => {
      const app = createPermittedApp({
        readBarrier: async () => "20000000-0000-4000-8000-000000000002",
      });
      const response = await app.request(path);
      expect(response.status).toBe(401);
      expect(response.headers.getSetCookie()).toHaveLength(2);
      expect(app.readBarrier).toHaveBeenCalledTimes(1);
      expect(app.loadUser).toHaveBeenCalledTimes(0);
      expect(app.revokePrincipalSession).toHaveBeenCalledWith(
        "30000000-0000-4000-8000-000000000001",
        "session_generation_stale",
      );
      expect(app.revokeUserSessions).toHaveBeenCalledTimes(0);
    });
  });
}
