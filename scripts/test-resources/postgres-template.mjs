import { join } from "node:path";
import process from "node:process";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import { pnpmCommand, runOwnedCommand } from "./owned-command.mjs";

export async function prepareManagedPostgresTemplate(run, options = {}) {
  const databaseUrl = options.databaseUrl ?? run?.record?.endpoints?.postgres?.databaseUrl;
  if (typeof databaseUrl !== "string" || !databaseUrl.trim()) {
    throw new Error("prepareManagedPostgresTemplate requires an explicit databaseUrl (no Docker fallback is allowed)");
  }
  const environment = options.env ?? process.env;
  requireDedicatedPostgresTestUrl({
    name: TEST_POSTGRES_URL_ENV,
    value: databaseUrl,
    environment,
  });
  const templateName = options.templateName ?? "iam_test_template";
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(templateName)) {
    throw new Error(`Invalid PostgreSQL test template name: ${templateName}`);
  }
  const templateUrl = new URL(databaseUrl);
  templateUrl.pathname = `/${templateName}`;
  requireDedicatedPostgresTestUrl({
    name: "IAM_TEST_POSTGRES_TEMPLATE",
    value: templateUrl.href,
    environment,
  });
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
