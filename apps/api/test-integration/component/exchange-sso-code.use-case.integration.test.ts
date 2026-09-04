import type {
  AuthenticatedIndependentClient,
} from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.port";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import { createExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { expect, mock, test } from "bun:test";

const authenticatedClient = {
  clientCode: "independent",
  configVersion: 7,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
};

const runtimeClient: CustomSsoClientRuntimeDto = {
  id: 7,
  clientCode: authenticatedClient.clientCode,
  clientName: "Independent",
  status: ClientStatus.Enable,
  isDelete: false,
  customSsoEnabled: true,
  customSsoConfig: {
    mode: CustomSsoClientMode.Independent,
    subjectClaims: [...authenticatedClient.subjectClaims],
    validRedirectUrls: ["https://app.example.com/callback"],
    callbackEndpoint: "https://app.example.com/callback",
    logoutEndpoint: "https://app.example.com/logout",
  },
  customSsoConfigVersion: authenticatedClient.configVersion,
};

const subject = {
  version: 2 as const,
  subjectIdentifier: "00000000-0000-4000-8000-000000001001",
};

const enabledTrafficGate = {
  assertIssuanceAllowed: async () => undefined,
};

test("authenticates with the dedicated credential verifier and returns only the Independent projection", async () => {
  const authenticate = mock(async () => authenticatedClient);
  const redeemIndependentGrant = mock(async () => ({
    credential: "iam-managed-credential",
    ttl: 3600,
    subject,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clientCredentials: { authenticate },
    clients: { findRuntimeRecord: mock(async () => runtimeClient) },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "secret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
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
    sid: "iam-managed-credential",
    ttl: 3600,
    subject,
  });

  expect(authenticate).toHaveBeenCalledWith("independent", "secret");
  expect(redeemIndependentGrant).toHaveBeenCalledTimes(1);
  expect(redeemIndependentGrant).toHaveBeenCalledWith({
    client: authenticatedClient,
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
    requestContext: {
      sourceApp: "iam",
      requestId: "req-token",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  });
});

test("rejects a wrong client secret before redeeming the authorization grant", async () => {
  const redeemIndependentGrant = mock(async () => ({
    credential: "should-not-exist",
    ttl: 3600,
    subject,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clientCredentials: { authenticate: mock(async () => null) },
    clients: { findRuntimeRecord: mock(async () => runtimeClient) },
    trafficGate: enabledTrafficGate,
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "wrong-secret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
  })).rejects.toThrow("非法Client");

  expect(redeemIndependentGrant).not.toHaveBeenCalled();
});

test("does not redeem an authenticated client's grant while traffic is suspended", async () => {
  const redeemIndependentGrant = mock(async () => ({
    credential: "should-not-exist",
    ttl: 3600,
    subject,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clientCredentials: { authenticate: mock(async () => authenticatedClient) },
    clients: { findRuntimeRecord: mock(async () => runtimeClient) },
    trafficGate: {
      assertIssuanceAllowed: async () => {
        throw new Error("traffic suspended");
      },
    },
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "secret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
  })).rejects.toThrow("traffic suspended");

  expect(redeemIndependentGrant).not.toHaveBeenCalled();
});

test("does not expose the supplied secret or a generic client record to grant redemption", async () => {
  const authenticate = mock(async () => authenticatedClient);
  const redeemIndependentGrant = mock(async () => ({
    credential: "iam-managed-credential",
    ttl: 3600,
    subject,
  }));
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clientCredentials: { authenticate },
    clients: { findRuntimeRecord: mock(async () => runtimeClient) },
    trafficGate: enabledTrafficGate,
  });

  await useCase.execute({
    clientCode: "independent",
    clientSecret: "unique-secret-sentinel",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
  });

  expect(JSON.stringify(redeemIndependentGrant.mock.calls))
    .not
    .toContain("unique-secret-sentinel");
  expect(JSON.stringify(redeemIndependentGrant.mock.calls))
    .not
    .toContain("clientSecret");
});

test("keeps one accepted runtime Snapshot through the credential side effect", async () => {
  const events: string[] = [];
  let current = runtimeClient;
  const findRuntimeRecord = mock(async () => {
    events.push("snapshot");
    return current;
  });
  const redeemIndependentGrant = mock(async (input: {
    client: AuthenticatedIndependentClient;
  }) => {
    events.push("redeem");
    current = {
      ...runtimeClient,
      customSsoConfigVersion: 8,
    };
    expect(input.client).toEqual(authenticatedClient);
    return {
      credential: "iam-managed-credential",
      ttl: 3600,
      subject,
    };
  });
  const useCase = createExchangeSsoCodeUseCase({
    authorizationGrants: { redeemIndependentGrant },
    clientCredentials: {
      authenticate: mock(async () => {
        events.push("authenticate");
        return authenticatedClient;
      }),
    },
    clients: { findRuntimeRecord },
    trafficGate: enabledTrafficGate,
  });

  const result = await useCase.execute({
    clientCode: "independent",
    clientSecret: "secret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
  });

  expect(result.sid).toBe("iam-managed-credential");
  expect(events).toEqual(["authenticate", "snapshot", "redeem"]);
  expect(findRuntimeRecord).toHaveBeenCalledTimes(1);
  expect(current.customSsoConfigVersion).toBe(8);
});
