import type { ClientStatus } from "@iam/contracts";

export type PrincipalSessionInspection = "absent" | "invalid" | "valid";

export interface LoginContinuationClientRecord {
  customSsoConfig: {
    validRedirectUrls: string[];
  } | null;
  customSsoEnabled: boolean;
  isDelete: boolean;
  status: ClientStatus;
}

export interface CheckSsoLoginContinuationDeps {
  clients: {
    findRuntimeRecord: (
      clientCode: string,
    ) => Promise<LoginContinuationClientRecord | null>;
  };
  principalSessions: {
    inspectPrincipalSession: (
      token?: string,
    ) => Promise<PrincipalSessionInspection>;
  };
  redirectUrls: {
    normalizeAllowed: (
      clientCode: string,
      redirectUrl: string,
      patterns: string[],
    ) => string | null;
  };
  trafficGate: {
    assertIssuanceAllowed: (clientCode: string) => Promise<void>;
  };
}
