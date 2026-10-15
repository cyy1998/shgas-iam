import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  managedServicePort,
  readManagedResourceRun,
  saveManagedResourceRun,
  startManagedResources,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

export async function requireManagedApiResources() {
  const record = process.env.IAM_TEST_RESOURCE_RECORD;
  const runId = process.env.IAM_TEST_RESOURCE_RUN_ID;
  if (!record || !runId) throw new Error("API protocol fixtures require this run's managed resources");
  const run = await readManagedResourceRun(root, record);
  if (run.record.runId !== runId || !["ready", "running"].includes(run.record.status))
    throw new Error("Managed API resources are not ready for this run");
  const environment = JSON.parse(await readFile(join(root, run.record.testEnvironmentFile), "utf8"));
  for (const name of ["IAM_API_TEST_DATABASE_URL", "IAM_API_TEST_REDIS_URL"]) {
    if (!environment[name] || environment[name] !== process.env[name])
      throw new Error(`${name} must come from this run's managed resource record`);
  }
}

/** The standalone suite has the same one-command owner as the root collections. */
export async function runManagedOidcSuite(args: string[]) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error("OIDC suite interrupted"));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const failures: unknown[] = [];
  let run: Awaited<ReturnType<typeof createManagedResourceRun>> | undefined;
  let executeStart: number | undefined;
  try {
    run = await createManagedResourceRun({
      root,
      composeFile: "scripts/test-resources/compose.yaml",
      projectPrefix: "iam-oidc-suite",
      services: ["postgres", "redis"],
      keep: args.includes("--keep"),
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
    });
    await startManagedResources(run, { signal: controller.signal, timeoutMs: 60000 });
    const environment = {
      IAM_API_TEST_DATABASE_URL: `postgres://iam_test:iam_test@127.0.0.1:${await managedServicePort(run, "postgres", 5432, { signal: controller.signal })}/iam_test`,
      IAM_API_TEST_REDIS_URL: `redis://127.0.0.1:${await managedServicePort(run, "redis", 6379, { signal: controller.signal })}/0`,
    };
    await writeFile(join(root, run.record.testEnvironmentFile), JSON.stringify(environment), { mode: 0o600 });
    run.record.status = "running";
    await saveManagedResourceRun(run);
    executeStart = performance.now();
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: ["--no-env-file", "run", "test-integration/oidc/oidc-suite.fixture.ts", ...args, "--managed-api-resources"],
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        ...process.env,
        ...environment,
        IAM_TEST_RESOURCE_RUN_ID: run.record.runId,
        IAM_TEST_RESOURCE_RECORD: run.recordPath,
      },
      signal: controller.signal,
      cleanupTimeoutMs: 10000,
      inheritOutput: true,
      logFile: join(root, run.record.artifactDirectory, "suite.log"),
    });
    if (result.exitCode !== 0) throw new Error(`OIDC suite exited ${result.exitCode}`);
  } catch (failure) {
    failures.push(failure);
  } finally {
    if (run) {
      if (executeStart !== undefined) run.record.durations.executeMs = Math.round(performance.now() - executeStart);
      try {
        await finishManagedResourceRun(run, { cleanupTimeoutMs: 30000 });
      } catch (failure) {
        failures.push(failure);
      }
    }
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  if (failures.length) throw new AggregateError(failures, "Managed OIDC suite execution or cleanup failed");
}
