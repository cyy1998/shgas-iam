import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createManagedResourceRun,
  finishManagedResourceRun,
  managedServiceEndpoint,
  readManagedResourceRun,
  saveManagedResourceRun,
  startManagedResources,
  writeAtomicResourceRecord,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";
import { prepareManagedPostgresTemplate } from "../../../../scripts/test-resources/postgres-template.mjs";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

export async function requireManagedApiResources() {
  const record = process.env.IAM_TEST_RESOURCE_RECORD;
  const runId = process.env.IAM_TEST_RESOURCE_RUN_ID;
  if (!record || !runId) throw new Error("API protocol fixtures require this run's managed resources");
  const run = await readManagedResourceRun(root, record);
  if (run.record.runId !== runId || !["ready", "running"].includes(run.record.status))
    throw new Error("Managed API resources are not ready for this run");
  const recordEnvironment = JSON.parse(await readFile(join(root, run.record.testEnvironmentFile), "utf8"));
  // The standalone suite owns its dedicated stack; root Integration uses task assignments.
  const environment = recordEnvironment.tasks ? recordEnvironment.tasks["@iam/sso-api:bun"] : recordEnvironment;
  for (const name of ["IAM_SSO_API_TEST_DATABASE_URL", "IAM_SSO_API_TEST_REDIS_URL", "IAM_TEST_POSTGRES_TEMPLATE"]) {
    if (!environment?.[name] || environment[name] !== process.env[name])
      throw new Error(`${name} must come from this run's managed resource record`);
  }
}

/** The standalone suite has the same one-command owner as the root collections. */
export async function runManagedOidcSuite(args: string[]) {
  await runManagedApiFixture({
    args,
    entry: "test-integration/oidc/oidc-suite.fixture.ts",
    label: "OIDC suite",
    projectPrefix: "iam-oidc-suite",
  });
}

/** Explicit standalone protocol checks use the same resource owner as collections. */
export async function runManagedApiFixture(options: {
  args: string[];
  entry: string;
  label: string;
  projectPrefix: string;
}) {
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error(`${options.label} interrupted`));
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const failures: unknown[] = [];
  let run: Awaited<ReturnType<typeof createManagedResourceRun>> | undefined;
  let executeStart: number | undefined;
  try {
    run = await createManagedResourceRun({
      root,
      composeFile: "scripts/test-resources/compose.yaml",
      projectPrefix: options.projectPrefix,
      services: ["postgres", "redis"],
      keep: options.args.includes("--keep"),
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
      parentRecord: process.env.IAM_TEST_RESOURCE_RECORD,
    });
    await startManagedResources(run, { signal: controller.signal, timeoutMs: 60000 });
    const { databaseUrl, templateName } = await prepareManagedPostgresTemplate(run, {
      env: process.env,
      signal: controller.signal,
      timeoutMs: 60000,
      cleanupTimeoutMs: 10000,
    });
    const redis = await managedServiceEndpoint(run, "redis", 6379, { signal: controller.signal });
    const environment = {
      IAM_SSO_API_TEST_DATABASE_URL: databaseUrl,
      IAM_SSO_API_TEST_REDIS_URL: `redis://${redis.host}:${redis.port}/0`,
      IAM_TEST_POSTGRES_TEMPLATE: templateName,
    };
    controller.signal.throwIfAborted();
    await writeAtomicResourceRecord(join(root, run.record.testEnvironmentFile), environment);
    run.record.status = "running";
    await saveManagedResourceRun(run);
    executeStart = performance.now();
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: ["--no-env-file", "run", options.entry, ...options.args, "--managed-api-resources"],
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
    if (result.exitCode !== 0) throw new Error(`${options.label} exited ${result.exitCode}`);
  } catch (failure) {
    failures.push(failure);
  } finally {
    if (run) {
      if (executeStart !== undefined) run.record.durations.executeMs = Math.round(performance.now() - executeStart);
      try {
        await finishManagedResourceRun(run, {
          cleanupTimeoutMs: 30000,
          diagnostics: failures.length > 0 || controller.signal.aborted,
        });
      } catch (failure) {
        failures.push(failure);
      }
    }
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  }
  if (failures.length) throw new AggregateError(failures, `Managed ${options.label} execution or cleanup failed`);
}
