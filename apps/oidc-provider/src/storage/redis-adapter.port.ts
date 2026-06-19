import type { OidcAccessTokenIndexMetadata } from "@iam/api-core/oidc";
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

export interface AdapterTokenRegistry {
  registerAccessToken: (metadata: OidcAccessTokenIndexMetadata) => Promise<void>;
  revokeAccessToken: (tokenKey: string) => Promise<void>;
}
