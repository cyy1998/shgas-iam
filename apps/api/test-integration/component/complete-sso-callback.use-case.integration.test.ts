import { createCompleteSsoCallbackUseCase } from "@api/use-cases/sso/complete-sso-callback/complete-sso-callback.use-case";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

const client = {
  clientCode: "gateway",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Gateway,
    orcas: { enabled: true },
    subjectClaimCatalogVersion: 1 as const,
    subjectClaims: [SubjectClaim.SubjectIdentifier],
    validRedirectUrls: ["https://gateway.example.com"],
  },
  customSsoConfigVersion: 7,
};

test("delegates once and maps the completed Gateway Local Session", async () => {
  const findRuntimeRecord = mock(async () => client);
  const completeGatewayLogin = mock(async () => ({
    orcasSessionId: "orcas-session",
    state: "opaque-state",
    token: "local-token",
  }));
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { findRuntimeRecord },
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
    ["maintenance", { ...client, status: ClientStatus.Maintenance }],
    ["unconfigured", { ...client, customSsoConfig: null }],
    ["Independent mode", {
      ...client,
      customSsoConfig: {
        mode: CustomSsoClientMode.Independent,
        callbackEndpoint: "https://gateway.example.com/sso/callback",
        logoutEndpoint: "https://gateway.example.com/sso/logout",
        subjectClaimCatalogVersion: 1 as const,
        subjectClaims: [SubjectClaim.SubjectIdentifier],
        validRedirectUrls: ["https://gateway.example.com"],
      },
    }],
  ])("rejects %s before Gateway login completion", async (_name, currentClient) => {
    const completeGatewayLogin = mock(async () => ({
      orcasSessionId: null,
      token: "should-not-exist",
    }));
    const useCase = createCompleteSsoCallbackUseCase({
      authorizationGrants: { completeGatewayLogin },
      clients: { findRuntimeRecord: mock(async () => currentClient) },
    });

    await expect(useCase.execute({
      clientCode: "gateway",
      code: "auth-code",
      redirectUrl: "https://gateway.example.com",
    })).rejects.toThrow("非法client代码");

    expect(completeGatewayLogin).not.toHaveBeenCalled();
  });
});

test("delegates the literal redirect to the grant without reapplying a redirect pattern", async () => {
  const completeGatewayLogin = mock(async () => {
    throw new Error("grant redirect mismatch");
  });
  const useCase = createCompleteSsoCallbackUseCase({
    authorizationGrants: { completeGatewayLogin },
    clients: { findRuntimeRecord: mock(async () => client) },
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
