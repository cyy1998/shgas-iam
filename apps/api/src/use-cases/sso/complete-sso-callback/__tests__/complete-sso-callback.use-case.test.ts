import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
import { expect, mock, test } from "bun:test";
import { createCompleteSsoCallbackUseCase } from "../complete-sso-callback.use-case";

const client = {
  id: 1,
  clientCode: "gateway",
  clientName: "Gateway",
  clientSecret: "secret",
  url: "https://gateway.example.com",
  status: ClientStatus.Enable,
  description: null,
  extAttributes: {
    callbackEndpoint: "https://gateway.example.com/sso/callback",
    logoutEndpoint: "https://gateway.example.com/sso/logout",
    managementLevel: ClientManagementLevel.Gateway,
    requireOrcas: true,
    userExcluding: [],
    validRedirectUrls: ["https://gateway.example.com"],
  },
  isDelete: false,
  createTime: new Date("2026-01-01T00:00:00Z"),
  updateTime: new Date("2026-01-01T00:00:00Z"),
} satisfies CustomSsoClientRuntimeDto;

test("delegates once and maps the completed Gateway Local Session", async () => {
  const getClientByCode = mock(async () => client);
  const isAllowed = mock(() => true);
  const completeGatewayLogin = mock(async () => ({
    orcasSessionId: "orcas-session",
    token: "local-token",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { getClientByCode },
    redirectUrls: { isAllowed },
  });

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

  expect(completeGatewayLogin).toHaveBeenCalledTimes(1);
  expect(completeGatewayLogin).toHaveBeenCalledWith({
    client,
    code: "auth-code",
    redirectUrl: "https://gateway.example.com/home",
    requestContext: {
      sourceApp: "iam",
      requestId: "req-callback",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  });
});

test("rejects an unknown client before redirect validation or Gateway login completion", async () => {
  const isAllowed = mock(() => true);
  const completeGatewayLogin = mock(async () => ({
    orcasSessionId: null,
    token: "should-not-exist",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { getClientByCode: mock(async () => null) },
    redirectUrls: { isAllowed },
  });

  await expect(useCase.execute({
    clientCode: "missing",
    code: "auth-code",
    redirectUrl: "https://gateway.example.com",
  })).rejects.toThrow("非法client代码");

  expect(isAllowed).not.toHaveBeenCalled();
  expect(completeGatewayLogin).not.toHaveBeenCalled();
});

test("rejects a disallowed redirect before Gateway login completion", async () => {
  const completeGatewayLogin = mock(async () => ({
    orcasSessionId: null,
    token: "should-not-exist",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { getClientByCode: mock(async () => client) },
    redirectUrls: { isAllowed: mock(() => false) },
  });

  await expect(useCase.execute({
    clientCode: "gateway",
    code: "auth-code",
    redirectUrl: "https://blocked.example.com",
  })).rejects.toThrow("非法重定向地址");

  expect(completeGatewayLogin).not.toHaveBeenCalled();
});
