import type { CustomSsoOperations } from "./operations";

export type CustomSso = ReturnType<CustomSsoOperations["forOperation"]> & Pick<CustomSsoOperations, "logout">;
export { CustomSsoClientDeliveryUnauthorizedError } from "./client-delivery.error";
export type { CustomSsoAuditPort, CustomSsoDeps, CustomSsoLoggerPort, CustomSsoOrcasPort } from "./custom-sso.port";
export type { SsoPrincipalTokenSource } from "./internal/authorize-sso/authorize-sso.type";
export type { AuthorizeSsoInput, AuthorizeSsoOptions, AuthorizeSsoResult } from "./internal/authorize-sso/authorize-sso.type";
export type { CompleteSsoCallbackInput, CompleteSsoCallbackOptions, CompleteSsoCallbackResult } from "./internal/complete-sso-callback/complete-sso-callback.type";
export type { ExchangeSsoCodeInput, ExchangeSsoCodeOptions, ExchangeSsoCodeResult } from "./internal/exchange-sso-code/exchange-sso-code.type";
export type { CheckSsoLoginContinuationInput } from "./internal/login-continuation.type";

export type { CustomSsoSubjectDeliveryCapability } from "./internal/subject-delivery";
export { CustomSsoTrafficGateUnavailableError } from "./internal/traffic-gate";
export { createCustomSsoOperations } from "./operations";
export type { CustomSsoOperations, CustomSsoOperationsDeps, CustomSsoProjectionPermission } from "./operations";

export { PrincipalSessionInspectionUnavailableError } from "./principal-session-inspection.error";
export type { CustomSsoSubjectProjectionPort } from "./subject-projection.port";
