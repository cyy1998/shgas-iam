import type { ProcessSmokeAttemptContext } from "@iam/api-core/testing/process-smoke-harness";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PortCollisionError,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { afterEach, describe, expect, test } from "bun:test";

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

function createEntryEnvironment(context: ProcessSmokeAttemptContext) {
  return createProcessSmokeEnvironment({
    source: process.env,
    temporaryDirectory: context.temporaryDirectory,
    overrides: {
      NODE_ENV: "production",
      IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@127.0.0.1:1/iam",
      IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: "4",
      IAM_ADMIN_API_PORT: String(context.port),
      IAM_ADMIN_API_REDIS_HOST: "127.0.0.1",
      IAM_ADMIN_API_REDIS_PORT: "1",
      IAM_ADMIN_API_REDIS_DB: "15",
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

async function probeAdminApiDocs(origin: string, signal: AbortSignal) {
  const response = await fetch(`${origin}/admin/doc`, { signal });
  if (response.status !== 200) {
    throw new PortCollisionError(
      `port served an unexpected Admin API readiness status: expected 200, received ${response.status}`,
    );
  }

  let document: Record<string, unknown>;
  try {
    document = await response.json() as Record<string, unknown>;
  }
  catch (error) {
    throw new PortCollisionError("port did not serve the Admin API OpenAPI document", { cause: error });
  }
  const info = document.info;
  if (
    document.openapi !== "3.1.0"
    || typeof info !== "object"
    || info === null
    || (info as Record<string, unknown>).title !== "管理端API"
    || (info as Record<string, unknown>).version !== "1.0.0"
  ) {
    throw new PortCollisionError("port served an unexpected Admin API OpenAPI document");
  }
  return document;
}

describe("Admin API entry", () => {
  test("starts the production entry and exposes its OpenAPI readiness document", async () => {
    const document = await entrySmoke.run({
      start: context => spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["--no-env-file", "run", "src/index.ts"],
        cwd: adminApiRoot,
        env: createEntryEnvironment(context),
      }),
      probe: (context, signal) =>
        probeAdminApiDocs(entryOrigin(context), signal),
      childReadinessEvidence: context => `server: ${entryOrigin(context)}`,
    });

    expect(document).toMatchObject({
      openapi: "3.1.0",
      info: { title: "管理端API", version: "1.0.0" },
    });
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});
