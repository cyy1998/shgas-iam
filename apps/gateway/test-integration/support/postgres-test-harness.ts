import { afterAll, beforeAll, beforeEach } from "bun:test";
import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

async function createGatewayPostgresTestHarness() {
  const harness = await createPostgresTestHarness({
    environment: process.env,
    name: "IAM_GATEWAY_TEST_DATABASE_URL",
  });
  return { ...harness, db: drizzle({ client: harness.sql, relations }) };
}

export type GatewayPostgresTestHarness = Awaited<ReturnType<typeof createGatewayPostgresTestHarness>>;

export function useGatewayPostgresTestHarness() {
  let harness: GatewayPostgresTestHarness;
  beforeAll(async () => {
    harness = await createGatewayPostgresTestHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });
  return () => harness;
}
