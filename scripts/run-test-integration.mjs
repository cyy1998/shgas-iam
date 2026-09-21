#!/usr/bin/env node
import process from "node:process";
import { runPnpmCommand } from "./run-pnpm-command.mjs";

const resourceEnvNames = [
  "IAM_API_CORE_TEST_REDIS_URL",
  "IAM_SESSION_KERNEL_TEST_REDIS_URL",
  "IAM_OIDC_TEST_REDIS_URL",
  "IAM_ADMIN_API_TEST_REDIS_URL",
  "IAM_ADMIN_API_TEST_DATABASE_URL",
  "IAM_API_TEST_DATABASE_URL",
  "IAM_API_TEST_REDIS_URL",
  "IAM_DB_TEST_DATABASE_URL",
  "IAM_ORGANIZATION_RESPONSIBILITY_TEST_DATABASE_URL",
  "IAM_ROLE_ASSIGNMENT_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_DATABASE_URL",
  "IAM_USER_PROFILE_TEST_REDIS_URL",
  "IAM_WORKER_TEST_DATABASE_URL",
  "IAM_WORKER_TEST_REDIS_URL",
];
const profiles = [
  "component",
  "process",
  "redis",
  "postgres",
  "composition",
  "browser",
];

const missing = resourceEnvNames.filter(name => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(
    "Missing Integration test resource URLs. Provide dedicated URLs or start disposable Docker resources first:",
  );
  for (const name of missing)
    console.error(`- ${name}`);
  process.exit(1);
}

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) {
  console.error("pnpm test:integration must be launched through a pnpm lifecycle script.");
  process.exit(1);
}

for (const profile of profiles) {
  const command = `test:integration:${profile}`;
  const result = runPnpmCommand(pnpmCli, [command]);
  if (result.error) {
    console.error(`Failed to launch pnpm ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0)
    process.exit(result.status ?? 1);
}
