import { afterEach, expect, test } from "bun:test";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeEnvironment,
  createProcessSmokeSuite,
  spawnOwnedProcessTree,
} from "@iam/test-support/process-smoke-harness";
import { useGatewayPostgresTestHarness } from "../support/postgres-test-harness";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const smoke = createProcessSmokeSuite({ label: "Gateway entry", temporaryDirectoryPrefix: "iam-gateway-entry-" });
afterEach(smoke.cleanup);

const getDatabase = useGatewayPostgresTestHarness();

test("the formal Gateway process serves authenticated validation and closes its owned database pool", async () => {
  const database = getDatabase();
  let origin = "";
  let logs: ReturnType<typeof createBoundedProcessLogCapture> | undefined;
  await database.db.insert(clients).values({
    clientCode: "tender",
    clientName: "Test",
    clientSecret: "synthetic-client-key",
    extAttributes: {},
    status: ClientStatus.Enable,
  });
  const outcome = await smoke.run({
    start(context) {
      origin = `http://${context.hostname}:${context.port}`;
      const child = spawnOwnedProcessTree({
        executable: process.execPath,
        args: ["run", "--no-env-file", "src/main.ts"],
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
            NO_PROXY: "127.0.0.1,localhost",
            no_proxy: "127.0.0.1,localhost",
          },
        }),
      });
      const capture = createBoundedProcessLogCapture(child, { maxBytes: 32_768 });
      child.once("close", capture.dispose);
      logs = capture;
      return child;
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
      const closed = once(child, "close", { signal: AbortSignal.timeout(5_000) });
      child.kill("SIGTERM");
      const result = await closed;
      expect(result).toEqual([0, null]);
      expect(logs?.snapshot()).toContain('"event":"gateway_stopped"');
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
}, 45_000);
