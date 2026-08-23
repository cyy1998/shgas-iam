import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { createCheckSsoLoginContinuationUseCase } from "@api/use-cases/sso/check-login-continuation/check-login-continuation.use-case";
import {
  ClientStatus,
  CustomSsoClientMode,
  LoginPageGuardDecision,
} from "@iam/contracts";
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

test("continues a valid Custom SSO request when the browser has a Valid Principal Session", async () => {
  const inspectPrincipalSession = mock(async () => "valid" as const);
  const useCase = createCheckSsoLoginContinuationUseCase({
    clients: { findRuntimeRecord: mock(async () => client) },
    principalSessions: { inspectPrincipalSession },
    redirectUrls: {
      normalizeAllowed: mock(() => "https://app.example.com/callback"),
    },
    trafficGate: { assertIssuanceAllowed: async () => undefined },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://app.example.com/callback",
  })).resolves.toEqual({
    clearGlobalSessionCookie: false,
    decision: LoginPageGuardDecision.Continue,
  });
  expect(inspectPrincipalSession).toHaveBeenCalledWith("principal-token");
});

test.each([
  ["absent", false],
  ["invalid", true],
] as const)("shows login for an %s Principal Session", async (
  inspection,
  clearGlobalSessionCookie,
) => {
  const useCase = createCheckSsoLoginContinuationUseCase({
    clients: { findRuntimeRecord: mock(async () => client) },
    principalSessions: {
      inspectPrincipalSession: mock(async () => inspection),
    },
    redirectUrls: {
      normalizeAllowed: mock(() => "https://app.example.com/callback"),
    },
    trafficGate: { assertIssuanceAllowed: async () => undefined },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    ...(inspection === "invalid"
      ? { globalSessionToken: "stale-token" }
      : {}),
    redirectUrl: "https://app.example.com/callback",
  })).resolves.toEqual({
    clearGlobalSessionCookie,
    decision: LoginPageGuardDecision.Login,
  });
});

test("rejects an invalid continuation before inspecting the Principal Session", async () => {
  const inspectPrincipalSession = mock(async () => "valid" as const);
  const useCase = createCheckSsoLoginContinuationUseCase({
    clients: { findRuntimeRecord: mock(async () => client) },
    principalSessions: { inspectPrincipalSession },
    redirectUrls: { normalizeAllowed: mock(() => null) },
    trafficGate: { assertIssuanceAllowed: async () => undefined },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://attacker.example/callback",
  })).rejects.toThrow("非法重定向地址");
  expect(inspectPrincipalSession).not.toHaveBeenCalled();
});
