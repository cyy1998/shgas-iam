import { join } from "node:path";
import process from "node:process";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import { managedServiceEndpoint } from "./managed-resources.mjs";
import { pnpmCommand, runOwnedCommand } from "./owned-command.mjs";

async function discoverManagedPostgresUrl(run, options) {
  const { host, port } = await managedServiceEndpoint(run, "postgres", 5432, options);
  return `postgres://iam_test:iam_test@${host}:${port}/iam_test`;
}

export async function prepareManagedPostgresTemplate(run, options = {}) {
  const databaseUrl = options.databaseUrl ?? (await discoverManagedPostgresUrl(run, options));
  const environment = options.env ?? process.env;
  requireDedicatedPostgresTestUrl({
    name: TEST_POSTGRES_URL_ENV,
    value: databaseUrl,
    environment,
  });
  const templateName = options.templateName ?? "iam_test_template";
  const command = process.versions.bun
    ? { executable: process.execPath, args: ["--no-env-file", "run", "test:postgres:prepare-template", templateName] }
    : process.env.npm_execpath
      ? pnpmCommand(process.env.npm_execpath, ["run", "test:postgres:prepare-template", templateName])
      : { executable: "bun", args: ["--no-env-file", "run", "test:postgres:prepare-template", templateName] };
  const result = await runOwnedCommand({
    ...options,
    ...command,
    cwd: join(run.root, "packages/db"),
    env: { ...environment, [TEST_POSTGRES_URL_ENV]: databaseUrl },
    logFile: join(run.root, run.record.artifactDirectory, "template-migration.log"),
  });
  if (result.exitCode !== 0) throw new Error(`PostgreSQL test template migration failed:\n${result.output}`);
  return { databaseUrl, templateName };
}
