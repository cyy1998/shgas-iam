import {
  createManagedResourceRun,
  finishManagedResourceRun,
  type ManagedResourceRun,
  readManagedResourceRegistry,
  readManagedResourceRun,
  saveManagedResourceRun,
} from "../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../scripts/test-resources/owned-command.mjs";
import { runWithCleanup } from "./bounded-operation.ts";

export async function runRuntimeIntegration(options: {
  repositoryRoot: string;
  workspaceRoot: string;
  signal: AbortSignal;
}) {
  const run = await createManagedResourceRun({
    root: options.repositoryRoot,
    composeFile: "scripts/test-resources/compose.yaml",
    projectPrefix: "iam-e2e-runtime-integration",
    registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
  });
  await runWithCleanup(
    async () => {
      const result = await runOwnedCommand({
        executable: process.execPath,
        args: ["test", "--max-concurrency=1", "--bail", "test-integration"],
        cwd: options.workspaceRoot,
        env: { ...process.env, IAM_TEST_RESOURCE_RECORD: run.recordPath },
        signal: options.signal,
        inheritOutput: true,
      });
      process.exitCode = result.exitCode;
    },
    () => finishRuntimeIntegration(run),
  );
}

async function finishRuntimeIntegration(run: ManagedResourceRun) {
  // The fixtures normally clean their own projects. Recover projects left after an interrupted test process.
  const children = await readManagedResourceRegistry(run.root, `${run.record.artifactDirectory}/children.jsonl`);
  const failures: unknown[] = [];
  for (const path of children.reverse()) {
    try {
      const child = await readManagedResourceRun(run.root, path);
      if (child.record.status === "created") {
        child.record.status = "cleaned";
        await saveManagedResourceRun(child);
      } else if (child.record.status !== "cleaned" && child.record.status !== "kept") {
        await finishManagedResourceRun(child, { cleanupTimeoutMs: 120_000, diagnostics: true });
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, `Cleanup failed for ${run.recordPath}`);
  run.record.status = "cleaned";
  await saveManagedResourceRun(run);
}
