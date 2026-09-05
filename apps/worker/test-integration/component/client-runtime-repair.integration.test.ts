import {
  clientRuntimeRepairExitCode,
  parseClientRuntimeRepairArgs,
  runClientRuntimeRepairCommand,
} from "@worker/commands/client-runtime/client-runtime-repair";
import { createClientRuntimeRepairCommandComposition } from "@worker/composition/client-runtime-repair";
import { describe, expect, mock, test } from "bun:test";

describe("Client Runtime targeted repair command", () => {
  test("returns a safe completed report even when reporting fails", async () => {
    const repairClient = mock(async () => {});
    const report = await runClientRuntimeRepairCommand(
      {
        maintenance: {
          repairClient,
          repairAllAfterRedisRestore: async () => ({ scannedKeys: 0, unlinkedKeys: 0, unlinkBatches: 0 }),
        },
      },
      {
        target: { mode: "client", clientCode: "客户端/legacy" },
        reportSink() {
          throw new Error("reporter-secret");
        },
      },
    );

    expect(report).toEqual({
      schemaVersion: 1,
      operation: "repair-client",
      status: "completed",
      clientCode: "客户端/legacy",
    });
    expect(repairClient).toHaveBeenCalledWith("客户端/legacy");
    expect(clientRuntimeRepairExitCode(report)).toBe(0);
  });

  test("collapses repair failures and timeouts into a stable failed report", async () => {
    const reports: string[] = [];
    const failed = await runClientRuntimeRepairCommand(
      {
        maintenance: {
          async repairClient() {
            throw new Error("redis://user:secret@runtime key payload credential");
          },
          repairAllAfterRedisRestore: async () => ({ scannedKeys: 0, unlinkedKeys: 0, unlinkBatches: 0 }),
        },
      },
      { target: { mode: "client", clientCode: "client-failed" }, reportSink: report => reports.push(report) },
    );
    const timedOut = await runClientRuntimeRepairCommand(
      {
        maintenance: {
          repairClient: () => new Promise<void>(() => {}),
          repairAllAfterRedisRestore: async () => ({ scannedKeys: 0, unlinkedKeys: 0, unlinkBatches: 0 }),
        },
      },
      {
        target: { mode: "client", clientCode: "client-timeout" },
        timeoutMs: 1,
        reportSink: report => reports.push(report),
      },
    );

    expect(failed).toEqual({
      schemaVersion: 1,
      operation: "repair-client",
      status: "failed",
      clientCode: "client-failed",
    });
    expect(timedOut).toEqual({
      schemaVersion: 1,
      operation: "repair-client",
      status: "failed",
      clientCode: "client-timeout",
    });
    expect(clientRuntimeRepairExitCode(failed)).toBe(1);
    expect(clientRuntimeRepairExitCode(timedOut)).toBe(1);
    expect(reports).toEqual([
      "{\"schemaVersion\":1,\"operation\":\"repair-client\",\"status\":\"failed\",\"clientCode\":\"client-failed\"}\n",
      "{\"schemaVersion\":1,\"operation\":\"repair-client\",\"status\":\"failed\",\"clientCode\":\"client-timeout\"}\n",
    ]);
    expect(JSON.stringify(reports)).not.toContain("redis://");
    expect(JSON.stringify(reports)).not.toContain("secret");
    expect(JSON.stringify(reports)).not.toContain("payload");
    expect(JSON.stringify(reports)).not.toContain("credential");
  });

  test("accepts exactly one canonical client code and rejects full-mode or malformed arguments", () => {
    expect(parseClientRuntimeRepairArgs(["--client-code", "legacy:客户端/😀"])).toEqual({
      mode: "client",
      clientCode: "legacy:客户端/😀",
    });
    expect(parseClientRuntimeRepairArgs(["--all", "--protocol-traffic-stopped"])).toEqual({
      mode: "all",
      protocolTrafficStopped: true,
    });

    for (const argv of [
      [],
      ["--client-code", ""],
      ["--client-code", "a".repeat(65)],
      ["--all"],
      ["--protocol-traffic-stopped"],
      ["--all", "--all", "--protocol-traffic-stopped"],
      ["--all", "--protocol-traffic-stopped", "--protocol-traffic-stopped"],
      ["--client-code", "client-a", "--all"],
      ["--client-code", "client-a", "--protocol-traffic-stopped"],
      ["--client-code", "client-a", "--client-code", "client-b"],
      ["--client-code=client-a", "--client-code=client-b"],
      ["--client-code", "client-a", "extra"],
      ["--unknown", "value"],
    ]) {
      expect(() => parseClientRuntimeRepairArgs(argv)).toThrow();
    }
  });

  test("runs full restore repair only with an explicit traffic-stop confirmation", async () => {
    const repairAllAfterRedisRestore = mock(async () => ({
      scannedKeys: 7,
      unlinkedKeys: 7,
      unlinkBatches: 4,
    }));
    const reports: string[] = [];
    const report = await runClientRuntimeRepairCommand(
      {
        maintenance: {
          repairClient: async () => {},
          repairAllAfterRedisRestore,
        },
      },
      {
        target: { mode: "all", protocolTrafficStopped: true },
        reportSink: serialized => reports.push(serialized),
      },
    );

    expect(report).toEqual({
      schemaVersion: 1,
      operation: "repair-all",
      status: "completed",
      scannedKeys: 7,
      unlinkedKeys: 7,
      unlinkBatches: 4,
    });
    expect(repairAllAfterRedisRestore).toHaveBeenCalledWith({
      protocolTrafficStopped: true,
    });
    expect(reports).toEqual([
      "{\"schemaVersion\":1,\"operation\":\"repair-all\",\"status\":\"completed\",\"scannedKeys\":7,\"unlinkedKeys\":7,\"unlinkBatches\":4}\n",
    ]);
    expect(clientRuntimeRepairExitCode(report)).toBe(0);
  });

  test("keeps shutdown reporting best effort while still closing resources", async () => {
    const composition = createClientRuntimeRepairCommandComposition({
      env: {
        redis: { host: "127.0.0.1", port: 1, db: 15 },
        nodeEnv: "test",
        log: { level: "warn", format: "json" },
      },
      logger: {
        info() {
          throw new Error("shutdown-reporter-secret");
        },
      } as never,
    });

    await composition.shutdown("component-test");
    expect(composition).not.toHaveProperty("reader");
  });
});
