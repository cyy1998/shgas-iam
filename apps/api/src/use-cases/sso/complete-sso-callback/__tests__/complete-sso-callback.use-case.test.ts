import { ClientManagementLevel } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { createCompleteSsoCallbackUseCase } from "../complete-sso-callback.use-case";

test("consumes the code, completes ORCAS login, then creates a Gateway local session", async () => {
  const events: string[] = [];
  const client = {
    clientCode: "gateway",
    extAttributes: { requireOrcas: true, validRedirectUrls: ["https://gateway.example.com"] },
  };
  const userDetail = { id: 1001, name: "测试用户" };
  const authCode = { userDetail };
  const consumeAuthCode = mock(async () => {
    events.push("consume");
    return authCode;
  });
  const orcasLogin = mock(async () => {
    events.push("orcas");
    return { orcasId: "orcas-user", orcasSessionId: "orcas-session" };
  });
  const createLocalSession = mock(async () => {
    events.push("session");
    return { token: "local-token" };
  });
  const useCase = createCompleteSsoCallbackUseCase({
    clients: { getClientByCode: mock(async () => client) },
    orcas: { orcasLogin },
    redirectUrls: { isAllowed: mock(() => true) },
    sessions: { consumeAuthCode, createLocalSession },
  } as any);

  await expect(useCase.execute({
    clientCode: "gateway",
    code: "auth-code",
    redirectUrl: "https://gateway.example.com/home",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-callback",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  })).resolves.toEqual({
    orcasSessionId: "orcas-session",
    token: "local-token",
  });

  expect(events).toEqual(["consume", "orcas", "session"]);
  expect(consumeAuthCode).toHaveBeenCalledWith({
    clientCode: "gateway",
    code: "auth-code",
    invalidCodeError: "unauthorized",
    redirectUrl: "https://gateway.example.com/home",
  });
  expect(createLocalSession).toHaveBeenCalledWith({
    authCode,
    client,
    mode: ClientManagementLevel.Gateway,
    orcas: { sessionId: "orcas-session", userId: "orcas-user" },
    requestContext: {
      sourceApp: "iam",
      requestId: "req-callback",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
    userDetail,
  });
});

test("does not create a local session when required ORCAS login fails", async () => {
  const createLocalSession = mock(async () => ({ token: "should-not-exist" }));
  const useCase = createCompleteSsoCallbackUseCase({
    clients: {
      getClientByCode: mock(async () => ({
        extAttributes: { requireOrcas: true, validRedirectUrls: ["https://gateway.example.com"] },
      })),
    },
    orcas: { orcasLogin: mock(async () => { throw new Error("ORCAS unavailable"); }) },
    redirectUrls: { isAllowed: mock(() => true) },
    sessions: {
      consumeAuthCode: mock(async () => ({ userDetail: { id: 1001 } })),
      createLocalSession,
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "gateway",
    code: "auth-code",
    redirectUrl: "https://gateway.example.com",
  })).rejects.toThrow("ORCAS unavailable");

  expect(createLocalSession).not.toHaveBeenCalled();
});

test("rejects an unknown client before redirect validation or auth-code consumption", async () => {
  const isAllowed = mock(() => true);
  const consumeAuthCode = mock(async () => ({ userDetail: { id: 1001 } }));
  const useCase = createCompleteSsoCallbackUseCase({
    clients: { getClientByCode: mock(async () => null) },
    orcas: { orcasLogin: mock(async () => ({ orcasId: "orcas", orcasSessionId: "session" })) },
    redirectUrls: { isAllowed },
    sessions: {
      consumeAuthCode,
      createLocalSession: mock(async () => ({ token: "local-token" })),
    },
  } as any);

  await expect(useCase.execute({
    clientCode: "missing",
    code: "auth-code",
    redirectUrl: "https://gateway.example.com",
  })).rejects.toThrow("非法client代码");

  expect(isAllowed).not.toHaveBeenCalled();
  expect(consumeAuthCode).not.toHaveBeenCalled();
});
