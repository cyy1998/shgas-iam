import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  cleanupManagedResources,
  collectManagedResourceDiagnostics,
  createManagedResourceRun,
  formatResourceFailure,
  type ManagedResourceRun,
  readManagedResourceRegistry,
  readManagedResourceRun,
  saveManagedResourceRun,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";

const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const suiteResourceTestFile = "test-integration/oidc/oidc-suite-resources.integration.test.ts";

async function finishOidcSuiteResourceRun(run: ManagedResourceRun, diagnostics: boolean) {
  // The test normally cleans its own Compose project; recover any child left after failure or interruption.
  const children = await readManagedResourceRegistry(run.root, `${run.record.artifactDirectory}/children.jsonl`);
  const failures: unknown[] = [];
  for (const path of children.reverse()) {
    try {
      const child = await readManagedResourceRun(run.root, path);
      if (child.record.status === "created") {
        child.record.status = "cleaned";
        await saveManagedResourceRun(child);
      } else if (child.record.status !== "cleaned") {
        if (diagnostics) await collectManagedResourceDiagnostics(child);
        await cleanupManagedResources(child, { timeoutMs: 120_000 });
      }
    } catch (error) {
      failures.push(error);
    }
  }
  run.record.status = failures.length > 0 ? "cleanup-failed" : "cleaned";
  try {
    await saveManagedResourceRun(run);
  } catch (error) {
    failures.push(error);
  }
  if (failures.length > 0) throw new AggregateError(failures, `Cleanup failed for ${run.recordPath}`);
}

async function main() {
  if (process.platform !== "linux") {
    throw new Error(`OIDC suite resource integration requires Linux (detected ${process.platform}).`);
  }
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  if (args.length > 0) {
    throw new Error(`Unexpected arguments for test:oidc-suite-resources: ${args.join(" ")}`);
  }

  const controller = new AbortController();
  const onInterrupt = () => controller.abort(new Error("OIDC suite resource integration interrupted by SIGINT"));
  const onTerminate = () => controller.abort(new Error("OIDC suite resource integration interrupted by SIGTERM"));
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);

  const failures: unknown[] = [];
  let run: ManagedResourceRun | undefined;
  let executionStart: number | undefined;
  try {
    run = await createManagedResourceRun({
      root: repositoryRoot,
      composeFile: "scripts/test-resources/compose.yaml",
      projectPrefix: "iam-oidc-suite-resources",
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    });
    const environment: NodeJS.ProcessEnv = { ...process.env };
    delete environment.IAM_SSO_API_TEST_DATABASE_URL;
    delete environment.IAM_SSO_API_TEST_REDIS_URL;
    delete environment.IAM_TEST_POSTGRES_TEMPLATE;
    delete environment.IAM_TEST_INTEGRATION_SELECTION;
    delete environment.IAM_TEST_RESOURCE_RUN_ID;
    environment.IAM_TEST_RESOURCE_RECORD = run.recordPath;

    executionStart = performance.now();
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: ["--no-env-file", "test", "--max-concurrency=1", "--bail", suiteResourceTestFile],
      cwd: workspaceRoot,
      env: environment,
      signal: controller.signal,
      timeoutMs: 180_000,
      cleanupTimeoutMs: 15_000,
      inheritOutput: true,
    });
    if (result.exitCode !== 0) {
      process.exitCode = result.exitCode;
      throw new Error(`OIDC suite resource integration exited with code ${result.exitCode}`);
    }
  } catch (error) {
    failures.push(error);
  } finally {
    if (run) {
      if (executionStart !== undefined) {
        run.record.durations.executeMs = Math.round(performance.now() - executionStart);
      }
      try {
        await finishOidcSuiteResourceRun(run, failures.length > 0 || controller.signal.aborted);
      } catch (error) {
        failures.push(error);
      }
    }
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(formatResourceFailure(failure));
    process.exitCode ||= 1;
  } else if (controller.signal.aborted) {
    console.error(formatResourceFailure(controller.signal.reason));
    process.exitCode = 1;
  }
}

await main();
