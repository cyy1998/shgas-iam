import { PROCESS_SMOKE_TEST_TIMEOUT_MS } from "@iam/api-core/testing/process-smoke-harness";
import { describe, expect, test } from "bun:test";
import { createHangingRedisServer } from "./hanging-redis-server";
import { runClientRuntimeMaintenanceProcess } from "./worker-command-smoke-environment";

describe("Worker Client Runtime restore verify process", () => {
  test("rejects incomplete or targeted arguments before creating resources", async () => {
    for (const args of [
      [] as string[],
      ["--all"],
      ["--protocol-traffic-stopped"],
      ["--client-code", "client-a"],
    ]) {
      const result = await runVerifyProcess(args);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain(
        "Client Runtime restore verify failed; inspect structured logs for the safe report.",
      );
      expect(result.output).not.toContain("Client Runtime repair command shutting down");
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("bounds unavailable Redis and emits a safe failed verify report", async () => {
    const result = await runVerifyProcess(
      ["--all", "--protocol-traffic-stopped"],
      "verify-password-secret-must-not-log",
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("\"operation\":\"verify-all\"");
    expect(result.output).toContain("\"status\":\"failed\"");
    expect(result.output).not.toContain("verify-password-secret-must-not-log");
    expect(result.output).not.toContain("client-runtime-snapshot:v1");
    expect(result.output).not.toContain("payload");
    expect(result.output).not.toContain("credential");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("bounds a hanging read-only verify and cleans up the exact process and Redis socket", async () => {
    const hangingRedis = await createHangingRedisServer();
    const startedAt = Date.now();
    try {
      const result = await runVerifyProcess(
        ["--all", "--protocol-traffic-stopped"],
        "hanging-verify-secret-must-not-log",
        { redisPort: hangingRedis.port, maintenanceTimeoutMs: 50 },
      );

      expect(Date.now() - startedAt < 5_000).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("\"operation\":\"verify-all\"");
      expect(result.output).toContain("\"status\":\"failed\"");
      expect(result.output).not.toContain("hanging-verify-secret-must-not-log");
      expect(result.output).not.toContain("client-runtime-snapshot:v1");
    }
    finally {
      await hangingRedis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});

async function runVerifyProcess(
  args: string[],
  redisPassword?: string,
  resource: { redisPort?: number; maintenanceTimeoutMs?: number } = {},
) {
  return await runClientRuntimeMaintenanceProcess({
    args,
    entrypoint: "client-runtime-verify.ts",
    label: "Worker Client Runtime restore verify command",
    temporaryDirectoryPrefix: "iam-worker-client-runtime-verify-smoke-",
    redisPassword,
    ...resource,
  });
}
