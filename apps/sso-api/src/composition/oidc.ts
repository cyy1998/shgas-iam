import { createRouter } from "@iam/api-core/core/create-router";
import {
  createOidcAuthorization,
  createOidcLogout,
  createOidcTokens,
  createOidcUserInfo,
  type OidcAuthorizationOptions,
  type OidcClientAuthRateLimiter,
  type OidcHintVerificationPort,
  OidcProtocolError,
  OidcStateUnavailableError,
  type OidcTokenOptions,
} from "@iam/oidc";
import type { createSubjectAccessOperations } from "@iam/subject-access";
import { createOidcHttpRouter } from "@sso-api/routes/oidc/oidc.http";
import { documentOidcRoutes } from "@sso-api/routes/oidc/oidc.openapi";

export interface OidcCompositionOptions {
  authorization: OidcAuthorizationOptions;
  tokens?: Pick<OidcTokenOptions, "credentials" | "signing" | "tokenTtlSeconds" | "failureEffectTimeoutMs">;
  logout: { verification: OidcHintVerificationPort; confirmationTtlSeconds: number };
  subjectFacts: OidcTokenOptions["subjectFacts"];
  operations: ReturnType<typeof createSubjectAccessOperations>;
  clientAuthRateLimiter?: OidcClientAuthRateLimiter;
  trustProxy: boolean;
  issuers: { internal: string; external: string };
  secureCookies: boolean;
  loginEndpoint: string;
  wechatQrEnabled?: boolean;
  logger: {
    warn: (context: object, message: string) => void;
    error: (context: object, message: string) => void;
  };
}

export function createOidcComposition(options: OidcCompositionOptions) {
  const { authorization, subjectFacts, logger } = options;
  const oidc = createOidcAuthorization(authorization);
  const oidcTokens = options.tokens && createOidcTokens({ ...authorization, ...options.tokens, subjectFacts });
  const oidcLogout = createOidcLogout({ ...authorization, ...options.logout });
  const router = createRouter();
  router.route(
    "/",
    createOidcHttpRouter({
      authorization: oidc,
      tokens: oidcTokens,
      logout: oidcLogout,
      userInfo: oidcTokens && createOidcUserInfo({ tokens: oidcTokens, subjectFacts }),
      operations: options.operations,
      trustProxy: options.trustProxy,
      clientAuthRateLimiter: options.clientAuthRateLimiter,
      issuers: options.issuers,
      secureCookies: options.secureCookies,
      loginEndpoint: options.loginEndpoint,
      wechatQrEnabled: options.wechatQrEnabled,
      reportProtocolFailure: (failure) =>
        logger[failure.outcome === "unavailable" ? "error" : "warn"](
          { event: failure.outcome === "unavailable" ? "oidc_server_error" : "oidc_protocol_error", ...failure },
          "OIDC request failed",
        ),
      reportAdmissionDenied: (clientCode, request) =>
        logger.warn(
          { ...request, event: "application.admission.denied", outcome: "no-match", protocol: "oidc", clientCode },
          "Application admission denied",
        ),
      reportLogoutEffect: (effect, request) =>
        logger.warn(
          {
            ...request,
            event: "oidc_logout_effect",
            choice: "choice" in effect ? effect.choice : "confirm",
            revocation: effect.revocation,
          },
          "OIDC logout effect",
        ),
      reportExchangeFailure: (failure, request) =>
        logger.warn(
          {
            ...request,
            event: "oidc_exchange_failed",
            consumption: failure.consumption,
            failure:
              failure.failure instanceof OidcProtocolError
                ? failure.failure.errorCode
                : failure.failure instanceof OidcStateUnavailableError
                  ? `state_${failure.failure.outcome}`
                  : "unavailable",
            revocation: failure.revocation,
          },
          "OIDC exchange failure effect",
        ),
    }),
  );
  documentOidcRoutes(router, Boolean(oidcTokens));
  return { router, oidc, oidcTokens, oidcLogout };
}
