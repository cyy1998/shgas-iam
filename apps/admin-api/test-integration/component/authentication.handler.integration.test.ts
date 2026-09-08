import type { UserDetailDto } from "@admin-api/services/user/user.type";
import type { PrincipalSession } from "@iam/session-kernel";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

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
}) {
  const handlers = createAdminAuthenticationHandlers({
    sessionKernel: {
      resolvePrincipalSession: options.resolvePrincipalSession as never,
    },
    userService: {
      getUserDetailBySubjectIdentifierForAdmin: options.getUserDetailBySubjectIdentifierForAdmin,
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

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
      },
    }));

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

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
        Cookie: "global_session=iam_ps_valid",
      },
    }));

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

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
        Cookie: "global_session=legacy-session-id; orcas_sso_sessionid=legacy-orcas",
      },
    }));

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

  for (const reason of [
    "user_disabled",
    "user_deleted",
    "session_generation_stale",
  ] as const) {
    test(`returns SESSION_INVALID semantics and clears cookies for ${reason}`, async () => {
      const app = createProtectedApp({
        resolvePrincipalSession: mock(async () => ({
          status: "validation_failed",
          reason,
        })),
        getUserDetailBySubjectIdentifierForAdmin: mock(async () => adminUser()),
      });

      const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
        headers: {
          Client: "iam",
          Cookie: "global_session=disabled-session; orcas_sso_sessionid=legacy-orcas",
        },
      }));

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

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
        Cookie: "global_session=uncertain-session; orcas_sso_sessionid=legacy-orcas",
      },
    }));

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

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
        Cookie: "global_session=iam_ps_valid",
      },
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

function principalSession(overrides: Partial<PrincipalSession> = {}): PrincipalSession {
  return {
    version: 1,
    subjectAccessTransitionId: "20000000-0000-4000-8000-000000000001",
    sessionKind: "browser_user",
    principalSessionId: "ps-1",
    externalTokenLookupHash: "hash",
    lookupKeyId: "kid",
    principal: {
      principalType: "user",
      subjectId: "00000000-0000-4000-8000-000000000001",
    },
    authTime: 1,
    lastActiveAt: 1,
    expiresAt: Date.now() + 60_000,
    absoluteExpiresAt: Date.now() + 60_000,
    amr: ["pwd"],
    cleanupRefs: [],
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
