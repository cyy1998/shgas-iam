import { afterAll, beforeAll, beforeEach } from "bun:test";
import { type AuthApiPostgresTestHarness, createAuthApiPostgresTestHarness } from "./postgres-test-harness";

export function useAuthApiPostgresTestHarness() {
  let harness: AuthApiPostgresTestHarness;
  beforeAll(async () => {
    harness = await createAuthApiPostgresTestHarness();
  });
  beforeEach(async () => {
    await harness.reset();
  });
  afterAll(async () => {
    await harness?.close();
  });
  return () => harness;
}
