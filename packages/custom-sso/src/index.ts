import type { CustomSsoDeps } from "./custom-sso.port";
import { createAuthorizationGrantRedemption, createRedisAuthorizationGrantRedemptionStore } from "./grant";
import { createCustomSsoApplication } from "./internal/application";

export function createCustomSso(deps: CustomSsoDeps) {
  return createCustomSsoApplication({
    ...deps,
    authorizationGrantRedemption: createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: deps.random,
      store: createRedisAuthorizationGrantRedemptionStore({ redis: deps.redis }),
    }),
  });
}

export type CustomSso = ReturnType<typeof createCustomSso>;
export { CustomSsoClientDeliveryUnauthorizedError } from "./client-delivery.error";
export type { CustomSsoAuditPort, CustomSsoDeps, CustomSsoLoggerPort, CustomSsoOrcasPort, CustomSsoUserPort } from "./custom-sso.port";
export type { SsoPrincipalTokenSource } from "./internal/authorize-sso/authorize-sso.type";
export type { AuthorizeSsoInput, AuthorizeSsoOptions, AuthorizeSsoResult } from "./internal/authorize-sso/authorize-sso.type";
export type { CompleteSsoCallbackInput, CompleteSsoCallbackOptions, CompleteSsoCallbackResult } from "./internal/complete-sso-callback/complete-sso-callback.type";

export type { ExchangeSsoCodeInput, ExchangeSsoCodeOptions, ExchangeSsoCodeResult } from "./internal/exchange-sso-code/exchange-sso-code.type";
export type { CheckSsoLoginContinuationInput } from "./internal/login-continuation.type";
export type { CustomSsoSubjectDeliveryCapability } from "./internal/subject-delivery";
export { CustomSsoTrafficGateUnavailableError } from "./internal/traffic-gate";

export { PrincipalSessionInspectionUnavailableError } from "./principal-session-inspection.error";
export type { CustomSsoSubjectProjectionPort } from "./subject-projection.port";
