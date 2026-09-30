import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { COMMAND_FIXTURE_TEST_TIMEOUT_MS, runOwnedCommand, withCommandFixture } from "./command-fixture";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const requiredEmptyFiles = [
  "apps/api/.env.example",
  "apps/admin-api/.env.example",
  "apps/worker/.env.example",
  "apps/admin/.env.example",
  "apps/sso/.env.example",
  "docker/.env.dev.example",
  "docker/.env.prod.example",
  "docker/docker-compose-dev.yml",
  "docker/docker-compose-prod.yml",
  "docker/docker-compose-frontend-prod.yml",
  "apps/admin/Dockerfile",
  "apps/sso/Dockerfile",
];

async function writeFixtureFile(root: string, path: string, source: string) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, source, "utf8");
}

async function initializeEnvGuardFixture(root: string, apiSchema: string) {
  await mkdir(join(root, "scripts"), { recursive: true });
  await copyFile(join(repoRoot, "scripts", "check-env-names.ts"), join(root, "scripts", "check-env-names.ts"));
  await writeFixtureFile(root, "apps/api/src/env.ts", apiSchema);
  await writeFixtureFile(
    root,
    "apps/admin-api/src/env.ts",
    "const RawAdminApiEnvSchema = z.object(\n  {\n    IAM_ADMIN_API_PORT: z.number(),\n  },\n);\n",
  );
  await writeFixtureFile(
    root,
    "apps/worker/src/env.ts",
    "const RawWorkerEnvSchema = z.object({\n  IAM_WORKER_PORT: z.number(),\n});\n",
  );
  for (const path of requiredEmptyFiles) await writeFixtureFile(root, path, "");
}

describe("env name guard process", () => {
  test(
    "accepts single-line and formatter-expanded z.object schema starts",
    async () => {
      await withCommandFixture("iam-env-name-guard-", async (root, signal) => {
        await initializeEnvGuardFixture(root, "const RawApiEnvSchema = z.object({ IAM_API_PORT: z.number() });\n");
        const result = await runOwnedCommand([process.execPath, "scripts/check-env-names.ts"], root, signal);
        expect(result.exitCode, result.output).toBe(0);
        expect(result.output).toContain("Env name guard passed.");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );

  test(
    "rejects a formatter-expanded schema key with the wrong app prefix",
    async () => {
      await withCommandFixture("iam-env-name-guard-", async (root, signal) => {
        await initializeEnvGuardFixture(
          root,
          "const RawApiEnvSchema = z.object(\n  {\n    OTHER_PORT: z.number(),\n  },\n);\n",
        );
        const result = await runOwnedCommand([process.execPath, "scripts/check-env-names.ts"], root, signal);
        expect(result.exitCode).toBe(1);
        expect(result.output).toContain("OTHER_PORT must use IAM_API_ in RawEnvSchema");
      });
    },
    COMMAND_FIXTURE_TEST_TIMEOUT_MS,
  );
});
