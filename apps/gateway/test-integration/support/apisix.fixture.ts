import {
  assertApisixAdminEmpty,
  parseApisixAdminConfig,
  verifyApisixAdminBaseline,
} from "../../../../scripts/test-resources/apisix-admin.mjs";
import { ApisixWriteError } from "../../src/apisix.error";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { deleteOrder, getDefinition, getResourceId } from "../../src/resources";
import type { ResourceKind } from "../../src/types";

export type ApisixEndpointConfig = {
  adminUrl: string;
  adminKey: string;
};

export type ApisixFixture = ApisixEndpointConfig & {
  readonly signal: AbortSignal;
};

export function parseApisixEndpointConfig(environment: NodeJS.ProcessEnv = process.env): ApisixEndpointConfig {
  return parseApisixAdminConfig(environment);
}

/** Reusable boundary for consuming an already-provisioned exclusive APISIX Admin endpoint. */
export async function connectApisixEndpoint(endpoint: ApisixEndpointConfig): Promise<ApisixFixture> {
  const signal = new AbortController().signal;
  await verifyApisixAdminBaseline(endpoint, { signal });
  return { adminUrl: endpoint.adminUrl, adminKey: endpoint.adminKey, signal };
}

let shared: Promise<ApisixFixture> | undefined;
let poisoned = false;
let leased = false;

async function startSharedApisix(): Promise<ApisixFixture> {
  const endpoint = parseApisixEndpointConfig(process.env);
  return await connectApisixEndpoint(endpoint);
}

async function deleteAfterReferenceSettle(
  client: ApisixAdminClient,
  kind: ResourceKind,
  id: string,
  signal: AbortSignal,
) {
  // APISIX validates DELETE against its async etcd watcher cache, so deleting a service or
  // upstream immediately after deleting its referencing route can briefly return 400.
  for (let attempt = 1; ; attempt++) {
    try {
      await client.delete(kind, id, signal);
      return;
    } catch (error) {
      if (!(error instanceof ApisixWriteError) || error.effect !== "rejected" || attempt >= 20) throw error;
      await Bun.sleep(50);
    }
  }
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
      await deleteAfterReferenceSettle(client, kind, id, fixture.signal);
    }
  }
  await assertApisixAdminEmpty(fixture.adminUrl, fixture.adminKey, { signal: fixture.signal });
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
