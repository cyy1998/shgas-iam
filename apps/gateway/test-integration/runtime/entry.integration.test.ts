import { afterEach, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  spawnOwnedProcessTree,
} from "@iam/api-core/testing/process-smoke-harness";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const smoke = createProcessSmokeSuite({ label: "Gateway entry", temporaryDirectoryPrefix: "iam-gateway-entry-" });
afterEach(smoke.cleanup);

test("the formal Gateway process serves authenticated validation and closes its owned database pool", async () => {
  const database = await createGatewayPostgresTestHarness();
  let shutdownPath = "";
  let origin = "";
  try {
    await database.db.insert(clients).values({
      clientCode: "tender",
      clientName: "Test",
      clientSecret: "synthetic-client-key",
      extAttributes: {},
      status: ClientStatus.Enable,
    });
    const outcome = await smoke.run({
      start(context) {
        shutdownPath = path.join(context.temporaryDirectory, "shutdown");
        origin = `http://${context.hostname}:${context.port}`;
        return spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["run", "--no-env-file", "--preload", "./test-integration/runtime/shutdown.fixture.ts", "src/main.ts"],
          cwd: packageRoot,
          env: createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory: context.temporaryDirectory,
            overrides: {
              IAM_GATEWAY_DATABASE_URL: database.databaseUrl,
              IAM_GATEWAY_APISIX_ADMIN_URL: "http://127.0.0.1:1/apisix/admin",
              IAM_GATEWAY_APISIX_ADMIN_KEY: "synthetic-admin-key",
              IAM_GATEWAY_HOSTNAME: context.hostname,
              IAM_GATEWAY_PORT: String(context.port),
              IAM_GATEWAY_MAX_REQUEST_BYTES: "4096",
              IAM_GATEWAY_TEST_SHUTDOWN_PATH: shutdownPath,
              NO_PROXY: "127.0.0.1,localhost",
              no_proxy: "127.0.0.1,localhost",
            },
          }),
        });
      },
      childReadinessEvidence: "gateway_started",
      async probe(_context, signal) {
        const health = await fetch(`${origin}/health`, { signal });
        if (health.status !== 200) return undefined;
        const response = await fetch(`${origin}/validate`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", apikey: "synthetic-client-key" },
          body: JSON.stringify({ scope: "test:tender", yaml: "service: {}" }),
        });
        const body = await response.json();
        const oversized = await fetch(`${origin}/validate`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", apikey: "synthetic-client-key" },
          body: JSON.stringify({ scope: "test:tender", yaml: "service: {}".repeat(1024) }),
        });
        const oversizedBody = await oversized.json();
        return { status: response.status, body, oversizedStatus: oversized.status, oversizedBody };
      },
      async stop(child) {
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error("Gateway exited before the graceful shutdown request");
        const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) =>
          child.once("exit", (code, signal) => resolve({ code, signal })),
        );
        await writeFile(shutdownPath, "shutdown", "utf8");
        const result = await exited;
        expect(result).toEqual({ code: 0, signal: null });
      },
    });
    expect(outcome.status).toBe(200);
    expect(outcome.body.data).toMatchObject({ valid: true, resources: { services: 1 } });
    expect(outcome.oversizedStatus).toBe(413);
    expect(outcome.oversizedBody.code).toBe("GATEWAY_INPUT_TOO_LARGE");
    const sessions = await database.sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'iam-gateway' AND datname = current_database()`;
    expect(sessions[0]?.count).toBe(0);
    let stillListening = false;
    try {
      await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
      stillListening = true;
    } catch {}
    expect(stillListening).toBe(false);
  } finally {
    await database.close();
  }
}, 45_000);
