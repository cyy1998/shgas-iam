import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { createCompleteSsoCallbackUseCase } from "@iam/custom-sso/testing";
import { describe, expect, mock, test } from "bun:test";

const client = {
  clientCode: "gateway",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Gateway,
    orcas: { enabled: true },
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    validRedirectUrls: ["https://gateway.example.com"],
  },
  customSsoConfigVersion: 7,
};

const enabledTrafficGate = {
  assertIssuanceAllowed: async () => undefined,
};

test("delegates once and maps the completed Gateway Local Session", async () => {
  const findRuntimeRecord = mock(async () => client);
  const completeGatewayLogin = mock(async () => ({
    ttl: 37,
    orcasSessionId: "orcas-session",
    state: "opaque-state",
    token: "local-token",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { findRuntimeRecord },
    trafficGate: enabledTrafficGate,
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
    ttl: 37,
    orcasSessionId: "orcas-session",
    state: "opaque-state",
    token: "local-token",
  });

  expect(completeGatewayLogin).toHaveBeenCalledTimes(1);
  expect(completeGatewayLogin).toHaveBeenCalledWith({
    client: {
      clientCode: "gateway",
      configVersion: 7,
      orcasEnabled: true,
    },
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

describe("current Gateway client state", () => {
  test.each([
    ["missing", null],
    ["disabled", { ...client, customSsoEnabled: false }],
    ["deleted", { ...client, isDelete: true }],
    ["unconfigured", { ...client, customSsoConfig: null }],
    ["Independent mode", {
      ...client,
      customSsoConfig: {
        mode: CustomSsoClientMode.Independent,
        callbackEndpoint: "https://gateway.example.com/sso/callback",
        logoutEndpoint: "https://gateway.example.com/sso/logout",
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        validRedirectUrls: ["https://gateway.example.com"],
      },
    }],
  ])("rejects %s before Gateway login completion", async (_name, currentClient) => {
    const completeGatewayLogin = mock(async () => ({
      ttl: 37,
      orcasSessionId: null,
      token: "should-not-exist",
    }));
    const useCase = createCompleteSsoCallbackUseCase({
      authorizationGrants: { completeGatewayLogin },
      clients: { findRuntimeRecord: mock(async () => currentClient) },
      trafficGate: enabledTrafficGate,
    });

    await expect(useCase.execute({
      clientCode: "gateway",
      code: "auth-code",
      redirectUrl: "https://gateway.example.com",
    })).rejects.toThrow("非法client代码");

    expect(completeGatewayLogin).not.toHaveBeenCalled();
  });
});

test("does not consume the Gateway grant or establish a Local Session while traffic is suspended", async () => {
  const completeGatewayLogin = mock(async () => ({
    ttl: 37,
    orcasSessionId: null,
    token: "should-not-exist",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { findRuntimeRecord: mock(async () => ({
      ...client,
      status: ClientStatus.Maintenance,
    })) },
    trafficGate: {
      assertIssuanceAllowed: async () => {
        throw new Error("traffic suspended");
      },
    },
  });

  await expect(useCase.execute({
    clientCode: "gateway",
    code: "auth-code",
    redirectUrl: "https://gateway.example.com",
  })).rejects.toThrow("traffic suspended");

  expect(completeGatewayLogin).not.toHaveBeenCalled();
});

test("delegates the literal redirect to the grant without reapplying a redirect pattern", async () => {
  const completeGatewayLogin = mock(async () => {
    throw new Error("grant redirect mismatch");
  });
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { findRuntimeRecord: mock(async () => client) },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "gateway",
    code: "auth-code",
    redirectUrl: "https://blocked.example.com",
  })).rejects.toThrow("grant redirect mismatch");

  expect(completeGatewayLogin).toHaveBeenCalledWith({
    client: {
      clientCode: "gateway",
      configVersion: 7,
      orcasEnabled: true,
    },
    code: "auth-code",
    redirectUrl: "https://blocked.example.com",
    requestContext: undefined,
  });
});
