export declare const testApisixAdminUrlEnv: "IAM_TEST_APISIX_ADMIN_URL";
export declare const testApisixAdminKeyEnv: "IAM_TEST_APISIX_ADMIN_KEY";
export declare const apisixResourceEndpoints: readonly [
  "upstreams",
  "plugin_metadata",
  "plugin_configs",
  "services",
  "consumers",
  "ssls",
  "routes",
];

export type ApisixAdminEndpoint = {
  adminUrl: string;
  adminKey: string;
};

export type ApisixAdminReadinessOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetch?: typeof globalThis.fetch;
};

export type ApisixAdminBaselineOptions = {
  signal?: AbortSignal;
  requestTimeoutMs?: number;
  fetch?: typeof globalThis.fetch;
};

export function parseApisixAdminConfig(environment?: NodeJS.ProcessEnv): ApisixAdminEndpoint;
export function waitForApisixAdmin(
  adminUrl: string,
  adminKey: string,
  options?: ApisixAdminReadinessOptions,
): Promise<void>;
export function assertApisixAdminEmpty(
  adminUrl: string,
  adminKey: string,
  options?: ApisixAdminBaselineOptions,
): Promise<void>;
export function verifyApisixAdminBaseline(
  endpoint: ApisixAdminEndpoint,
  options?: ApisixAdminReadinessOptions,
): Promise<void>;
