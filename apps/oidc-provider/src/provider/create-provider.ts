import type { Configuration, interactionPolicy } from "oidc-provider";
import type { OidcProviderEnv } from "../env.ts";
import type { OidcLogger } from "../lib/logger.ts";
import type { ClientAuthRateLimiter } from "../security/client-auth-rate-limit.ts";
import type { SigningKey } from "../security/signing-keys.ts";
import type { OidcClaimsAdapter } from "./claims.ts";
import type { ProviderClientSecretVerifier } from "./client-auth.ts";
import type { OidcClientTrafficGate } from "./client-traffic-gate.ts";
import type {
  ProviderMiddlewareOidcSessionAdapter,
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
  claims: OidcClaimsAdapter;
  interactionPolicy: interactionPolicy.Prompt[];
  clientSecretVerifier: ProviderClientSecretVerifier;
  clientAuthRateLimiter: ClientAuthRateLimiter;
  oidcSession: ProviderMiddlewareOidcSessionAdapter;
  trafficGate: OidcClientTrafficGate;
}

export function createOidcProvider(options: CreateOidcProviderOptions) {
  const provider = new Provider(options.env.oidc.issuer, createProviderConfiguration(options.env, {
    adapter: options.adapter,
    claims: options.claims,
    currentSigningKey: options.signingKeys.current,
    previousSigningKey: options.signingKeys.previous,
    interactionPolicy: options.interactionPolicy,
    trafficGate: options.trafficGate,
  }));

  provider.proxy = options.env.oidc.trustProxy;
  registerClientAuthentication(provider, options.clientSecretVerifier);
  registerProtocolModelPayloadExtensions(provider);
  registerProviderMiddleware(provider, {
    env: options.env,
    clientAuthRateLimiter: options.clientAuthRateLimiter,
    oidcSession: options.oidcSession,
  });
  registerProviderEvents(provider, options.logger, {
    cookieName: options.env.oidc.globalSessionCookie,
    cookieSecure: options.env.oidc.cookieSecure,
  });

  return provider;
}
