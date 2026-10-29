import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  managedServicePort,
  readManagedResourceRegistry,
  readManagedResourceRun,
  startManagedResources,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { deleteOrder, getDefinition, getResourceId, resourceDefinitions } from "../../src/resources";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const adminKey = "iam-gateway-integration-admin-key";

export type ApisixFixture = {
  adminUrl: string;
  adminKey: string;
  readonly signal: AbortSignal;
};

async function waitForAdmin(adminUrl: string, adminKey: string, signal?: AbortSignal) {
  const deadline = performance.now() + 15_000;
  let failure: unknown;
  while (performance.now() < deadline) {
    signal?.throwIfAborted();
    try {
      const response = await fetch(`${adminUrl}/routes`, {
        headers: { "X-API-KEY": adminKey },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2000)]) : AbortSignal.timeout(2000),
      });
      await response.arrayBuffer();
      if (response.ok) return;
      failure = new Error(`APISIX Admin readiness returned HTTP ${response.status}`);
    } catch (error) {
      failure = error;
    }
    await delay(100, undefined, { signal });
  }
  throw new Error("APISIX Admin did not become ready", { cause: failure });
}

let shared: Promise<ApisixFixture> | undefined;
let poisoned = false;
let leased = false;

async function startSharedApisix(): Promise<ApisixFixture> {
  const recordPath = process.env.IAM_GATEWAY_TEST_APISIX_RECORD;
  const parentPath = process.env.IAM_TEST_RESOURCE_RECORD;
  if (!recordPath || !parentPath) throw new Error("Use the root Integration entry with the Gateway resource provider");
  const parent = await readManagedResourceRun(root, parentPath);
  const children = await readManagedResourceRegistry(root, `${parent.record.artifactDirectory}/children.jsonl`);
  if (parent.record.runId !== process.env.IAM_TEST_RESOURCE_RUN_ID || !children.includes(recordPath))
    throw new Error("APISIX resource lease must belong to this Integration command");
  const run = await readManagedResourceRun(root, recordPath);
  if (
    run.record.status !== "created" ||
    run.record.composeFile !== "apps/gateway/test-integration/support/apisix.compose.yaml" ||
    !run.record.project.startsWith("iam-gateway-apisix-")
  )
    throw new Error("Invalid Gateway APISIX resource lease");
  const signal = new AbortController().signal;
  await startManagedResources(run, { signal, timeoutMs: 120_000 });
  const port = await managedServicePort(run, "apisix", 9180, { signal, timeoutMs: 10_000 });
  const adminUrl = `http://127.0.0.1:${port}/apisix/admin`;
  await waitForAdmin(adminUrl, adminKey, signal);
  const fixture = { adminUrl, adminKey, signal };
  await assertEmpty(new ApisixAdminClient(fixture));
  return fixture;
}

async function assertEmpty(client: ApisixAdminClient) {
  const state = await client.read();
  for (const { kind } of resourceDefinitions)
    if (state[kind].length !== 0) throw new Error(`APISIX reset left ${kind} resources`);
}

async function resetApisix(fixture: ApisixFixture) {
  const started = performance.now();
  // Direct Admin access bypasses each case's rejected/delayed requests and journal.
  const client = new ApisixAdminClient(fixture);
  const state = await client.read();
  for (const kind of deleteOrder) {
    for (const resource of state[kind]) {
      const id = getResourceId(getDefinition(kind), resource);
      if (!id) throw new Error(`APISIX reset found an invalid ${kind} identity`);
      await client.delete(kind, id);
    }
  }
  await assertEmpty(client);
  console.log(`[gateway-test] APISIX reset verified in ${Math.round(performance.now() - started)}ms`);
}

export async function withApisixFixture<T>(callback: (fixture: ApisixFixture) => Promise<T>): Promise<T> {
  if (poisoned || leased) throw new Error("APISIX collection is failed or already leased");
  leased = true;
  try {
    shared ??= startSharedApisix();
    const fixture = await shared;
    // Each callback owns and joins its Gateway processes, proxies and connections.
    // A callback/teardown failure skips reset: late writes must never race the next case.
    const result = await callback(fixture);
    await resetApisix(fixture);
    return result;
  } catch (error) {
    poisoned = true;
    throw error;
  } finally {
    leased = false;
  }
}
