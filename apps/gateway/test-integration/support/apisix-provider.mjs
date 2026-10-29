import { appendFile } from "node:fs/promises";
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
  const run = await createManagedResourceRun({
    root,
    composeFile: "apps/gateway/test-integration/support/apisix.compose.yaml",
    projectPrefix: "iam-gateway-apisix",
    services: ["apisix-etcd", "apisix"],
    keep: parent.record.keep,
    registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    removeLocalImages: true,
  });
  try {
    await appendFile(
      join(root, parent.record.artifactDirectory, "children.jsonl"),
      `${JSON.stringify(run.recordPath)}\n`,
    );
  } catch (error) {
    await finishManagedResourceRun(run, { cleanupTimeoutMs: 30_000 });
    throw error;
  }
  return {
    environment: { IAM_GATEWAY_TEST_APISIX_RECORD: run.recordPath },
    async close() {
      const current = await readManagedResourceRun(root, run.recordPath);
      if (current.record.status === "created") {
        // Selections that never lease APISIX do not create Docker resources.
        current.record.status = "cleaned";
        await saveManagedResourceRun(current);
        return;
      }
      await finishManagedResourceRun(current, { cleanupTimeoutMs: 30_000 });
    },
  };
}
