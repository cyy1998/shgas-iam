import { relations } from "@iam/db/relations";
import { createPostgresTestHarness } from "@iam/test-support/postgres-test-harness";
import { drizzle } from "drizzle-orm/postgres-js";

export type ApiPostgresTestHarness = Awaited<ReturnType<typeof createApiPostgresTestHarness>>;

export async function createApiPostgresTestHarness(trackStop?: (close: () => Promise<void>) => void) {
  let stopped = false;
  const ready = Promise.resolve().then(() => {
    if (stopped) throw new Error("API PostgreSQL fixture stopped during initialization");
    return createPostgresTestHarness({ environment: process.env, name: "IAM_API_TEST_DATABASE_URL" });
  });
  try {
    trackStop?.(async () => {
      stopped = true;
      // The shared harness cleans up on setup failure. Otherwise wait for the clone before dropping it.
      const harness = await ready.catch(() => undefined);
      await harness?.close();
    });
  } catch (error) {
    stopped = true;
    await ready.catch(() => undefined);
    throw error;
  }
  const harness = await ready;
  if (stopped) {
    await harness.close();
    throw new Error("API PostgreSQL fixture stopped during initialization");
  }
  return { ...harness, db: drizzle({ client: harness.sql, relations }) };
}
