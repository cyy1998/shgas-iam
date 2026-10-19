export const validationIssueMessages = {
  SERVICE_REQUIRED: "source manifest must contain exactly one service object",
  PLUGIN_CONFIGS_LOCATION: "top-level plugin_configs are not allowed; use service.plugin_configs",
  LOCAL_KEY_REQUIRED: "Resource must declare a string key",
  LOCAL_KEY_INVALID: "Resource keys must be lowercase kebab-case segments",
  LOCAL_KEY_DUPLICATE: "Resource keys must be unique within their collection",
  GENERATED_FIELD: "Generated resource fields must not be declared in source manifests",
  RESERVED_LABEL: "Reserved ownership and scope labels cannot be overridden in source manifests",
  UPSTREAM_REQUIRED: "Route must declare upstream unless terminal is true",
  REFERENCE_NOT_FOUND: "Resource references a missing target",
  PLUGIN_CONFIG_REFERENCE_INVALID: "Route plugin_config must reference a service.plugin_configs key",
  SSL_MATERIAL_REQUIRED: "SSL requires cert and an external private_key",
  SECRET_REFERENCE_REQUIRED: "Secret fields must use request placeholders or external secret references",
  TRUSTED_PROXY_ALL_ADDRESSES: "Trusted proxies must not include all addresses",
  IAM_TELEMETRY_REQUIRED: "IAM manifest must configure opentelemetry plugin_metadata",
  IAM_REQUEST_ID_REQUIRED: "IAM route must enable request-id through route plugins or plugin_config",
  IAM_TRACING_REQUIRED: "IAM route must enable opentelemetry through route plugins or plugin_config",
  IAM_LOGGER_FORBIDDEN: "IAM system logs must use stdout/stderr collection through Alloy",
} as const;

export type ValidationIssueCode = keyof typeof validationIssueMessages;
