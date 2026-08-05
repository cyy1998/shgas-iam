import { createExchangeSsoCodeUseCase } from "@api/use-cases/sso/exchange-sso-code/exchange-sso-code.use-case";
import { SubjectClaim } from "@iam/contracts";
import { expect, mock, test } from "bun:test";

const authenticatedClient = {
  clientCode: "independent",
  configVersion: 7,
  subjectClaimCatalogVersion: 1 as const,
  subjectClaims: [SubjectClaim.SubjectIdentifier],
};

const subject = {
  version: 1 as const,
  subjectIdentifier: "00000000-0000-4000-8000-000000001001",
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
  });

  await expect(useCase.execute({
    clientCode: "independent",
    clientSecret: "wrong-secret",
    code: "auth-code",
    redirectUri: "https://app.example.com/callback",
  })).rejects.toThrow("非法Client");

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
