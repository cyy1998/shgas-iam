import { afterEach, beforeEach, expect, test } from "bun:test";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { clients } from "@iam/db/schema";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
  type ProcessSmokeAttemptContext,
  spawnOwnedProcessTree,
  terminateProcessTree,
} from "@iam/test-support/process-smoke-harness";
import { ownIntegrationTestExecutor, resetIntegrationRedisTestDatabase } from "../support/fixture-lifecycle";
import { createIntegrationPostgresTestHarness, requireIntegrationRedisUrl } from "../support/resources.fixture";

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const entry = createProcessSmokeSuite({
  label: "integration-api entry",
  temporaryDirectoryPrefix: "iam-integration-api-entry-",
  hostname: "127.0.0.1",
});
beforeEach(() => {
  ownIntegrationTestExecutor(entry.cleanup);
});
afterEach(resetIntegrationRedisTestDatabase);

function startEntry(context: ProcessSmokeAttemptContext, databaseUrl: string) {
  return spawnOwnedProcessTree({
    executable: process.execPath,
    args: ["--no-env-file", "run", "src/index.ts"],
    cwd: workspace,
    env: createProcessSmokeEnvironment({
      source: process.env,
      temporaryDirectory: context.temporaryDirectory,
      overrides: {
        NODE_ENV: "production",
        IAM_INTEGRATION_API_PORT: String(context.port),
        IAM_INTEGRATION_API_DATABASE_URL: databaseUrl,
        IAM_INTEGRATION_API_REDIS_URL: requireIntegrationRedisUrl(),
        IAM_INTEGRATION_API_SMS_URL: "https://sms.example.test/send",
        IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: "smoke-test-key",
      },
    }),
  });
}

function readinessEvidence({ port }: ProcessSmokeAttemptContext) {
  return `server: http://localhost:${port}`;
}

async function readProbes(origin: string, signal: AbortSignal) {
  const health = await fetch(`${origin}/health`, { signal });
  const ready = await fetch(`${origin}/ready`, { signal });
  return {
    health: { status: health.status, body: await health.json() },
    ready: { status: ready.status, body: await ready.json() },
  };
}

test(
  "starts with only integration service configuration and shuts down on SIGTERM",
  async () => {
    const pg = await createIntegrationPostgresTestHarness();
    let capture: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
    try {
      await pg.db.insert(clients).values({
        clientCode: "smoke-entry",
        clientName: "Smoke",
        clientSecret: "smoke-query-key",
        extAttributes: {},
      });
      const result = await entry.run({
        start(context) {
          const child = startEntry(context, pg.databaseUrl);
          capture = createBoundedProcessLogCapture(child, { maxBytes: 64 * 1024 });
          return child;
        },
        childReadinessEvidence: readinessEvidence,
        async probe({ hostname, port }, signal) {
          const origin = `http://${hostname}:${port}`;
          const probes = await readProbes(origin, signal);
          if (probes.health.status === 503) return undefined;
          const requests = [
            ["/internal/users/search-dsl", {}],
            ["/internal/organizations/search-dsl", {}],
            ["/internal/delegations/resolve", { usernames: ["missing"], orgCode: "MISSING" }],
          ] as const;
          const queryStatuses = await Promise.all(
            requests.map(async ([path, body]) => {
              const response = await fetch(origin + path, {
                signal,
                method: "POST",
                headers: { "Content-Type": "application/json", apikey: "smoke-query-key" },
                body: JSON.stringify(body),
              });
              await response.body?.cancel();
              return response.status;
            }),
          );
          const connections = await pg.sql`
          SELECT DISTINCT application_name FROM pg_stat_activity
          WHERE datname = current_database() AND application_name LIKE 'iam-integration-api%'
        `;
          const docs = await fetch(`${origin}/doc`, { signal });
          await docs.body?.cancel();
          return { ...probes, queryStatuses, connectionPools: connections.length, docsStatus: docs.status };
        },
        async stop(child) {
          await terminateProcessTree(child, { timeoutMs: 4_000 });
          if (process.platform !== "win32") expect(child.exitCode).toBe(0);
        },
      });
      expect(result).toEqual({
        health: { status: 200, body: { status: "ok" } },
        ready: { status: 200, body: { status: "ok" } },
        queryStatuses: [200, 200, 404],
        connectionPools: 4,
        docsStatus: 404,
      });
      const remaining = await pg.sql`
      SELECT application_name FROM pg_stat_activity
      WHERE datname = current_database() AND application_name LIKE 'iam-integration-api%'
    `;
      expect(remaining).toHaveLength(0);
      const logs = capture?.snapshot();
      expect(logs).toContain('"sourceApp":"integration-api"');
      if (process.platform !== "win32") expect(logs).toContain('"event":"integration.api.stopped"');
    } finally {
      capture?.dispose();
      await pg.close();
    }
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);

test(
  "health remains available when PostgreSQL cannot open the database",
  async () => {
    const pg = await createIntegrationPostgresTestHarness();
    try {
      const missingDatabase = new URL(pg.databaseUrl);
      missingDatabase.pathname += "_missing";
      const probes = await entry.run({
        start: (context) => startEntry(context, missingDatabase.href),
        childReadinessEvidence: readinessEvidence,
        async probe({ hostname, port }, signal) {
          const result = await readProbes(`http://${hostname}:${port}`, signal);
          return result.health.status === 200 ? result : undefined;
        },
      });
      expect(probes).toEqual({
        health: { status: 200, body: { status: "ok" } },
        ready: { status: 503, body: { status: "unavailable" } },
      });
    } finally {
      await pg.close();
    }
  },
  PROCESS_SMOKE_TEST_TIMEOUT_MS,
);
