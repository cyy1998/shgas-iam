import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { TEST_POSTGRES_URL_ENV, TEST_REDIS_URL_ENV } from "@iam/test-support/external-test-resources";
import {
  readManagedResourceRun,
  saveManagedResourceRun,
  writeAtomicResourceRecord,
} from "../../../../scripts/test-resources/managed-resources.mjs";
import { runOwnedCommand } from "../../../../scripts/test-resources/owned-command.mjs";
import { formatRedisSlotUrl, parseTestRedisUrl } from "../../../../scripts/test-resources/redis-preflight.mjs";
import {
  externalEndpointEnvNames,
  type PreparedManagedTestResources,
  prepareManagedTestResources,
} from "../../../../scripts/test-resources/resource-provider.mjs";

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
  for (const name of [TEST_POSTGRES_URL_ENV, TEST_REDIS_URL_ENV, "IAM_TEST_POSTGRES_TEMPLATE"]) {
    if (!environment?.[name] || environment[name] !== process.env[name])
      throw new Error(`${name} must come from this run's managed resource record`);
  }
  if (
    run.record.endpoints?.postgres?.databaseUrl !== environment[TEST_POSTGRES_URL_ENV] ||
    run.record.endpoints?.postgres?.templateName !== environment.IAM_TEST_POSTGRES_TEMPLATE
  ) {
    throw new Error("Managed API PostgreSQL endpoint does not match this run's resource record");
  }
  const redisEndpointUrl = run.record.endpoints?.redis?.url;
  const assignedRedis = parseTestRedisUrl(environment[TEST_REDIS_URL_ENV], TEST_REDIS_URL_ENV);
  if (
    typeof redisEndpointUrl !== "string" ||
    formatRedisSlotUrl(redisEndpointUrl, assignedRedis.db) !== environment[TEST_REDIS_URL_ENV]
  ) {
    throw new Error("Managed API Redis endpoint does not match this run's resource record");
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
  let prepared: PreparedManagedTestResources | undefined;
  let executeStart: number | undefined;
  try {
    prepared = await prepareManagedTestResources(["postgres", "redis"], {
      root,
      env: process.env,
      projectPrefix: options.projectPrefix,
      keep: options.args.includes("--keep"),
      registryFile: process.env.IAM_TEST_RESOURCE_REGISTRY,
      signal: controller.signal,
      timeoutMs: 60_000,
      cleanupTimeoutMs: 10_000,
    });
    const postgres = prepared.endpoints.postgres;
    const redis = prepared.endpoints.redis;
    if (!postgres || !redis) {
      throw new Error(`${options.label} requires managed PostgreSQL and Redis endpoints`);
    }
    const environment = {
      [TEST_POSTGRES_URL_ENV]: postgres.databaseUrl,
      [TEST_REDIS_URL_ENV]: formatRedisSlotUrl(redis.url, 1),
      IAM_TEST_POSTGRES_TEMPLATE: postgres.templateName,
    };
    controller.signal.throwIfAborted();
    await writeAtomicResourceRecord(join(root, prepared.run.record.testEnvironmentFile), environment);
    prepared.run.record.status = "running";
    await saveManagedResourceRun(prepared.run);

    const childEnvironment: NodeJS.ProcessEnv = { ...process.env };
    for (const name of externalEndpointEnvNames) delete childEnvironment[name];
    delete childEnvironment.IAM_TEST_POSTGRES_TEMPLATE;

    executeStart = performance.now();
    const result = await runOwnedCommand({
      executable: process.execPath,
      args: ["--no-env-file", "run", options.entry, ...options.args, "--managed-api-resources"],
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      env: {
        ...childEnvironment,
        ...environment,
        IAM_TEST_RESOURCE_RUN_ID: prepared.run.record.runId,
        IAM_TEST_RESOURCE_RECORD: prepared.run.recordPath,
      },
      signal: controller.signal,
      cleanupTimeoutMs: 10_000,
      inheritOutput: true,
      logFile: join(root, prepared.run.record.artifactDirectory, "suite.log"),
    });
    if (result.exitCode !== 0) throw new Error(`${options.label} exited ${result.exitCode}`);
  } catch (failure) {
    failures.push(failure);
  } finally {
    if (prepared) {
      if (executeStart !== undefined) {
        prepared.run.record.durations.executeMs = Math.round(performance.now() - executeStart);
      }
      try {
        await prepared.cleanup({
          cleanupTimeoutMs: 30_000,
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
