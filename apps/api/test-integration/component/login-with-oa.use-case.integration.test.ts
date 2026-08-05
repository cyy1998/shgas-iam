import { createLoginWithOaUseCase } from "@api/use-cases/sso/login-with-oa/login-with-oa.use-case";
import { UserType } from "@iam/contracts";
import { expect, mock, test } from "bun:test";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";

test("creates an OA PrincipalSession and audits the active Formal user", async () => {
  const events: string[] = [];
  const longUserAgent = `oa-browser/${"x".repeat(600)}`;
  const userDetail = {
    id: 1001,
    mobile: "17721462865",
    name: "测试用户",
    username: "138550",
  };
  const createPrincipalSession = mock(async () => {
    events.push("session");
    return { token: "oa-session" };
  });
  const recordAuditLog = mock(async () => {
    events.push("audit");
  });
  const useCase = createLoginWithOaUseCase({
    auditLogWriter: { recordAuditLog },
    clients: { getClientByCode: mock(async () => ({ clientSecret: "secret" })) },
    clock: { now: () => 1_700_000_000_000 },
    config: { nodeEnv: "production" },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByUsername: mock(async () => ({
        id: 1001,
        subjectIdentifier,
        userType: UserType.Formal,
      })),
      getUserDetailById: mock(async () => userDetail),
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "oa",
    loginId: "138550",
    timestamp: "1700000000000",
    token: "X92+9YTwAMkI9lrYcUlrlrO829Q5lNQOSq3IBzEuHjc=",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-oa",
      traceId: null,
      ip: "203.0.113.13",
      userAgent: longUserAgent,
      route: null,
      method: null,
    },
  })).resolves.toEqual({
    token: "oa-session",
    isMobileSet: true,
  });

  expect(events).toEqual(["session", "audit"]);
  expect(createPrincipalSession).toHaveBeenCalledWith(subjectIdentifier, {
    amr: ["oa"],
    origin: {
      ip: "203.0.113.13",
      userAgent: longUserAgent.slice(0, 512),
    },
  });
  expect(recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
    action: "auth.login.oa",
    requestId: "req-oa",
    targetId: 1001,
  }));
});

test("rejects a timestamp exactly five minutes old in production before user lookup", async () => {
  const getActiveUserByUsername = mock(async () => ({ id: 1001, userType: UserType.Formal }));
  const useCase = createLoginWithOaUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    clients: { getClientByCode: mock(async () => ({ clientSecret: "secret" })) },
    clock: { now: () => 1_700_000_300_000 },
    config: { nodeEnv: "production" },
    principalSessions: { createPrincipalSession: mock(async () => ({ token: "session" })) },
    users: {
      getActiveUserByUsername,
      getUserDetailById: mock(async () => ({ id: 1001 })),
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "oa",
    loginId: "138550",
    timestamp: "1700000000000",
    token: "irrelevant",
  })).rejects.toThrow("token过期");

  expect(getActiveUserByUsername).not.toHaveBeenCalled();
});

test("rejects an invalid OA signature before user lookup", async () => {
  const getActiveUserByUsername = mock(async () => ({ id: 1001, userType: UserType.Formal }));
  const useCase = createLoginWithOaUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    clients: { getClientByCode: mock(async () => ({ clientSecret: "secret" })) },
    clock: { now: () => 1_700_000_000_000 },
    config: { nodeEnv: "production" },
    principalSessions: { createPrincipalSession: mock(async () => ({ token: "session" })) },
    users: {
      getActiveUserByUsername,
      getUserDetailById: mock(async () => ({ id: 1001 })),
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "oa",
    loginId: "138550",
    timestamp: "1700000000000",
    token: "invalid-signature",
  })).rejects.toThrow("token校验失败");

  expect(getActiveUserByUsername).not.toHaveBeenCalled();
});

test("rejects a non-Formal user before detail and session work", async () => {
  const getUserDetailById = mock(async () => ({ id: 1001 }));
  const createPrincipalSession = mock(async () => ({ token: "session" }));
  const useCase = createLoginWithOaUseCase({
    auditLogWriter: { recordAuditLog: mock(async () => undefined) },
    clients: { getClientByCode: mock(async () => ({ clientSecret: "secret" })) },
    clock: { now: () => 1_700_000_000_000 },
    config: { nodeEnv: "production" },
    principalSessions: { createPrincipalSession },
    users: {
      getActiveUserByUsername: mock(async () => ({ id: 1001, userType: UserType.External })),
      getUserDetailById,
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "oa",
    loginId: "138550",
    timestamp: "1700000000000",
    token: "X92+9YTwAMkI9lrYcUlrlrO829Q5lNQOSq3IBzEuHjc=",
  })).rejects.toThrow("用户类别不支持OA登录");

  expect(getUserDetailById).not.toHaveBeenCalled();
  expect(createPrincipalSession).not.toHaveBeenCalled();
});
