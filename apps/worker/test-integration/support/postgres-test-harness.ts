import { afterAll, beforeAll, beforeEach } from "bun:test";
import { relations } from "@iam/db/relations";
import { createDrizzlePostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type WorkerPostgresTestHarness = Awaited<ReturnType<typeof createWorkerPostgresTestHarness>>;

export function createWorkerPostgresTestHarness() {
  return createDrizzlePostgresTestHarness({
    client: { max: 4 },
    createDb: (client) => drizzle({ client, relations }),
  });
}

export function useWorkerPostgresTestHarness() {
  let harness: WorkerPostgresTestHarness;
  beforeAll(async () => {
    harness = await createWorkerPostgresTestHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });
  return () => harness;
}
