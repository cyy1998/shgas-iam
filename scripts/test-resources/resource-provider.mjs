import process from "node:process";
import {
  parseApisixAdminConfig,
  testApisixAdminKeyEnv,
  testApisixAdminUrlEnv,
  verifyApisixAdminBaseline,
} from "./apisix-admin.mjs";
import { dockerResourceProvider } from "./docker-provider.mjs";
import { externalResourceProvider, validateExternalEnvironment } from "./external-provider.mjs";
import { testPostgresUrlEnv, testRedisUrlEnv } from "./integration-selection.mjs";
import { createManagedResourceRun, saveManagedResourceRun } from "./managed-resources.mjs";
import { prepareManagedPostgresTemplate } from "./postgres-template.mjs";
import { parseTestRedisUrl, verifyRedisDatabaseSlotSupport } from "./redis-preflight.mjs";

export const resourceProviderEnv = "IAM_TEST_RESOURCE_PROVIDER";
export const knownResourceProviders = ["docker", "native", "external"];
export const knownResourceServices = ["postgres", "redis", "apisix"];
export const externalEndpointEnvNames = [
  testPostgresUrlEnv,
  testRedisUrlEnv,
  testApisixAdminUrlEnv,
  testApisixAdminKeyEnv,
];

const registeredProviders = new Map([
  [dockerResourceProvider.name, dockerResourceProvider],
  [externalResourceProvider.name, externalResourceProvider],
]);

export function registerResourceProvider(provider) {
  if (!provider || typeof provider !== "object" || !knownResourceProviders.includes(provider.name)) {
    throw new Error(`Cannot register unknown resource provider: ${String(provider?.name)}`);
  }
  if (typeof provider.prepare !== "function" || typeof provider.cleanup !== "function") {
    throw new Error(`Resource provider "${provider.name}" must implement prepare() and cleanup()`);
  }
  registeredProviders.set(provider.name, provider);
}

export function normalizeNeededServices(neededServices) {
  const normalized = [];
  for (const service of neededServices ?? []) {
    if (!knownResourceServices.includes(service)) {
      throw new Error(`Unknown integration test resource service: ${String(service)}`);
    }
    if (!normalized.includes(service)) normalized.push(service);
  }
  return normalized;
}

export function parseResourceProviderName(env = process.env) {
  const raw = env[resourceProviderEnv];
  if (raw === undefined) return "docker";
  const normalized = raw.trim();
  if (!knownResourceProviders.includes(normalized)) {
    throw new Error(`Invalid ${resourceProviderEnv} "${raw}"; expected one of: ${knownResourceProviders.join(", ")}`);
  }
  return normalized;
}

export function resolveResourceProvider(env = process.env, providers = registeredProviders) {
  const name = parseResourceProviderName(env);
  const provider = providers instanceof Map ? providers.get(name) : providers?.[name];
  if (!provider) {
    throw new Error(
      `${resourceProviderEnv}=${name} is not registered yet; available providers: ${[...(providers instanceof Map ? providers.keys() : Object.keys(providers ?? {}))].join(", ")}`,
    );
  }
  return provider;
}

export function validateProviderEnvironment(providerName, neededServices, env = process.env) {
  const services = normalizeNeededServices(neededServices);
  if (providerName === "external") {
    return validateExternalEnvironment(services, env);
  }
  const presentExternal = externalEndpointEnvNames.filter((name) => Boolean(env[name]?.trim()));
  if (presentExternal.length > 0) {
    throw new Error(
      `External test resource variable(s) ${presentExternal.join(", ")} must not be set when ${resourceProviderEnv}=${providerName}; unset them or set ${resourceProviderEnv}=external`,
    );
  }
  return undefined;
}

export async function prepareManagedTestResources(neededServices, context) {
  const {
    root,
    env = process.env,
    projectPrefix,
    keep = false,
    registryFile,
    signal,
    timeoutMs,
    cleanupTimeoutMs,
    providers = registeredProviders,
    preparePostgresTemplate = prepareManagedPostgresTemplate,
    verifyRedis = verifyRedisDatabaseSlotSupport,
    verifyApisix = verifyApisixAdminBaseline,
    onRunCreated,
  } = context;

  const services = normalizeNeededServices(neededServices);
  const provider = resolveResourceProvider(env, providers);
  validateProviderEnvironment(provider.name, services, env);
  signal?.throwIfAborted();

  const coreServices = services.filter((service) => service === "postgres" || service === "redis");
  const run = await createManagedResourceRun({
    root,
    provider: provider.name,
    composeFile: provider.composeFile,
    projectPrefix,
    services: coreServices,
    keep,
    registryFile,
  });
  onRunCreated?.(run);

  const cleanup = async (cleanupOptions = {}) => {
    await provider.cleanup(run, {
      cleanupTimeoutMs: cleanupOptions.cleanupTimeoutMs ?? cleanupTimeoutMs,
      diagnostics: Boolean(cleanupOptions.diagnostics),
    });
  };

  try {
    const rawEndpoints = await provider.prepare(services, {
      run,
      env,
      signal,
      timeoutMs,
      cleanupTimeoutMs,
    });
    signal?.throwIfAborted();

    const endpoints = {};
    if (services.includes("postgres")) {
      endpoints.postgres = await preparePostgresTemplate(run, {
        databaseUrl: rawEndpoints?.postgresUrl,
        env,
        signal,
        timeoutMs,
        cleanupTimeoutMs,
      });
    }
    if (services.includes("redis")) {
      const parsedRedis = parseTestRedisUrl(rawEndpoints?.redisUrl, testRedisUrlEnv);
      await verifyRedis(parsedRedis.baseUrl, {
        signal,
        timeoutMs: Math.min(timeoutMs ?? 5000, 5000),
      });
      endpoints.redis = {
        url: parsedRedis.baseUrl,
        host: parsedRedis.host,
        port: parsedRedis.port,
      };
    }
    if (services.includes("apisix")) {
      const apisixEndpoint = parseApisixAdminConfig({
        [testApisixAdminUrlEnv]: rawEndpoints?.apisix?.adminUrl,
        [testApisixAdminKeyEnv]: rawEndpoints?.apisix?.adminKey,
      });
      await verifyApisix(apisixEndpoint, { signal });
      endpoints.apisix = apisixEndpoint;
    }

    if (Object.keys(endpoints).length > 0) {
      run.record.endpoints = endpoints;
      await saveManagedResourceRun(run);
    }

    return {
      provider: provider.name,
      run,
      endpoints,
      cleanup,
    };
  } catch (error) {
    try {
      await cleanup({ cleanupTimeoutMs, diagnostics: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Test resource preparation and cleanup failed");
    }
    throw error;
  }
}
