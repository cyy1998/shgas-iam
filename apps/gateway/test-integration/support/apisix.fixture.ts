import { setTimeout as delay } from "node:timers/promises";
import { ApisixAdminClient } from "../../src/apisix-admin-client";
import { deleteOrder, getDefinition, getResourceId, resourceDefinitions } from "../../src/resources";

export type ApisixEndpointConfig = {
  adminUrl: string;
  adminKey: string;
};

export type ApisixFixture = ApisixEndpointConfig & {
  readonly signal: AbortSignal;
};

export function parseApisixEndpointConfig(environment: NodeJS.ProcessEnv = process.env): ApisixEndpointConfig {
  const rawUrl = environment.IAM_TEST_APISIX_ADMIN_URL?.trim();
  const adminKey = environment.IAM_TEST_APISIX_ADMIN_KEY?.trim();
  if (!rawUrl || !adminKey) {
    throw new Error(
      "Gateway APISIX integration tests require IAM_TEST_APISIX_ADMIN_URL and IAM_TEST_APISIX_ADMIN_KEY from the root Integration runner",
    );
  }
  const parsed = URL.parse(rawUrl);
  if (
    !parsed ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !parsed.hostname ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`Invalid IAM_TEST_APISIX_ADMIN_URL: ${rawUrl}`);
  }
  const normalizedPathname = parsed.pathname.replace(/\/+$/u, "");
  if (!normalizedPathname.endsWith("/apisix/admin")) {
    throw new Error(`IAM_TEST_APISIX_ADMIN_URL must end with /apisix/admin: ${rawUrl}`);
  }
  return {
    adminUrl: `${parsed.origin}${normalizedPathname}`,
    adminKey,
  };
}

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

/** Reusable boundary for consuming an already-provisioned exclusive APISIX Admin endpoint. */
export async function connectApisixEndpoint(endpoint: ApisixEndpointConfig): Promise<ApisixFixture> {
  const signal = new AbortController().signal;
  await waitForAdmin(endpoint.adminUrl, endpoint.adminKey, signal);
  const fixture: ApisixFixture = { adminUrl: endpoint.adminUrl, adminKey: endpoint.adminKey, signal };
  await assertEmpty(new ApisixAdminClient(fixture));
  return fixture;
}

let shared: Promise<ApisixFixture> | undefined;
let poisoned = false;
let leased = false;

async function startSharedApisix(): Promise<ApisixFixture> {
  const endpoint = parseApisixEndpointConfig(process.env);
  return await connectApisixEndpoint(endpoint);
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
