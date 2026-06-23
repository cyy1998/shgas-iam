import type { IssuedCredential } from "@iam/api-core/session/kernel";
import type { AdapterPayload } from "oidc-provider";
import type { ProviderSessionBinding } from "../session/provider-session.ts";

export interface AdapterClientRuntimeReader {
  findRuntime: (clientId: string) => Promise<AdapterPayload | null | undefined>;
}

export interface AdapterClientVersionReader {
  findActiveVersion: (clientId: string) => Promise<number | null>;
}

export interface AdapterProviderSessionBindingStore {
  read: (sessionUid: string) => Promise<ProviderSessionBinding | null>;
  consumeStaged: (accountId: string, sessionUid: string) => Promise<ProviderSessionBinding | null>;
}

export interface AdapterOidcSessionKernel {
  registerAuthorizationCodeArtifact: (input: {
    providerCodeId: string;
    payload: AdapterPayload;
    expiresIn: number;
    binding: ProviderSessionBinding | null;
  }) => Promise<boolean>;
  consumeAuthorizationCodeArtifact: (providerCodeId: string) => Promise<unknown>;
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
  revokeClientProtocol: (clientId: string, reason: "client_config_changed") => Promise<unknown>;
}

export interface AdapterTokenRegistry {
  revokeAccessToken: (tokenKey: string) => Promise<void>;
}
