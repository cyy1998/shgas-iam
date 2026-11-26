import { afterAll, beforeAll, beforeEach } from "bun:test";
import { type ApiPostgresTestHarness, createApiPostgresTestHarness } from "./postgres-test-harness";

export function useApiPostgresTestHarness() {
  let harness: ApiPostgresTestHarness;
  beforeAll(async () => {
    harness = await createApiPostgresTestHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });
  return () => harness;
}
