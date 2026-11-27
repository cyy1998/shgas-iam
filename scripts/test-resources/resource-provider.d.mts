import type {
  ManagedResourceEndpoints,
  ManagedResourceProviderName,
  ManagedResourceRun,
} from "./managed-resources.mjs";
import type { RedisPreflightOptions } from "./redis-preflight.mjs";

export type ResourceServiceName = "postgres" | "redis" | "apisix";

export type RawProviderEndpoints = {
  postgresUrl?: string;
  redisUrl?: string;
  apisix?: { adminUrl: string; adminKey: string };
};

export type ResourceProviderPrepareContext = {
  run: ManagedResourceRun;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
};

export type ResourceProviderCleanupOptions = {
  cleanupTimeoutMs?: number;
  diagnostics?: boolean;
};

export type ResourceProvider = {
  readonly name: ManagedResourceProviderName;
  readonly composeFile?: string;
  prepare(
    neededServices: readonly ResourceServiceName[],
    context: ResourceProviderPrepareContext,
  ): Promise<RawProviderEndpoints>;
  cleanup(run: ManagedResourceRun, options?: ResourceProviderCleanupOptions): Promise<void>;
};

export type PrepareManagedTestResourcesContext = {
  root: string;
  env?: NodeJS.ProcessEnv;
  projectPrefix?: string;
  keep?: boolean;
  registryFile?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  cleanupTimeoutMs?: number;
  providers?:
    | ReadonlyMap<ManagedResourceProviderName, ResourceProvider>
    | Partial<Record<ManagedResourceProviderName, ResourceProvider>>;
  preparePostgresTemplate?: (
    run: ManagedResourceRun,
    options?: {
      databaseUrl?: string;
      env?: NodeJS.ProcessEnv;
      signal?: AbortSignal;
      timeoutMs?: number;
      cleanupTimeoutMs?: number;
    },
  ) => Promise<{ databaseUrl: string; templateName: string }>;
  verifyRedis?: (rawUrl: string, options?: RedisPreflightOptions) => Promise<void>;
  verifyApisix?: (
    endpoint: { adminUrl: string; adminKey: string },
    options?: { signal?: AbortSignal },
  ) => Promise<void>;
  onRunCreated?: (run: ManagedResourceRun) => void;
};

export type PreparedManagedTestResources = {
  provider: ManagedResourceProviderName;
  run: ManagedResourceRun;
  endpoints: ManagedResourceEndpoints;
  cleanup: (options?: ResourceProviderCleanupOptions) => Promise<void>;
};

export declare const resourceProviderEnv: "IAM_TEST_RESOURCE_PROVIDER";
export declare const knownResourceProviders: readonly ManagedResourceProviderName[];
export declare const knownResourceServices: readonly ResourceServiceName[];
export declare const externalEndpointEnvNames: readonly [
  "IAM_TEST_POSTGRES_URL",
  "IAM_TEST_REDIS_URL",
  "IAM_TEST_APISIX_ADMIN_URL",
  "IAM_TEST_APISIX_ADMIN_KEY",
];

export function registerResourceProvider(provider: ResourceProvider): void;
export function normalizeNeededServices(neededServices: readonly string[]): ResourceServiceName[];
export function parseResourceProviderName(env?: NodeJS.ProcessEnv): ManagedResourceProviderName;
export function resolveResourceProvider(
  env?: NodeJS.ProcessEnv,
  providers?: PrepareManagedTestResourcesContext["providers"],
): ResourceProvider;
export function validateProviderEnvironment(
  providerName: ManagedResourceProviderName,
  neededServices: readonly ResourceServiceName[],
  env?: NodeJS.ProcessEnv,
): RawProviderEndpoints | undefined;
export function prepareManagedTestResources(
  neededServices: readonly ResourceServiceName[],
  context: PrepareManagedTestResourcesContext,
): Promise<PreparedManagedTestResources>;
