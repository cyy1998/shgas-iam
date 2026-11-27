import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createManagedResourceRun,
  managedServiceEndpoint,
  startManagedResources,
  writeAtomicResourceRecord,
} from "../../../../scripts/test-resources/managed-resources.mjs";

export const gatewayApisixComposeFile = "apps/gateway/test-integration/support/apisix.compose.yaml";
export const gatewayApisixProjectPrefix = "iam-gateway-apisix";
export const gatewayTestApisixAdminKey = "iam-gateway-integration-admin-key";

const apisixResourceEndpoints = [
  "upstreams",
  "plugin_metadata",
  "plugin_configs",
  "services",
  "consumers",
  "ssls",
  "routes",
];

function isEmptyApisixList(list) {
  if (Array.isArray(list)) return list.length === 0;
  return Boolean(list) && typeof list === "object" && Object.keys(list).length === 0;
}

async function waitForApisixAdmin(adminUrl, adminKey, signal) {
  const deadline = performance.now() + 15_000;
  let failure;
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

async function assertApisixAdminEmpty(adminUrl, adminKey, signal) {
  for (const endpoint of apisixResourceEndpoints) {
    signal?.throwIfAborted();
    const response = await fetch(`${adminUrl}/${endpoint}?page=1&page_size=10`, {
      headers: { Accept: "application/json", "X-API-KEY": adminKey },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`APISIX Admin baseline check failed for ${endpoint}: HTTP ${response.status} ${text}`);
    }
    const body = await response.json();
    if (!body || typeof body !== "object" || body.total !== 0 || !isEmptyApisixList(body.list)) {
      throw new Error(`APISIX Admin initial baseline is not empty for ${endpoint}`);
    }
  }
}

/**
 * Prepare and start the Gateway APISIX + etcd Compose stack before concurrent Integration tasks start.
 * Teardown is owned exclusively by the root runner after all concurrent task process trees exit.
 */
export async function prepareManagedGatewayApisix({ parentRun, signal, timeoutMs, cleanupTimeoutMs, registryFile }) {
  if (!parentRun?.root || !parentRun?.recordPath) {
    throw new Error("prepareManagedGatewayApisix requires the root managed resource run");
  }
  signal?.throwIfAborted();
  const root = parentRun.root;
  const supportDirectory = join(root, "apps/gateway/test-integration/support");
  const [dockerfile, config] = await Promise.all([
    readFile(join(supportDirectory, "apisix.Dockerfile"), "utf8"),
    readFile(join(supportDirectory, "apisix.config.yaml"), "utf8"),
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([dockerfile, config]))
    .digest("hex");
  signal?.throwIfAborted();
  const run = await createManagedResourceRun({
    root,
    composeFile: gatewayApisixComposeFile,
    projectPrefix: gatewayApisixProjectPrefix,
    services: ["apisix-etcd", "apisix"],
    parentRecord: parentRun.recordPath,
    keep: parentRun.record.keep,
    registryFile,
    composeEnvironment: { IAM_GATEWAY_TEST_APISIX_IMAGE: `iam-gateway-apisix:${fingerprint}` },
  });
  await startManagedResources(run, {
    signal,
    timeoutMs: Math.min(timeoutMs ?? 120_000, 120_000),
    cleanupTimeoutMs,
  });
  const apisix = await managedServiceEndpoint(run, "apisix", 9180, {
    signal,
    timeoutMs: Math.min(timeoutMs ?? 10_000, 10_000),
    cleanupTimeoutMs,
  });
  const adminUrl = `http://${apisix.host}:${apisix.port}/apisix/admin`;
  const adminKey = gatewayTestApisixAdminKey;
  await waitForApisixAdmin(adminUrl, adminKey, signal);
  await assertApisixAdminEmpty(adminUrl, adminKey, signal);
  await writeAtomicResourceRecord(join(root, run.record.testEnvironmentFile), {
    IAM_TEST_APISIX_ADMIN_URL: adminUrl,
    IAM_TEST_APISIX_ADMIN_KEY: adminKey,
  });
  return { run, recordPath: run.recordPath, adminUrl, adminKey };
}
