import {
  clientRuntimeVerifyExitCode,
  parseClientRuntimeVerifyArgs,
  runClientRuntimeVerifyCommand,
} from "@worker/commands/client-runtime/client-runtime-verify";
import { createClientRuntimeVerifyCommandRedis } from "@worker/composition/client-runtime-command-redis";
import { createClientRuntimeVerifyCommandComposition } from "@worker/composition/client-runtime-verify";
import { describe, expect, mock, test } from "bun:test";

describe("Client Runtime restore verify command", () => {
  test("requires full mode and explicit traffic-stop confirmation", () => {
    expect(parseClientRuntimeVerifyArgs(["--all", "--protocol-traffic-stopped"])).toEqual({
      protocolTrafficStopped: true,
    });

    for (const argv of [
      [],
      ["--all"],
      ["--protocol-traffic-stopped"],
      ["--client-code", "client-a"],
      ["--all", "--all", "--protocol-traffic-stopped"],
      ["--all", "--protocol-traffic-stopped", "--protocol-traffic-stopped"],
      ["--all", "--protocol-traffic-stopped", "extra"],
    ]) {
      expect(() => parseClientRuntimeVerifyArgs(argv)).toThrow();
    }
  });

  test("uses a fresh read-only verification and gates success on an empty owner inventory", async () => {
    const verifyAllAfterRedisRestore = mock(async () => ({ matchingKeys: 0 }));
    const reports: string[] = [];
    const report = await runClientRuntimeVerifyCommand(
      {
        verifier: {
          verifyAllAfterRedisRestore,
        },
      },
      {
        protocolTrafficStopped: true,
        reportSink: serialized => reports.push(serialized),
      },
    );

    expect(report).toEqual({
      schemaVersion: 1,
      operation: "verify-all",
      status: "completed",
      matchingKeys: 0,
    });
    expect(verifyAllAfterRedisRestore).toHaveBeenCalledWith({
      protocolTrafficStopped: true,
    });
    expect(reports).toEqual([
      "{\"schemaVersion\":1,\"operation\":\"verify-all\",\"status\":\"completed\",\"matchingKeys\":0}\n",
    ]);
    expect(clientRuntimeVerifyExitCode(report)).toBe(0);

    verifyAllAfterRedisRestore.mockResolvedValueOnce({ matchingKeys: 2 });
    const blocked = await runClientRuntimeVerifyCommand(
      {
        verifier: {
          verifyAllAfterRedisRestore,
        },
      },
      { protocolTrafficStopped: true, reportSink() {} },
    );
    expect(blocked).toMatchObject({ status: "failed", matchingKeys: 2 });
    expect(clientRuntimeVerifyExitCode(blocked)).toBe(1);
  });

  test("composes a scan-only verifier without repair capabilities", async () => {
    const composition = createClientRuntimeVerifyCommandComposition({
      env: {
        redis: { host: "127.0.0.1", port: 1, db: 15 },
        nodeEnv: "test",
        log: { level: "warn", format: "json" },
      },
      logger: { info() {} } as never,
    });

    expect(composition).toHaveProperty("verifier");
    expect(composition).not.toHaveProperty("maintenance");
    expect(composition.verifier).not.toHaveProperty("repairClient");
    expect(composition.verifier).not.toHaveProperty("repairAllAfterRedisRestore");
    await composition.shutdown("component-test");
  });

  test("wires verify through a structurally scan-only Redis facade", async () => {
    const commandRedis = createClientRuntimeVerifyCommandRedis({
      config: { host: "127.0.0.1", port: 1, db: 15 },
      logger: { info() {} } as never,
    });

    expect(commandRedis.redis).toHaveProperty("scan");
    expect(commandRedis.redis).not.toHaveProperty("eval");
    expect(commandRedis.redis).not.toHaveProperty("unlink");
    // @ts-expect-error Verify Redis is intentionally scan-only.
    expect(commandRedis.redis.eval).toBeUndefined();
    // @ts-expect-error Verify Redis is intentionally scan-only.
    expect(commandRedis.redis.unlink).toBeUndefined();
    await commandRedis.shutdown("component-test");
  });
});
