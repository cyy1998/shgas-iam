import { join } from "node:path";
import { managedServiceEndpoint } from "./managed-resources.mjs";
import { runOwnedCommand } from "./owned-command.mjs";

export async function prepareManagedPostgresTemplate(run, options) {
  const { host, port } = await managedServiceEndpoint(run, "postgres", 5432, options);
  const databaseUrl = `postgres://iam_test:iam_test@${host}:${port}/iam_test`;
  const templateName = "iam_test_template";
  const result = await runOwnedCommand({
    ...options,
    executable: "bun",
    args: ["--no-env-file", "run", "test:postgres:prepare-template", templateName],
    cwd: join(run.root, "packages/db"),
    env: { ...options.env, IAM_DB_TEST_DATABASE_URL: databaseUrl },
    logFile: join(run.root, run.record.artifactDirectory, "template-migration.log"),
  });
  if (result.exitCode !== 0) throw new Error(`PostgreSQL test template migration failed:\n${result.output}`);
  return { databaseUrl, templateName };
}
