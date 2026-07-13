import { ClientManagementLevel } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { createExchangeSsoCodeUseCase } from "../exchange-sso-code.use-case";

test("validates the client secret before consuming the code and creating an Independent session", async () => {
  const events: string[] = [];
  const client = { clientCode: "independent", clientSecret: "secret" };
  const userDetail = { id: 1001, name: "测试用户" } as any;
  const authCode = { userDetail };
  const getClientByCode = mock(async () => {
    events.push("client");
    return client;
  });
  const consumeAuthCode = mock(async () => {
    events.push("consume");
    return authCode;
  });
  const createLocalSession = mock(async () => {
    events.push("session");
    return { token: "local-token", ttl: 3600, userInfo: userDetail };
  });
  const useCase = createExchangeSsoCodeUseCase({
    clients: { getClientByCode },
    sessions: { consumeAuthCode, createLocalSession },
  } as any);

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "secret",
    code: "auth-code",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-token",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  })).resolves.toEqual({
    sid: "local-token",
    ttl: 3600,
    userInfo: userDetail,
  });

  expect(events).toEqual(["client", "consume", "session"]);
  expect(consumeAuthCode).toHaveBeenCalledWith({
    clientCode: "independent",
    code: "auth-code",
    invalidCodeError: "invalid_auth_code",
  });
  expect(createLocalSession).toHaveBeenCalledWith({
    authCode,
    client,
    mode: ClientManagementLevel.Independent,
    requestContext: {
      sourceApp: "iam",
      requestId: "req-token",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
    userDetail,
  });
});

test("rejects a wrong client secret before consuming the auth code", async () => {
  const consumeAuthCode = mock(async () => ({ userDetail: { id: 1001 } }));
  const createLocalSession = mock(async () => ({ token: "token", ttl: 3600, userInfo: { id: 1001 } }));
  const useCase = createExchangeSsoCodeUseCase({
    clients: {
      getClientByCode: mock(async () => ({ clientSecret: "correct-secret" })),
    },
    sessions: { consumeAuthCode, createLocalSession },
  } as any);

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "wrong-secret",
    code: "auth-code",
  })).rejects.toThrow("非法Client");

  expect(consumeAuthCode).not.toHaveBeenCalled();
  expect(createLocalSession).not.toHaveBeenCalled();
});
