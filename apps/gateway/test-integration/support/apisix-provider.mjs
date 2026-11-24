import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  readManagedResourceRun,
  saveManagedResourceRun,
} from "../../../../scripts/test-resources/managed-resources.mjs";

// The parent owns teardown even if Bun exits during a test or startup.
export async function prepare({ root, signal }) {
  signal.throwIfAborted();
  const parent = await readManagedResourceRun(root, process.env.IAM_TEST_RESOURCE_RECORD);
  const supportDirectory = join(root, "apps/gateway/test-integration/support");
  const [dockerfile, config] = await Promise.all([
    readFile(join(supportDirectory, "apisix.Dockerfile"), "utf8"),
    readFile(join(supportDirectory, "apisix.config.yaml"), "utf8"),
  ]);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify([dockerfile, config]))
    .digest("hex");
  signal.throwIfAborted();
  const run = await createManagedResourceRun({
    root,
    composeFile: "apps/gateway/test-integration/support/apisix.compose.yaml",
    projectPrefix: "iam-gateway-apisix",
    services: ["apisix-etcd", "apisix"],
    parentRecord: parent.recordPath,
    registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    composeEnvironment: { IAM_GATEWAY_TEST_APISIX_IMAGE: `iam-gateway-apisix:${fingerprint}` },
  });
  return {
    environment: { IAM_GATEWAY_TEST_APISIX_RECORD: run.recordPath },
    async close({ diagnostics }) {
      const current = await readManagedResourceRun(root, run.recordPath);
      if (current.record.status === "created") {
        // Selections that never lease APISIX do not create Docker resources.
        current.record.status = "cleaned";
        await saveManagedResourceRun(current);
        return;
      }
      await finishManagedResourceRun(current, { cleanupTimeoutMs: 30_000, diagnostics });
    },
  };
}
