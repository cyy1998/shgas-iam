import { expect, mock, test } from "bun:test";
import { createLoginWithWechatUseCase } from "../login-with-wechat.use-case";

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
      getActiveUserById: mock(async () => ({ id: 1001, subjectIdentifier })),
      getActiveUserByWxId,
      getUserDetailById: mock(async () => userDetail),
    },
    wechat: { getWxUserId },
  } as any);

  await expect(useCase.execute(
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
  )).resolves.toEqual({ token: "wechat-session", isMobileSet: true });

  expect(events).toEqual([
    "cache-get",
    "processing",
    "wechat",
    "active-user",
    "session",
    "audit",
    "final-cache",
  ]);
  expect(set).toHaveBeenNthCalledWith(1, "wx-code:wechat-code", "Processing", "EX", 600);
  expect(set).toHaveBeenNthCalledWith(2, "wx-code:wechat-code", JSON.stringify({ userId: 1001 }), "EX", 600);
  expect(createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
    amr: ["wechat"],
    origin: {
      ip: "203.0.113.14",
      userAgent: longUserAgent.slice(0, 512),
    },
  });
  expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: "auth.login.wechat",
    requestId: "req-wechat",
    targetId: 1001,
  }));
});

test("reuses a cached user id after one delay without exchange or duplicate audit", async () => {
  const wait = mock(async () => undefined);
  const getWxUserId = mock(async () => "should-not-run");
  const recordAuditLog = mock(async () => undefined);
  const getActiveUserById = mock(async () => ({ id: 1001, subjectIdentifier }));
  const userDetail = { id: 1001, mobile: null, name: "测试用户", username: "138550" };
  const createPrincipalSession = mock(async () => ({ token: "cached-session" }));
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog },
    cache: {
      del: mock(async () => 1),
      get: mock(async () => JSON.stringify({ userId: 1001 })),
      set: mock(async () => "OK"),
    },
    delay: { wait },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserById,
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getUserDetailById: mock(async () => userDetail),
    },
    wechat: { getWxUserId },
  } as any);

  await expect(useCase.execute({ code: "wechat-code" }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-cached-wechat",
      traceId: null,
      ip: "203.0.113.15",
      userAgent: "cached-wechat-browser",
      route: "/sso/third-party/wx",
      method: "POST",
    },
  })).resolves.toEqual({
    token: "cached-session",
    isMobileSet: false,
  });

  expect(wait).toHaveBeenCalledWith(200);
  expect(getActiveUserById).toHaveBeenCalledWith(1001);
  expect(getWxUserId).not.toHaveBeenCalled();
  expect(recordAuditLog).not.toHaveBeenCalled();
  expect(createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
    amr: ["wechat"],
    origin: {
      ip: "203.0.113.15",
      userAgent: "cached-wechat-browser",
    },
  });
});

test("accepts the legacy cached user-detail payload shape", async () => {
  const getActiveUserById = mock(async () => ({ id: 1001 }));
  const useCase = createLoginWithWechatUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    cache: {
      del: mock(async () => 1),
      get: mock(async () => JSON.stringify({ id: 1001, username: "legacy-user" })),
      set: mock(async () => "OK"),
    },
    delay: { wait: mock(async () => undefined) },
    principalSessions: { createPrincipalSession: mock(async () => ({ token: "legacy-session" })) },
    users: {
      getActiveUserById,
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getUserDetailById: mock(async () => ({ id: 1001, mobile: null })),
    },
    wechat: { getWxUserId: mock(async () => "wx-user") },
  } as any);

  await expect(useCase.execute({ code: "legacy-code" })).resolves.toEqual({
    token: "legacy-session",
    isMobileSet: false,
  });
  expect(getActiveUserById).toHaveBeenCalledWith(1001);
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
      getActiveUserById: mock(async () => ({ id: 1001 })),
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getUserDetailById: mock(async () => ({ id: 1001, mobile: null })),
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
      getActiveUserById: mock(async () => ({ id: 1001 })),
      getActiveUserByWxId: mock(async () => ({ id: 1001 })),
      getUserDetailById: mock(async () => ({ id: 1001, mobile: null })),
    },
    wechat: { getWxUserId: mock(async () => { throw new Error("WeChat unavailable"); }) },
  } as any);

  await expect(useCase.execute({ code: "failed-code" })).rejects.toThrow("WeChat unavailable");

  expect(set).toHaveBeenCalledTimes(1);
  expect(set).toHaveBeenCalledWith("wx-code:failed-code", "Processing", "EX", 600);
  expect(del).not.toHaveBeenCalled();
});
