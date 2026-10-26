import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "../harness/command-fixture";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const backendApps = [
  { app: "api", prefix: "IAM_API_" },
  { app: "admin-api", prefix: "IAM_ADMIN_API_" },
  { app: "worker", prefix: "IAM_WORKER_" },
  { app: "gateway", prefix: "IAM_GATEWAY_" },
];
const frontendApps = [
  { app: "admin", prefix: "UMI_APP_ADMIN_" },
  { app: "sso", prefix: "UMI_APP_SSO_" },
];

async function writeFixtureFile(root: string, path: string, source: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

async function runEnvGuard(overrides: Record<string, string> = {}) {
  return withCommandFixture("iam-env-name-guard-", async (root, signal) => {
    await mkdir(join(root, "scripts"), { recursive: true });
    await copyFile(join(repoRoot, "scripts", "check-env-names.ts"), join(root, "scripts", "check-env-names.ts"));
    const files: Record<string, string> = {};
    for (const { app, prefix } of backendApps) {
      files[`apps/${app}/src/env.ts`] =
        `const RawEnvSchema = z.object({\n  ${prefix}PORT: z.number(),\n  NODE_ENV: z.string(),\n});\n` +
        "const env = RawEnvSchema.parse(process.env);\n";
      files[`apps/${app}/.env.example`] = `${prefix}PORT=30000\n${app === "gateway" ? "" : "NODE_ENV=test\n"}`;
    }
    for (const { app, prefix } of frontendApps) {
      files[`apps/${app}/src/constants/config.ts`] = `export const API_PREFIX = process.env.${prefix}API_PREFIX;\n`;
      files[`apps/${app}/.env.example`] = `${prefix}API_PREFIX=/api\nPORT=8000\n`;
      files[`apps/${app}/Dockerfile`] = `ARG ${prefix}API_PREFIX\nENV ${prefix}API_PREFIX=/api\n`;
    }
    for (const [path, source] of Object.entries({ ...files, ...overrides })) {
      await writeFixtureFile(root, path, source);
    }
    return runOwnedCommand([process.execPath, "scripts/check-env-names.ts"], root, signal);
  });
}

describe("env name guard process", () => {
  test(
    "accepts app namespaces, configuration boundaries, NODE_ENV, and frontend PORT examples",
    async () => {
      const result = await runEnvGuard();
      expect(result.exitCode, result.output).toBe(0);
      expect(result.output).toContain("Env name guard passed.");
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each([
    { name: "single-line", source: "const RawApiEnvSchema = z.object({ IAM_API_PORT: z.number() });\n" },
    {
      name: "formatter-expanded",
      source: "const RawApiEnvSchema = z.object(\n  {\n    IAM_API_PORT: z.number(),\n  },\n);\n",
    },
  ])(
    "accepts $name raw schema declarations",
    async ({ source }) => {
      const result = await runEnvGuard({ "apps/api/src/env.ts": source });
      expect(result.exitCode, result.output).toBe(0);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(backendApps)(
    "rejects a raw schema key with the wrong prefix in $app",
    async ({ app, prefix }) => {
      const file = `apps/${app}/src/env.ts`;
      const result = await runEnvGuard({
        [file]: "const RawEnvSchema = z.object(\n  {\n    OTHER_PORT: z.number(),\n  },\n);\n",
      });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:3 OTHER_PORT must use ${prefix} in RawEnvSchema`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "rejects an unrecognized backend environment schema",
    async () => {
      const result = await runEnvGuard({ "apps/api/src/env.ts": "export const env = {};\n" });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain("apps/api/src/env.ts:1 Raw env schema was not found");
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(backendApps)(
    "rejects direct environment access outside $app env.ts",
    async ({ app, prefix }) => {
      const file = `apps/${app}/src/service.ts`;
      const result = await runEnvGuard({ [file]: `export const port = process.env.${prefix}PORT;\n` });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:1 backend process.env reads must stay inside src/env.ts`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "rejects string-key environment access outside backend env.ts",
    async () => {
      const result = await runEnvGuard({
        "apps/api/src/service.ts": 'export const port = process.env["IAM_API_PORT"];\n',
      });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain("backend process.env reads must stay inside src/env.ts");
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "allows direct environment access in backend tests",
    async () => {
      const result = await runEnvGuard({
        "apps/api/src/__tests__/service.test.ts": "process.env.IAM_API_PORT = '30000';\n",
      });
      expect(result.exitCode, result.output).toBe(0);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each([...backendApps, ...frontendApps])(
    "rejects an environment example with the wrong prefix in $app",
    async ({ app, prefix }) => {
      const file = `apps/${app}/.env.example`;
      const result = await runEnvGuard({ [file]: "OTHER_URL=http://localhost\n" });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:1 OTHER_URL must use one of ${prefix}`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(frontendApps)(
    "rejects an environment read with the wrong namespace in $app config",
    async ({ app, prefix }) => {
      const file = `apps/${app}/src/constants/config.ts`;
      const result = await runEnvGuard({ [file]: "export const url = process.env.UMI_APP_OTHER_API_PREFIX;\n" });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:1 UMI_APP_OTHER_API_PREFIX must use ${prefix}`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(frontendApps)(
    "rejects direct environment access outside $app constants/config.ts",
    async ({ app, prefix }) => {
      const file = `apps/${app}/src/pages/Home.tsx`;
      const result = await runEnvGuard({ [file]: `export const url = process.env.${prefix}API_PREFIX;\n` });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:1 frontend process.env reads must stay inside constants/config.ts`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test.each(frontendApps)(
    "rejects a public environment variable with the wrong prefix in $app Dockerfile",
    async ({ app, prefix }) => {
      const file = `apps/${app}/Dockerfile`;
      const result = await runEnvGuard({ [file]: "ARG UMI_APP_OTHER_API_PREFIX\n" });
      expect(result.exitCode, result.output).toBe(1);
      expect(result.output).toContain(`${file}:1 UMI_APP_OTHER_API_PREFIX must use ${prefix}`);
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "allows generic infrastructure variable names in Docker configuration",
    async () => {
      const result = await runEnvGuard({
        "docker/.env.dev.example": "DATABASE_URL=postgresql://localhost/iam\n",
        "docker/.env.prod.example": "REDIS_URL=redis://localhost:6379\n",
        "docker/compose.dev.yaml": "services:\n  tool:\n    environment:\n      LOG_LEVEL: info\n",
        "apps/admin/Dockerfile": "ARG DATABASE_URL\nARG UMI_APP_ADMIN_API_PREFIX\n",
        "apps/sso/Dockerfile": "ARG LOG_LEVEL\nARG UMI_APP_SSO_API_PREFIX\n",
      });
      expect(result.exitCode, result.output).toBe(0);
      expect(result.output).toContain("Env name guard passed.");
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
