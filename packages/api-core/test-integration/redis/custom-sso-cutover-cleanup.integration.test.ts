import {
  createCustomSsoCleanupRedisHarness,
} from "@iam/api-core/testing/custom-sso-cleanup-redis-harness";
import { afterAll, beforeAll, expect, test } from "bun:test";

const targetEntries = new Map([
  ["global_session:real-redis-cleanup", "legacy-principal-session"],
  ["auth_code:real-redis-cleanup", "legacy-authorization-grant"],
  ["local_gateway_session:real-redis-cleanup", "legacy-local-session"],
  ["local_session_reverse:real-redis-cleanup", "legacy-reverse-index"],
  ["local_session_set:real-redis-cleanup", "legacy-session-set"],
  ["custom-sso:local-session-payload:real-redis-cleanup", "legacy-payload"],
]);

const nonTargetEntries = new Map([
  ["iam:test:cleanup:sentinel", "must-survive-cleanup"],
  ["oidc:model:AccessToken:real-redis-cleanup", "current-oidc-artifact"],
  ["oidc:provider-session-binding:real-redis-cleanup", "current-provider-binding"],
]);

const beforeInventory = sortedMap([...targetEntries, ...nonTargetEntries]);
const afterInventory = sortedMap(nonTargetEntries);
let harness: Awaited<ReturnType<typeof createCustomSsoCleanupRedisHarness>> | undefined;

beforeAll(async () => {
  harness = await createCustomSsoCleanupRedisHarness();
});

afterAll(async () => {
  await harness?.close();
});

test("cleanup CLI proves its exact destructive boundary on an exclusive ACL-restricted Redis", async () => {
  if (harness === undefined)
    throw new Error("Custom SSO cleanup Redis harness was not initialized");

  await harness.assertFlushCommandsDenied();
  await harness.seed(beforeInventory);
  expect(await harness.inventory()).toEqual(beforeInventory);

  const dryRun = await harness.runCleanup("--dry-run", 0);
  expect(dryRun.output).toContain(
    "Legacy cleanup custom-sso-cutover dry-run completed: matched 6, deleted 0.",
  );
  expect(await harness.inventory()).toEqual(beforeInventory);

  const blockedVerify = await harness.runCleanup("--verify", 1);
  expect(blockedVerify.output).toContain(
    "Legacy cleanup custom-sso-cutover verify failed: matched 6, deleted 0.",
  );
  expect(await harness.inventory()).toEqual(beforeInventory);

  const apply = await harness.runCleanup("--apply", 0);
  expect(apply.output).toContain(
    "Legacy cleanup custom-sso-cutover apply completed: matched 6, deleted 6.",
  );
  const inventoryAfterApply = await harness.inventory();
  expect(inventoryAfterApply).toEqual(afterInventory);
  expect([...beforeInventory.keys()].filter(key => !inventoryAfterApply.has(key)).sort())
    .toEqual([...targetEntries.keys()].sort());
  expect(inventoryAfterApply.get("iam:test:cleanup:sentinel"))
    .toBe("must-survive-cleanup");

  const idempotentApply = await harness.runCleanup("--apply", 0);
  expect(idempotentApply.output).toContain(
    "Legacy cleanup custom-sso-cutover apply completed: matched 0, deleted 0.",
  );
  expect(await harness.inventory()).toEqual(afterInventory);

  const cleanVerify = await harness.runCleanup("--verify", 0);
  expect(cleanVerify.output).toContain(
    "Legacy cleanup custom-sso-cutover verify completed: matched 0, deleted 0.",
  );
  expect(await harness.inventory()).toEqual(afterInventory);
}, 45_000);

function sortedMap(entries: Iterable<readonly [string, string]>) {
  return new Map([...entries].sort(([left], [right]) => left.localeCompare(right)));
}
