import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { ClientStatus, CustomSsoClientMode } from "@iam/contracts";
import { createAuthorizeSsoUseCase } from "@iam/custom-sso/testing";
import { expect, mock, test } from "bun:test";

const client = {
  id: 1,
  clientCode: "portal",
  clientName: "Portal",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Independent,
    subjectClaims: ["subjectIdentifier"],
    validRedirectUrls: ["https://app.example.com/callback"],
    callbackEndpoint: "https://app.example.com/sso/callback",
    logoutEndpoint: "https://app.example.com/sso/logout",
  },
  customSsoConfigVersion: 7,
} satisfies CustomSsoClientRuntimeDto;

const enabledTrafficGate = {
  assertIssuanceAllowed: async () => undefined,
};

test("delegates authorization-code issuance after resolving the client and validating the redirect", async () => {
  const requestContext = {
    sourceApp: "iam",
    requestId: "req-authorize",
    traceId: null,
    ip: null,
    userAgent: null,
    route: null,
    method: null,
  };
  const findRuntimeRecord = mock(async () => client);
  const normalizeAllowed = mock(() => "https://app.example.com/callback");
  const issueAuthorizationCode = mock(async () => ({ isLogin: true as const, code: "auth-code" }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { findRuntimeRecord },
    redirectUrls: { normalizeAllowed },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "HTTPS://APP.Example.COM:443/a/../callback",
    state: "opaque state with spaces",
    tokenSource: "authorization_header",
  }, {
    requestContext,
  })).resolves.toEqual({
    isLogin: true,
    code: "auth-code",
    callbackEndpoint: "https://app.example.com/sso/callback",
    clientCode: "portal",
    mode: CustomSsoClientMode.Independent,
    redirectUrl: "https://app.example.com/callback",
    state: "opaque state with spaces",
  });

  expect(normalizeAllowed).toHaveBeenCalledTimes(1);
  expect(normalizeAllowed).toHaveBeenCalledWith(
    "portal",
    "HTTPS://APP.Example.COM:443/a/../callback",
    ["https://app.example.com/callback"],
    { requestContext },
  );
  expect(issueAuthorizationCode).toHaveBeenCalledTimes(1);
  expect(issueAuthorizationCode).toHaveBeenCalledWith({
    clientCode: "portal",
    configVersion: 7,
    mode: CustomSsoClientMode.Independent,
    redirectUrl: "https://app.example.com/callback",
    requestContext,
    state: "opaque state with spaces",
    token: "principal-token",
    tokenSource: "authorization_header",
  });
});

test("rejects an unknown client before redirect validation or authorization-code issuance", async () => {
  const normalizeAllowed = mock(() => "https://app.example.com");
  const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { findRuntimeRecord: mock(async () => null) },
    redirectUrls: { normalizeAllowed },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "missing",
    redirectUrl: "https://app.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法client代码");

  expect(normalizeAllowed).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});

test("does not issue an authorization grant while client traffic is suspended", async () => {
  const issueAuthorizationCode = mock(async () => ({ isLogin: true as const, code: "should-not-exist" }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { findRuntimeRecord: mock(async () => ({
      ...client,
      status: ClientStatus.Maintenance,
    })) },
    redirectUrls: {
      normalizeAllowed: mock(() => "https://app.example.com/callback"),
    },
    trafficGate: {
      assertIssuanceAllowed: async () => {
        throw new Error("traffic suspended");
      },
    },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://app.example.com/callback",
    tokenSource: "cookie",
  })).rejects.toThrow("traffic suspended");

  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});

test("rejects a disallowed redirect before authorization-code issuance", async () => {
  const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: {
      findRuntimeRecord: mock(async () => ({
        ...client,
        customSsoConfig: {
          ...client.customSsoConfig,
          validRedirectUrls: ["https://allowed.example.com"],
        },
      })),
    },
    redirectUrls: { normalizeAllowed: mock(() => null) },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "portal",
    redirectUrl: "https://blocked.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法重定向地址");

  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});

test.each([
  ["disabled client", { status: ClientStatus.Disable }],
  ["deleted client", { isDelete: true }],
  ["custom SSO disabled", { customSsoEnabled: false }],
  ["missing custom SSO config", { customSsoConfig: null }],
] as const)("rejects %s before redirect validation or authorization-code issuance", async (
  _label,
  clientOverride,
) => {
  const normalizeAllowed = mock(() => "https://app.example.com/callback");
  const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: {
      findRuntimeRecord: mock(async () => ({
        ...client,
        ...clientOverride,
      } as CustomSsoClientRuntimeDto)),
    },
    redirectUrls: { normalizeAllowed },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "portal",
    redirectUrl: "https://app.example.com/callback",
    tokenSource: "none",
  })).rejects.toThrow("非法client代码");

  expect(normalizeAllowed).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});

test("does not synthesize state when the authorize request omits it", async () => {
  const issueAuthorizationCode = mock(async () => ({ isLogin: true as const, code: "auth-code" }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { findRuntimeRecord: mock(async () => client) },
    redirectUrls: {
      normalizeAllowed: mock(() => "https://app.example.com/callback"),
    },
    trafficGate: enabledTrafficGate,
  });

  const result = await useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://app.example.com/callback",
    tokenSource: "cookie",
  });

  expect(result).not.toHaveProperty("state");
  expect(issueAuthorizationCode).toHaveBeenCalledWith({
    clientCode: "portal",
    configVersion: 7,
    mode: CustomSsoClientMode.Independent,
    redirectUrl: "https://app.example.com/callback",
    requestContext: undefined,
    token: "principal-token",
    tokenSource: "cookie",
  });
});
