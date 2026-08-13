import type { CustomSsoSubjectProjectionV1 } from "@iam/client-subject-projection/custom-sso";
import type { SubjectClaimName } from "@iam/contracts";
import type { ExchangeSsoCodeOptions } from "./exchange-sso-code.type";

export interface AuthenticatedIndependentClient {
  readonly clientCode: string;
  readonly configVersion: number;
  readonly subjectClaimCatalogVersion: 1;
  readonly subjectClaims: readonly SubjectClaimName[];
}

export interface IndependentAuthorizationGrantPort {
  redeemIndependentGrant: (input: {
    client: AuthenticatedIndependentClient;
    code: string;
    redirectUri: string;
    requestContext?: ExchangeSsoCodeOptions["requestContext"];
  }) => Promise<{
    credential: string;
    ttl: number;
    subject: CustomSsoSubjectProjectionV1;
  }>;
}

export interface ExchangeSsoCodeTrafficGatePort {
  assertIssuanceAllowed: (clientCode: string) => Promise<void>;
}

export interface ExchangeSsoCodeDeps {
  authorizationGrants: IndependentAuthorizationGrantPort;
  clientCredentials: {
    authenticate: (
      clientCode: string,
      secret: string,
    ) => Promise<AuthenticatedIndependentClient | null>;
  };
  trafficGate: ExchangeSsoCodeTrafficGatePort;
}
