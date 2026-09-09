import type { IssuedCredential, ProtocolArtifact } from "@iam/session-kernel";

import type { AdapterPayload } from "oidc-provider";
import type {
  CreateOidcAuthorizationCodeSnapshotInput,
  OidcClaimsSnapshot,
} from "../provider/claims/claims-snapshot.ts";
import type {
  ProviderSessionBinding,
  ProviderSessionLifecycleFence,
  ProviderSessionPrincipalAnchor,
} from "../session/provider-session.ts";

export interface AdapterClientRuntimeReader {
  findRuntime: (clientId: string) => Promise<AdapterPayload | null | undefined>;
}

export interface AdapterClientVersionReader {
  findActiveVersion: (clientId: string) => Promise<number | null>;
}

export interface AdapterClaimsSnapshotIssuer<
  TClaimsSnapshot = OidcClaimsSnapshot,
> {
  createAuthorizationCodeSnapshot: (
    input: CreateOidcAuthorizationCodeSnapshotInput,
  ) => Promise<TClaimsSnapshot>;
}

export interface AdapterProviderSessionBindingStore {
  destroyProviderSession: (
    sessionUid: string,
    expected?: ProviderSessionLifecycleFence,
  ) => Promise<boolean>;
  read: (sessionUid: string, clientCode: string) => Promise<ProviderSessionBinding | null>;
  consumeStaged: (input: {
    accountId: string;
    authorizationAttemptId: string;
    clientCode: string;
    providerSessionUid: string;
  }) => Promise<ProviderSessionBinding | null>;
  ensureClientBinding: (input: {
    accountId: string;
    clientCode: string;
    anchorGeneration: string;
    oidcConfigVersion: number;
    principalSessionId: string;
    providerSessionUid: string;
  }) => Promise<ProviderSessionBinding | null>;
  readPrincipalAnchor: (
    sessionUid: string,
    accountId: string,
  ) => Promise<ProviderSessionPrincipalAnchor | null>;
}

export interface AdapterOidcSessionKernel {
  resolveAuthorizationCodeSessionLifetime: (providerCodeId: string, serializedProviderCode: string) => Promise<{ remainingSeconds: number; artifact: ProtocolArtifact; serializedProviderCode: string } | null>;
  registerAuthorizationCodeArtifact: (input: {
    providerCodeId: string;
    payload: AdapterPayload;
    expiresIn: number;
    binding: ProviderSessionBinding | null;
  }) => Promise<boolean>;
  consumeAuthorizationCodeArtifact: (providerCodeId: string, artifact: ProtocolArtifact) => Promise<unknown>;
  registerAccessTokenCredential: (input: {
    providerTokenId: string;
    providerTokenKey: string;
    payload: AdapterPayload;
    expiresIn: number;
    binding: ProviderSessionBinding | null;
  }) => Promise<IssuedCredential | null>;
  resolveAccessTokenCredential: (externalToken: string) => Promise<{
    credential: IssuedCredential;
    metadata: {
      providerTokenKey: string;
      providerTokenId: string;
      oidcConfigVersion: number;
    };
  } | null>;
  revokeAccessTokenCredential: (credentialId: string) => Promise<unknown>;
}

export interface AdapterTokenRegistry {
  revokeAccessToken: (tokenKey: string) => Promise<void>;
}
