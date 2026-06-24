import type { OidcAccessTokenIndexMetadata } from "@iam/api-core/oidc";
import type { Redis } from "ioredis";
import {
  registerOidcAccessToken,
  revokeOidcAccessToken,
  revokeOidcAccessTokensForClient,
  revokeOidcAccessTokensForGlobalSession,
} from "@iam/api-core/oidc";

export function createOidcTokenStore(redis: Redis) {
  return {
    registerAccessToken(metadata: OidcAccessTokenIndexMetadata) {
      return registerOidcAccessToken(redis, metadata);
    },
    revokeAccessToken(tokenKey: string) {
      return revokeOidcAccessToken(redis, tokenKey);
    },
    revokeClientAccessTokens(clientId: string) {
      return revokeOidcAccessTokensForClient(redis, clientId);
    },
    revokeGlobalSessionAccessTokens(globalSessionId: string) {
      return revokeOidcAccessTokensForGlobalSession(redis, globalSessionId);
    },
  };
}

export type OidcTokenStore = ReturnType<typeof createOidcTokenStore>;
