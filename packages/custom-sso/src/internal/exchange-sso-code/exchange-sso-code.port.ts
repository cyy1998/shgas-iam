import type { SubjectClaimName } from "@iam/contracts";
import type { CustomSsoSubjectProjection } from "@iam/custom-sso/wire";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { ExchangeSsoCodeOptions } from "./exchange-sso-code.type";

export interface AuthenticatedIndependentClient {
  readonly clientCode: string;
  readonly configVersion: number;
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
    subject: CustomSsoSubjectProjection;
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
  clients: {
    findRuntimeRecord: (
      clientCode: string,
    ) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  trafficGate: ExchangeSsoCodeTrafficGatePort;
}
