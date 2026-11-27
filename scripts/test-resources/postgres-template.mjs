import { join } from "node:path";
import process from "node:process";
import {
  requireDedicatedPostgresTestUrl,
  TEST_POSTGRES_URL_ENV,
} from "../../packages/test-support/src/dedicated-postgres-test-url.mjs";
import { runOwnedCommand } from "../owned-command.mjs";

export async function preparePostgresTemplate({
  databaseUrl,
  root,
  logFile,
  env = process.env,
  signal,
  templateName = "iam_test_template",
}) {
  requireDedicatedPostgresTestUrl({ name: TEST_POSTGRES_URL_ENV, value: databaseUrl, environment: env });
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(templateName))
    throw new Error(`Invalid PostgreSQL test template name: ${templateName}`);
  const templateUrl = new URL(databaseUrl);
  templateUrl.pathname = `/${templateName}`;
  requireDedicatedPostgresTestUrl({ name: "IAM_TEST_POSTGRES_TEMPLATE", value: templateUrl.href, environment: env });

  const result = await runOwnedCommand({
    executable: "bun",
    args: ["--no-env-file", "test-integration/support/prepare-postgres-template.ts", templateName],
    cwd: join(root, "packages/db"),
    env: { ...env, [TEST_POSTGRES_URL_ENV]: databaseUrl },
    signal,
    logFile,
  });
  if (result.exitCode !== 0) throw new Error(`PostgreSQL test template migration failed:\n${result.output}`);
  return templateName;
}
