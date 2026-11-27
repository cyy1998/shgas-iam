import process from "node:process";
import { prepareManagedGatewayApisix } from "../../apps/gateway/test-integration/support/apisix-provider.mjs";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import {
  parseApisixAdminConfig,
  testApisixAdminKeyEnv,
  testApisixAdminUrlEnv,
  verifyApisixAdminBaseline,
} from "./apisix-admin.mjs";
import { testPostgresUrlEnv, testRedisUrlEnv } from "./integration-selection.mjs";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  managedServiceEndpoint,
  saveManagedResourceRun,
  startManagedResources,
} from "./managed-resources.mjs";
import { nativeResourceProvider } from "./native-provider.mjs";
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

const finishOpts = (opts = {}) => ({ cleanupTimeoutMs: opts.cleanupTimeoutMs, diagnostics: Boolean(opts.diagnostics) });

export function validateExternalEnvironment(neededServices, env = process.env) {
  const missing = [
    ...(neededServices.includes("postgres") && !env[testPostgresUrlEnv]?.trim() ? [testPostgresUrlEnv] : []),
    ...(neededServices.includes("redis") && !env[testRedisUrlEnv]?.trim() ? [testRedisUrlEnv] : []),
    ...(neededServices.includes("apisix") && !env[testApisixAdminUrlEnv]?.trim() ? [testApisixAdminUrlEnv] : []),
    ...(neededServices.includes("apisix") && !env[testApisixAdminKeyEnv]?.trim() ? [testApisixAdminKeyEnv] : []),
  ];
  if (missing.length) {
    throw new Error(
      `IAM_TEST_RESOURCE_PROVIDER=external requires ${missing.join(", ")} for the selected services (${neededServices.join(", ")}); partial external configuration and Docker fallback are forbidden`,
    );
  }
  const raw = {};
  if (neededServices.includes("postgres")) {
    raw.postgresUrl = env[testPostgresUrlEnv].trim();
    requireDedicatedPostgresTestUrl({ name: TEST_POSTGRES_URL_ENV, value: raw.postgresUrl, environment: env });
  }
  if (neededServices.includes("redis")) raw.redisUrl = parseTestRedisUrl(env[testRedisUrlEnv], testRedisUrlEnv).baseUrl;
  if (neededServices.includes("apisix")) raw.apisix = parseApisixAdminConfig(env);
  return raw;
}

export const dockerResourceProvider = {
  name: "docker",
  composeFile: "scripts/test-resources/compose.yaml",
  async prepare(neededServices, { run, signal, timeoutMs, cleanupTimeoutMs }) {
    const cmdOpts = { signal, timeoutMs, cleanupTimeoutMs };
    if (run.record.services.length) await startManagedResources(run, cmdOpts);
    const raw = {};
    if (neededServices.includes("postgres")) {
      const { host, port } = await managedServiceEndpoint(run, "postgres", 5432, cmdOpts);
      raw.postgresUrl = `postgres://iam_test:iam_test@${host}:${port}/iam_test`;
    }
    if (neededServices.includes("redis")) {
      const { host, port } = await managedServiceEndpoint(run, "redis", 6379, cmdOpts);
      raw.redisUrl = `redis://${host}:${port}/0`;
    }
    if (neededServices.includes("apisix")) {
      raw.apisix = await prepareManagedGatewayApisix({ run, ...cmdOpts, verifyBaseline: false });
    }
    return raw;
  },
  async cleanup(run, options = {}) {
    if (!((run.record.status !== "created" && run.record.services.length) || run.record.apisix)) {
      run.record.status = "cleaned";
      await saveManagedResourceRun(run);
      return;
    }
    await finishManagedResourceRun(run, finishOpts(options));
  },
};

export const externalResourceProvider = {
  name: "external",
  async prepare(neededServices, { run, env = process.env }) {
    const raw = validateExternalEnvironment(neededServices, env);
    run.record.status = "ready";
    await saveManagedResourceRun(run);
    return raw;
  },
  cleanup: (run, options = {}) => finishManagedResourceRun(run, finishOpts(options)),
};

