import { relations } from "@iam/db/relations";
import { requireExternalTestUrl } from "@iam/test-support/external-test-resources";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { parseIntegrationApiEnv } from "@integration-api/env";
import { drizzle } from "drizzle-orm/postgres-js";

export type IntegrationPostgresTestHarness = Awaited<ReturnType<typeof createIntegrationPostgresTestHarness>>;

export async function createIntegrationPostgresTestHarness() {
  const harness = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_INTEGRATION_API_TEST_DATABASE_URL",
  });
  return { ...harness, db: drizzle({ client: harness.sql, relations }) };
}

export function requireIntegrationRedisUrl() {
  return requireExternalTestUrl({
    environment: process.env,
    lane: "Integration",
    name: "IAM_INTEGRATION_API_TEST_REDIS_URL",
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
