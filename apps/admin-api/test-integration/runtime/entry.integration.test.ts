import { afterEach, describe, expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { ProcessSmokeAttemptContext } from "@iam/test-support/process-smoke-harness";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/test-support/process-smoke-harness";

const adminApiRoot = fileURLToPath(new URL("../../", import.meta.url));
const entrySmoke = createProcessSmokeSuite({
  label: "Admin API entry",
  temporaryDirectoryPrefix: "iam-admin-api-entry-smoke-",
  hostname: "localhost",
});

afterEach(entrySmoke.cleanup);

function entryOrigin(context: ProcessSmokeAttemptContext) {
  return `http://${context.hostname}:${context.port}`;
}

function createEntryEnvironment(context: ProcessSmokeAttemptContext, nodeEnv: "development" | "production") {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: nodeEnv,
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: String(context.port),
      IAM_ADMIN_API_REDIS_URL: "redis://127.0.0.1:1/15",
      IAM_ADMIN_API_LOG_LEVEL: "silent",
      IAM_ADMIN_API_LOG_FORMAT: "json",
      IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: `sess:admin-api-entry-smoke:${context.port}:`,
      FORCE_COLOR: "0",
      NO_COLOR: "1",
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    },
  });
}

function runEntry<T>(
  nodeEnv: "development" | "production",
  probe: (origin: string, signal: AbortSignal) => Promise<T>,
) {
  return entrySmoke.run({
    start: (context) =>
      spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: adminApiRoot,
        env: createEntryEnvironment(context, nodeEnv),
      }),
    probe: (context, signal) => probe(entryOrigin(context), signal),
    childReadinessEvidence: (context) => `server: ${entryOrigin(context)}`,
  });
}

describe("Admin API entry", () => {
  test(
    "keeps Scalar and OpenAPI endpoints closed in production",
    async () => {
      const statuses = await runEntry("production", async (origin, signal) => {
        const paths = ["/", "/admin/doc", "/rpc/doc"];
        return Object.fromEntries(
          await Promise.all(
            paths.map(async (path) => {
              const response = await fetch(`${origin}${path}`, { signal });
              await response.body?.cancel();
              return [path, response.status] as const;
            }),
          ),
        );
      });

      // Ordinary Admin and RPC authentication still applies when the schema routes are absent.
      expect(statuses).toEqual({ "/": 404, "/admin/doc": 403, "/rpc/doc": 403 });
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );

  test(
    "serves Scalar and the Admin OpenAPI schema in development",
    async () => {
      const result = await runEntry("development", async (origin, signal) => {
        const [page, schema] = await Promise.all([
          fetch(`${origin}/`, { signal }),
          fetch(`${origin}/admin/doc`, { signal }),
        ]);
        return {
          scalar: { status: page.status, html: await page.text() },
          status: schema.status,
          document: await schema.json(),
        };
      });

      expect(result.scalar.status).toBe(200);
      expect(result.scalar.html).toContain("/admin/doc");
      expect(result.status).toBe(200);
      expect(result.document).toMatchObject({
        openapi: "3.1.0",
        info: { title: "管理端API", version: "1.0.0" },
      });
    },
    PROCESS_SMOKE_TEST_TIMEOUT_MS,
  );
});
