import type { OidcAccountDto } from "@iam/domain/user";
import type { ResolvedGlobalSession } from "../interaction/global-session.ts";
import type { ProviderSessionBinding } from "../session/provider-session.ts";
import type { OidcAuthorizationClaim } from "./authorization-claim.ts";
import type { OidcClientRuntimeMetadata } from "./client-runtime-metadata.ts";

export interface ClaimsAccountReader {
  findBySubject: (subject: string) => Promise<OidcAccountDto | null>;
}

export interface ClaimsAuthorizationReader {
  buildClaim: (userId: number, iamClientId: number) => Promise<OidcAuthorizationClaim>;
}

export interface ClaimsClientRuntimeReader {
  findRuntime: (clientId: string) => Promise<OidcClientRuntimeMetadata | null>;
}

export interface ClaimsSessionResolver {
  resolveById: (sessionId: string) => Promise<ResolvedGlobalSession | null>;
}

export interface ClaimsProviderSessionBindingStore {
  read: (sessionUid: string) => Promise<ProviderSessionBinding | null>;
}

export interface ClaimsTokenRevoker {
  resolveAccessTokenCredential: (externalToken: string) => Promise<{
    credential: {
      credentialId: string;
      principalSessionId: string;
      bindingId?: string;
      clientCode: string;
    };
    metadata: {
      providerTokenKey: string;
      providerTokenId: string;
      oidcConfigVersion: number;
    };
  } | null>;
  revokeAccessTokenCredential: (credentialId: string) => Promise<unknown>;
}