const registeredProviders = new Map([
  [dockerResourceProvider.name, dockerResourceProvider],
  [nativeResourceProvider.name, nativeResourceProvider],
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
  for (const s of neededServices ?? []) {
    if (!knownResourceServices.includes(s)) throw new Error(`Unknown integration test resource service: ${String(s)}`);
    if (!normalized.includes(s)) normalized.push(s);
  }
  return normalized;
}

export function parseResourceProviderName(env = process.env) {
  const raw = env[resourceProviderEnv];
  if (raw === undefined) return "docker";
  const name = raw.trim();
  if (!knownResourceProviders.includes(name)) {
    throw new Error(`Invalid ${resourceProviderEnv} "${raw}"; expected one of: ${knownResourceProviders.join(", ")}`);
  }
  return name;
}

export function resolveResourceProvider(env = process.env, providers = registeredProviders) {
  const name = parseResourceProviderName(env);
  const provider = providers instanceof Map ? providers.get(name) : providers?.[name];
  if (!provider) {
    const available = [...(providers instanceof Map ? providers.keys() : Object.keys(providers ?? {}))].join(", ");
    throw new Error(`${resourceProviderEnv}=${name} is not registered yet; available providers: ${available}`);
  }
  return provider;
}

export function validateProviderEnvironment(providerName, neededServices, env = process.env) {
  const services = normalizeNeededServices(neededServices);
  if (providerName === "external") return validateExternalEnvironment(services, env);
  const present = externalEndpointEnvNames.filter((name) => Boolean(env[name]?.trim()));
  if (present.length) {
    throw new Error(
      `External test resource variable(s) ${present.join(", ")} must not be set when ${resourceProviderEnv}=${providerName}; unset them or set ${resourceProviderEnv}=external`,
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

  const run = await createManagedResourceRun({
    root,
    provider: provider.name,
    composeFile: provider.composeFile,
    projectPrefix,
    services: services.filter((s) => s === "postgres" || s === "redis"),
    keep,
    registryFile,
  });
  onRunCreated?.(run);
  const cleanup = (opts = {}) =>
    provider.cleanup(run, {
      cleanupTimeoutMs: opts.cleanupTimeoutMs ?? cleanupTimeoutMs,
      diagnostics: Boolean(opts.diagnostics),
    });

  try {
    const raw = await provider.prepare(services, { run, env, signal, timeoutMs, cleanupTimeoutMs });
    signal?.throwIfAborted();
    const endpoints = {};
    if (services.includes("postgres")) {
      endpoints.postgres = await preparePostgresTemplate(run, {
        databaseUrl: raw?.postgresUrl,
        env,
        signal,
        timeoutMs,
        cleanupTimeoutMs,
      });
    }
    if (services.includes("redis")) {
      const { baseUrl, host, port } = parseTestRedisUrl(raw?.redisUrl, testRedisUrlEnv);
      await verifyRedis(baseUrl, { signal, timeoutMs: Math.min(timeoutMs ?? 5000, 5000) });
      endpoints.redis = { url: baseUrl, host, port };
    }
    if (services.includes("apisix")) {
      const ep = parseApisixAdminConfig({
        [testApisixAdminUrlEnv]: raw?.apisix?.adminUrl,
        [testApisixAdminKeyEnv]: raw?.apisix?.adminKey,
      });
      await verifyApisix(ep, { signal });
      endpoints.apisix = ep;
    }
    if (Object.keys(endpoints).length) {
      run.record.endpoints = endpoints;
      await saveManagedResourceRun(run);
    }
    return { provider: provider.name, run, endpoints, cleanup };
  } catch (error) {
    try {
      await cleanup({ cleanupTimeoutMs, diagnostics: true });
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Test resource preparation and cleanup failed");
    }
    throw error;
  }
}
