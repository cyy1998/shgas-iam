import process from "node:process";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import { parseApisixAdminConfig, testApisixAdminKeyEnv, testApisixAdminUrlEnv } from "./apisix-admin.mjs";
import { testPostgresUrlEnv, testRedisUrlEnv } from "./integration-selection.mjs";
import { finishManagedResourceRun, saveManagedResourceRun } from "./managed-resources.mjs";
import { parseTestRedisUrl } from "./redis-preflight.mjs";

export function validateExternalEnvironment(neededServices, env = process.env) {
  const missing = [];
  if (neededServices.includes("postgres") && !env[testPostgresUrlEnv]?.trim()) {
    missing.push(testPostgresUrlEnv);
  }
  if (neededServices.includes("redis") && !env[testRedisUrlEnv]?.trim()) {
    missing.push(testRedisUrlEnv);
  }
  if (neededServices.includes("apisix")) {
    if (!env[testApisixAdminUrlEnv]?.trim()) missing.push(testApisixAdminUrlEnv);
    if (!env[testApisixAdminKeyEnv]?.trim()) missing.push(testApisixAdminKeyEnv);
  }
  if (missing.length > 0) {
    throw new Error(
      `IAM_TEST_RESOURCE_PROVIDER=external requires ${missing.join(", ")} for the selected services (${neededServices.join(", ")}); partial external configuration and Docker fallback are forbidden`,
    );
  }

  const rawEndpoints = {};
  if (neededServices.includes("postgres")) {
    const postgresUrl = env[testPostgresUrlEnv].trim();
    requireDedicatedPostgresTestUrl({
      name: TEST_POSTGRES_URL_ENV,
      value: postgresUrl,
      environment: env,
    });
    rawEndpoints.postgresUrl = postgresUrl;
  }
  if (neededServices.includes("redis")) {
    const parsedRedis = parseTestRedisUrl(env[testRedisUrlEnv], testRedisUrlEnv);
    rawEndpoints.redisUrl = parsedRedis.baseUrl;
  }
  if (neededServices.includes("apisix")) {
    rawEndpoints.apisix = parseApisixAdminConfig(env);
  }
  return rawEndpoints;
}

export const externalResourceProvider = {
  name: "external",
  async prepare(neededServices, context) {
    const { run, env = process.env } = context;
    const rawEndpoints = validateExternalEnvironment(neededServices, env);
    run.record.status = "ready";
    await saveManagedResourceRun(run);
    return rawEndpoints;
  },
  async cleanup(run, options = {}) {
    await finishManagedResourceRun(run, {
      cleanupTimeoutMs: options.cleanupTimeoutMs,
      diagnostics: Boolean(options.diagnostics),
    });
  },
};
