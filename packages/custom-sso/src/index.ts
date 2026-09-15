import type { UnifiedCustomSsoOperations } from "./unified";

export type CustomSso = ReturnType<UnifiedCustomSsoOperations["forOperation"]>;
export { CustomSsoClientDeliveryUnauthorizedError } from "./client-delivery.error";
export type { CustomSsoAuditPort, CustomSsoLoggerPort, CustomSsoOrcasPort, CustomSsoProjectionPermission } from "./custom-sso.port";
export { createSsoRedirectUrlValidator } from "./internal/redirect-url.validator";
export type { CustomSsoSubjectDeliveryCapability } from "./internal/subject-delivery";
export { CustomSsoTrafficGateUnavailableError } from "./internal/traffic-gate";
export { CustomSsoRequestMismatchError } from "./protocol-validation.error";
export * from "./unified";
