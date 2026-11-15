import { expect, mock, test } from "bun:test";
import { LoginFailedError } from "@api/use-cases/authentication/login.error";
import { createLoginWithWechatUseCase } from "@api/use-cases/authentication/login-with-wechat/login-with-wechat.use-case";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";

test("completes a cache miss in Processing exchange session audit and final-cache order", async () => {
  const events: string[] = [];
  const longUserAgent = `wechat-browser/${"x".repeat(600)}`;
  const userDetail = {
    id: 1001,
    mobile: "17721462865",
    name: "测试用户",
    username: "138550",
  };
  const get = mock(async () => {
    events.push("cache-get");
    return null;
  });
  const set = mock(async (_key: string, value: string) => {
    events.push(value === "Processing" ? "processing" : "final-cache");
    return "OK";
  });
  const getWxUserId = mock(async () => {
    events.push("wechat");
    return "wx-user";
  });
  const getActiveUserByWxId = mock(async () => {
    events.push("active-user");
    return { id: 1001, subjectIdentifier };
  });
  const createPrincipalSession = mock(async () => {
    events.push("session");
    return { token: "wechat-session" };
  });
  const recordAuditLog = mock(async () => {
    events.push("audit");
  });
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog },
    cache: { del: mock(async () => 1), get, set },
    delay: { wait: mock(async () => undefined) },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByWxId,
      getLoginProfileById: mock(async () => ({
        username: userDetail.username,
        name: userDetail.name,
        mobile: userDetail.mobile,
      })),
    },
    wechat: { getWxUserId },
  } as any);

  await expect(
    useCase.execute(
      { code: "wechat-code" },
      {
        requestContext: {
          sourceApp: "iam",
          requestId: "req-wechat",
          traceId: null,
          ip: "203.0.113.14",
          userAgent: longUserAgent,
          route: null,
          method: null,
        },
      },
    ),
  ).resolves.toEqual({ token: "wechat-session", isMobileSet: true });

  expect(events).toEqual(["cache-get", "processing", "wechat", "active-user", "session", "audit", "final-cache"]);
  expect(set).toHaveBeenNthCalledWith(1, "wx-code:wechat-code", "Processing", "EX", 600);
  expect(set).toHaveBeenNthCalledWith(
    2,
    "wx-code:wechat-code",
    JSON.stringify({ userId: 1001, wxId: "wx-user" }),
    "EX",
    600,
  );
  expect(createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
    amr: ["wechat"],
    origin: {
      ip: "203.0.113.14",
      userAgent: longUserAgent.slice(0, 512),
    },
  });
  expect(recordAuditLog).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "auth.login.wechat",
      requestId: "req-wechat",
      targetId: 1001,
    }),
  );
});

test("reuses a callback code only while the same active user owns its WeCom member ID", async () => {
  let cached: string | null = null;
  const originalUser = { id: 1001, subjectIdentifier };
  let owner: typeof originalUser | null = originalUser;
  const recordAuditLog = mock(async () => undefined);
  const getWxUserId = mock(async () => "wx-member-secret");
  const createPrincipalSession = mock(async () => ({ token: "root-token-secret" }));
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog },
    cache: {
      del: mock(async () => 1),
      get: async () => cached,
      set: async (_key, value) => {
        cached = value;
      },
    },
    delay: { wait: async () => undefined },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByWxId: async () => owner,
      getLoginProfileById: async () => ({ username: "138550", name: "测试用户", mobile: null }),
    },
    wechat: { getWxUserId },
  });

  const input = { code: "authorization-code-secret" };
  expect(await useCase.execute(input)).toEqual({ token: "root-token-secret", isMobileSet: false });
  expect(await useCase.execute(input)).toEqual({ token: "root-token-secret", isMobileSet: false });
  expect(getWxUserId).toHaveBeenCalledTimes(1);
  expect(recordAuditLog).toHaveBeenCalledTimes(1);
  for (const value of [input.code, "wx-member-secret", "root-token-secret"]) {
    expect(JSON.stringify(recordAuditLog.mock.calls)).not.toContain(value);
  }

  owner = null;
  const unlinked = await useCase.execute(input).catch((error: unknown) => error);
  expect(unlinked).toBeInstanceOf(LoginFailedError);
  owner = { id: 1002, subjectIdentifier: "00000000-0000-4000-8000-000000001002" };
  const reassigned = await useCase.execute(input).catch((error: unknown) => error);
  expect(reassigned).toBeInstanceOf(LoginFailedError);
  expect(createPrincipalSession).toHaveBeenCalledTimes(2);
  expect(getWxUserId).toHaveBeenCalledTimes(1);
});

test.each([
  JSON.stringify({ id: 1001, username: "legacy-user" }),
  JSON.stringify({ userId: 1001 }),
  "malformed legacy cache",
])("rejects a cache record without a verified WeCom member ID", async (cached) => {
  const originalUser = { id: 1001, subjectIdentifier };
  const createPrincipalSession = mock(async () => ({ token: "legacy-session" }));
  const del = mock(async () => 1);
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    cache: { del, get: async () => cached, set: async () => "OK" },
    delay: { wait: async () => undefined },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByWxId: async () => originalUser,
      getLoginProfileById: async () => ({ username: "138550", name: "测试用户", mobile: null }),
    },
    wechat: { getWxUserId: async () => "wx-user" },
  });

  const result = await useCase.execute({ code: "legacy-code" }).catch((error: unknown) => error);
  expect(result).toBeInstanceOf(LoginFailedError);
  expect(createPrincipalSession).not.toHaveBeenCalled();
  expect(del).not.toHaveBeenCalled();
});

test("polls Processing through the existing retry boundary before deleting and timing out", async () => {
  const wait = mock(async () => undefined);
  const del = mock(async () => 1);
  const get = mock(async () => "Processing");
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    cache: { del, get, set: mock(async () => "OK") },
    delay: { wait },
    principalSessions: { createPrincipalSession: mock(async () => ({ token: "session" })) },
    users: {
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getLoginProfileById: mock(async () => ({ id: 1001, mobile: null })),
    },
    wechat: { getWxUserId: mock(async () => "wx-user") },
  } as any);

  await expect(useCase.execute({ code: "stuck-code" })).rejects.toThrow("微信登录超时");

  expect(wait).toHaveBeenCalledTimes(6);
  expect(get).toHaveBeenCalledTimes(7);
  expect(del).toHaveBeenCalledWith("wx-code:stuck-code");
});

test("preserves the Processing sentinel when the first-pass exchange fails", async () => {
  const set = mock(async () => "OK");
  const del = mock(async () => 1);
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    cache: { del, get: mock(async () => null), set },
    delay: { wait: mock(async () => undefined) },
    principalSessions: { createPrincipalSession: mock(async () => ({ token: "session" })) },
    users: {
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getLoginProfileById: mock(async () => ({ id: 1001, mobile: null })),
    },
    wechat: {
      getWxUserId: mock(async () => {
        throw new Error("WeChat unavailable");
      }),
    },
  } as any);

  await expect(useCase.execute({ code: "failed-code" })).rejects.toThrow("WeChat unavailable");

  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith("wx-code:failed-code", "Processing", "EX", 600);
  expect(del).not.toHaveBeenCalled();
});
