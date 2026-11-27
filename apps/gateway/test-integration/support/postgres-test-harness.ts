import { afterAll, beforeAll, beforeEach } from "bun:test";
import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

function createGatewayPostgresTestHarness() {
  return createDrizzlePostgresTestHarness({
    createDb: (client) => drizzle({ client, relations }),
  });
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
