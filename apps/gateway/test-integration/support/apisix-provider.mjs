import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyApisixAdminBaseline } from "../../../../scripts/test-resources/apisix-admin.mjs";
import {
  managedComposeStackView,
  managedServiceEndpoint,
  runManagedComposeCommand,
  saveManagedResourceRun,
} from "../../../../scripts/test-resources/managed-resources.mjs";

export const gatewayApisixComposeFile = "apps/gateway/test-integration/support/apisix.compose.yaml";
export const gatewayApisixProjectPrefix = "iam-gateway-apisix";
export const gatewayTestApisixAdminKey = "iam-gateway-integration-admin-key";

/**
 * Prepare and start the Gateway APISIX + etcd Compose stack before concurrent Integration tasks start.
 * Recorded directly on the single root run.json so teardown is owned uniformly by the root runner.
 */
export async function prepareManagedGatewayApisix({ run, signal, timeoutMs, cleanupTimeoutMs, verifyBaseline = true }) {
  if (!run?.root || !run?.recordPath || !run?.record?.runId) {
    throw new Error("prepareManagedGatewayApisix requires the root managed resource run");
  }
  const provider = run.record.provider ?? "docker";
  if (provider !== "docker") {
    throw new Error(`prepareManagedGatewayApisix cannot start Docker Compose for provider "${provider}"`);
  }
  signal?.throwIfAborted();
  const root = run.root;
  const supportDirectory = join(root, "apps/gateway/test-integration/support");
  const [dockerfile, config] = await Promise.all([
    readFile(join(supportDirectory, "apisix.Dockerfile"), "utf8"),
    readFile(join(supportDirectory, "apisix.config.yaml"), "utf8"),
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([dockerfile, config]))
    .digest("hex");
  signal?.throwIfAborted();

  const composeEnvironmentFile = `${run.record.artifactDirectory}/apisix-compose-environment.json`;
  await writeFile(
    join(root, composeEnvironmentFile),
    `${JSON.stringify({ IAM_GATEWAY_TEST_APISIX_IMAGE: `iam-gateway-apisix:${fingerprint}` }, null, 2)}\n`,
    { mode: 0o600 },
  );

  const stack = {
    project: `${gatewayApisixProjectPrefix}-${run.record.runId.replaceAll("-", "")}`,
    composeFile: gatewayApisixComposeFile,
    composeEnvironmentFile,
    services: ["apisix-etcd", "apisix"],
    removeLocalImages: false,
    status: "initializing",
  };
  run.record.apisix = stack;
  await saveManagedResourceRun(run);

  const stackRun = managedComposeStackView(run, stack);
  const result = await runManagedComposeCommand(stackRun, ["up", "--detach", "--wait", ...stack.services], {
    signal,
    timeoutMs: Math.min(timeoutMs ?? 120_000, 120_000),
    cleanupTimeoutMs,
    logFile: join(root, run.record.artifactDirectory, "apisix-initialize.log"),
  });
  if (result.exitCode !== 0) {
    throw new Error(`Gateway APISIX initialization failed with exit ${result.exitCode}:\n${result.output}`);
  }
  stack.status = "ready";
  await saveManagedResourceRun(run);

  const apisix = await managedServiceEndpoint(stackRun, "apisix", 9180, {
    signal,
    timeoutMs: Math.min(timeoutMs ?? 10_000, 10_000),
    cleanupTimeoutMs,
  });
  const endpoint = {
    adminUrl: `http://${apisix.host}:${apisix.port}/apisix/admin`,
    adminKey: gatewayTestApisixAdminKey,
  };
  if (verifyBaseline) {
    await verifyApisixAdminBaseline(endpoint, { signal });
  }
  return endpoint;
}
