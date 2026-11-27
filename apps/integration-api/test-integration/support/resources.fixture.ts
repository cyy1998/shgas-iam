import { relations } from "@iam/db/relations";
import { requireExternalTestUrl, TEST_REDIS_URL_ENV } from "@iam/test-support/external-test-resources";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { parseIntegrationApiEnv } from "@integration-api/env";
import { drizzle } from "drizzle-orm/postgres-js";

export type IntegrationPostgresTestHarness = Awaited<ReturnType<typeof createIntegrationPostgresTestHarness>>;

export function createIntegrationPostgresTestHarness() {
  return createDrizzlePostgresTestHarness({
    createDb: (client) => drizzle({ client, relations }),
  });
}

export function requireIntegrationRedisUrl() {
  return requireExternalTestUrl({
    environment: process.env,
    lane: "Integration",
    name: TEST_REDIS_URL_ENV,
  });
}

export function testEnvironment(databaseUrl: string, overrides: NodeJS.ProcessEnv = {}) {
  return parseIntegrationApiEnv({
    NODE_ENV: "test",
    IAM_INTEGRATION_API_SESSION_KERNEL_NAMESPACE: "iam:session",
    IAM_INTEGRATION_API_DATABASE_URL: databaseUrl,
    IAM_INTEGRATION_API_REDIS_URL: requireIntegrationRedisUrl(),
    ...overrides,
  });
}
