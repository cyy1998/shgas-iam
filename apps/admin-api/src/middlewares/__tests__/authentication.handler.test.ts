import type { UserDetailDto } from "@admin-api/services/user/user.type";
import type { PrincipalSession } from "@iam/api-core/session/kernel";
import { createAdminAuthenticationHandlers } from "@admin-api/middlewares/authentication.handler";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { Hono } from "hono";

type TestResponse = {
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
  headers: {
    get: (name: string) => string | null;
  };
};

function asTestResponse(response: unknown): TestResponse {
  return response as TestResponse;
}

function createProtectedApp(options: {
  resolvePrincipalSession: (token: string) => Promise<{ status: string; value?: PrincipalSession }>;
  getUserDetailByUsernameForAdmin: (username: string) => Promise<UserDetailDto>;
  allowedClientCodes?: string[];
  adminRoleCodes?: string[];
}) {
  const handlers = createAdminAuthenticationHandlers({
    sessionKernel: {
      resolvePrincipalSession: options.resolvePrincipalSession as never,
    },
    userService: {
      getUserDetailByUsernameForAdmin: options.getUserDetailByUsernameForAdmin,
    },
    config: {
      allowedClientCodes: options.allowedClientCodes ?? ["iam"],
      adminRoleCodes: options.adminRoleCodes ?? ["iam:admin"],
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
    const getUserDetailByUsernameForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailByUsernameForAdmin,
    });

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
      },
    }));

    expect(res.status).toBe(401);
    expect(await res.text()).toBe("未登录");
    expect(resolvePrincipalSession).toHaveBeenCalledTimes(0);
    expect(getUserDetailByUsernameForAdmin).toHaveBeenCalledTimes(0);
    expect(res.headers.get("set-cookie")).toContain("global_session=");
    expect(res.headers.get("set-cookie")).toContain("orcas_sso_sessionid=");
  });

  test("accepts Kernel PrincipalSession global_session cookies for admin RPC routes", async () => {
    const resolvePrincipalSession = mock(async () => ({
      status: "resolved",
      value: principalSession(),
    }));
    const getUserDetailByUsernameForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailByUsernameForAdmin,
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
    expect(getUserDetailByUsernameForAdmin).toHaveBeenCalledWith("admin");
  });

  test("clears invalid Kernel PrincipalSession cookies instead of falling back to legacy session ids", async () => {
    const resolvePrincipalSession = mock(async () => ({ status: "missing_or_expired" }));
    const getUserDetailByUsernameForAdmin = mock(async () => adminUser());
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailByUsernameForAdmin,
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
    expect(getUserDetailByUsernameForAdmin).toHaveBeenCalledTimes(0);
    expect(res.headers.get("set-cookie")).toContain("global_session=");
    expect(res.headers.get("set-cookie")).toContain("orcas_sso_sessionid=");
  });

  test("rejects Kernel PrincipalSession users without an admin role", async () => {
    const resolvePrincipalSession = mock(async () => ({
      status: "resolved",
      value: principalSession(),
    }));
    const getUserDetailByUsernameForAdmin = mock(async () => adminUser({ roles: ["iam:user"] }));
    const app = createProtectedApp({
      resolvePrincipalSession,
      getUserDetailByUsernameForAdmin,
    });

    const res = asTestResponse(await app.request("http://localhost/rpc/admin.user.search", {
      headers: {
        Client: "iam",
        Cookie: "global_session=iam_ps_valid",
      },
    }));

    expect(res.status).toBe(403);
    expect(await res.text()).toBe("无管理端访问权限");
  });
});

function principalSession(overrides: Partial<PrincipalSession> = {}): PrincipalSession {
  return {
    version: 1,
    sessionKind: "browser_user",
    principalSessionId: "ps-1",
    externalTokenLookupHash: "hash",
    lookupKeyId: "kid",
    principal: {
      principalType: "user",
      subjectId: "1",
      displayName: "Admin",
    },
    authTime: 1,
    lastActiveAt: 1,
    expiresAt: Date.now() + 60_000,
    absoluteExpiresAt: Date.now() + 60_000,
    amr: ["pwd"],
    snapshot: {
      subjectId: "1",
      username: "admin",
      displayName: "Admin",
    },
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
