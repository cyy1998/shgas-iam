import type { Configuration, interactionPolicy } from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { ClientAuthRateLimiter } from "../security/client-auth-rate-limit.ts";
import type { SigningKey } from "../security/signing-keys.ts";
import type { OidcClaimsService } from "./claims.ts";
import type { ProviderClientSecretVerifier } from "./client-auth.ts";
import type {
  ProviderMiddlewareGlobalSessionStore,
  ProviderMiddlewareTokenStore,
} from "./middleware.ts";
import Provider from "oidc-provider";
import { registerClientAuthentication } from "./client-auth.ts";
import { createProviderConfiguration } from "./configuration.ts";
import { registerProviderEvents } from "./events.ts";
import { registerProviderMiddleware } from "./middleware.ts";
import { registerProtocolModelPayloadExtensions } from "./protocol-models.ts";

export interface CreateOidcProviderOptions {
  env: OidcProviderEnv;
  logger: OidcLogger;
  signingKeys: {
    current: SigningKey;
    previous?: SigningKey;
  };
  adapter: NonNullable<Configuration["adapter"]>;
  claims: OidcClaimsService;
  interactionPolicy: interactionPolicy.Prompt[];
  clientSecretVerifier: ProviderClientSecretVerifier;
  clientAuthRateLimiter: ClientAuthRateLimiter;
  globalSessions: ProviderMiddlewareGlobalSessionStore;
  tokens: ProviderMiddlewareTokenStore;
}

export function createOidcProvider(options: CreateOidcProviderOptions) {
  const provider = new Provider(options.env.OIDC_ISSUER, createProviderConfiguration(options.env, {
    adapter: options.adapter,
    claims: options.claims,
    currentSigningKey: options.signingKeys.current,
    previousSigningKey: options.signingKeys.previous,
    interactionPolicy: options.interactionPolicy,
  }));

  provider.proxy = options.env.OIDC_TRUST_PROXY;
  registerClientAuthentication(provider, options.clientSecretVerifier);
  registerProtocolModelPayloadExtensions(provider);
  registerProviderMiddleware(provider, {
    env: options.env,
    clientAuthRateLimiter: options.clientAuthRateLimiter,
    globalSessions: options.globalSessions,
    tokens: options.tokens,
  });
  registerProviderEvents(provider, options.logger);

  return provider;
}
