import { PROCESS_SMOKE_TEST_TIMEOUT_MS } from "@iam/api-core/testing/process-smoke-harness";
import { describe, expect, test } from "bun:test";
import { createHangingRedisServer } from "./hanging-redis-server";
import { runClientRuntimeMaintenanceProcess } from "./worker-command-smoke-environment";

describe("Worker Client Runtime targeted repair process", () => {
  test("rejects missing, empty, full-mode, and extra arguments before creating resources", async () => {
    const cases = [
      [] as string[],
      ["--client-code", ""],
      ["--all"],
      ["--protocol-traffic-stopped"],
      ["--client-code", "client-a", "--all"],
      ["--client-code", "client-a", "--client-code", "client-b"],
      ["--client-code", "client-a", "extra"],
    ];
    const outputs: string[] = [];
    for (const args of cases) {
      const result = await runRepairProcess(args);
      outputs.push(result.output);
      expect(result.exitCode).toBe(1);
    }

    expect(outputs).toHaveLength(cases.length);
    for (const output of outputs) {
      expect(output).toContain(
        "Client Runtime repair failed; inspect structured logs for the safe report.",
      );
      expect(output).not.toContain("Client Runtime repair command shutting down");
      expect(output).not.toContain("redis://");
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("bounds unavailable Redis, reports failure safely, and exits after exact process cleanup", async () => {
    const result = await runRepairProcess(
      ["--client-code", "process-client-canary"],
      "redis-password-secret-must-not-log",
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("\"operation\":\"repair-client\"");
    expect(result.output).toContain("\"status\":\"failed\"");
    expect(result.output).toContain("\"clientCode\":\"process-client-canary\"");
    expect(result.output).not.toContain("redis-password-secret-must-not-log");
    expect(result.output).not.toContain("client-runtime-snapshot:v1");
    expect(result.output).not.toContain("epoch");
    expect(result.output).not.toContain("generation");
    expect(result.output).not.toContain("payload");
    expect(result.output).not.toContain("credential");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("bounds unavailable Redis for confirmed full repair and emits only a safe failed report", async () => {
    const result = await runRepairProcess(
      ["--all", "--protocol-traffic-stopped"],
      "redis-password-secret-must-not-log",
    );

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain("\"operation\":\"repair-all\"");
    expect(result.output).toContain("\"status\":\"failed\"");
    expect(result.output).not.toContain("redis-password-secret-must-not-log");
    expect(result.output).not.toContain("client-runtime-snapshot:v1");
    expect(result.output).not.toContain("payload");
    expect(result.output).not.toContain("credential");
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);

  test("bounds a hanging full repair operation and cleans up the exact process and Redis socket", async () => {
    const hangingRedis = await createHangingRedisServer();
    const startedAt = Date.now();
    try {
      const result = await runRepairProcess(
        ["--all", "--protocol-traffic-stopped"],
        "hanging-repair-secret-must-not-log",
        { redisPort: hangingRedis.port, maintenanceTimeoutMs: 50 },
      );

      expect(Date.now() - startedAt < 5_000).toBe(true);
      expect(result.exitCode).toBe(1);
      expect(result.output).toContain("\"operation\":\"repair-all\"");
      expect(result.output).toContain("\"status\":\"failed\"");
      expect(result.output).not.toContain("hanging-repair-secret-must-not-log");
      expect(result.output).not.toContain("client-runtime-snapshot:v1");
    }
    finally {
      await hangingRedis.close();
    }
  }, PROCESS_SMOKE_TEST_TIMEOUT_MS);
});

async function runRepairProcess(
  args: string[],
  redisPassword?: string,
  resource: { redisPort?: number; maintenanceTimeoutMs?: number } = {},
) {
  return await runClientRuntimeMaintenanceProcess({
    args,
    entrypoint: "client-runtime-repair.ts",
    label: "Worker Client Runtime targeted repair command",
    temporaryDirectoryPrefix: "iam-worker-client-runtime-repair-smoke-",
    redisPassword,
    ...resource,
  });
}
