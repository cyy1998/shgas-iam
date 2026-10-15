import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, writeFile } from "node:fs/promises";
import {
  createProcessSmokeSuite,
  ProcessSmokeError,
  runProcessSmoke,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { captureFailure, FakeChild, stopFakeChild } from "../../src/testing/__tests__/fixtures/process-smoke.fixture";

describe("process smoke harness resource ownership", () => {
  it("owns port allocation, temporary files, and child cleanup for an entry attempt", async () => {
    const child = new FakeChild();
    const allocatedHosts: string[] = [];
    let stopCalls = 0;
    const suite = createProcessSmokeSuite({
      label: "owned-entry",
      temporaryDirectoryPrefix: "iam-owned-entry-",
      hostname: "sentinel-host",
      async allocatePort(hostname) {
        allocatedHosts.push(hostname);
        return 43_210;
      },
    });

    const context = await suite.run({
      start: () => child,
      async probe(attempt) {
        await access(attempt.temporaryDirectory);
        return attempt;
      },
      async stop(processChild) {
        stopCalls += 1;
        await stopFakeChild(processChild);
      },
    });

    expect(context).toMatchObject({
      attemptNumber: 1,
      hostname: "sentinel-host",
      port: 43_210,
    });
    expect(allocatedHosts).toEqual(["sentinel-host"]);
    expect(stopCalls).toBe(1);
    const directoryError = await captureFailure(access(context.temporaryDirectory));
    expect(directoryError).toMatchObject({ code: "ENOENT" });
    const cleanupResult = await suite.cleanup();
    expect(cleanupResult).toBeUndefined();
  });
  it("reports a real spawn ENOENT without inventing a cleanup failure", async () => {
    const failure = await captureFailure(
      runProcessSmoke({
        label: "missing-command",
        start: () => spawn("iam-process-smoke-command-that-does-not-exist", [], { stdio: ["ignore", "pipe", "pipe"] }),
        probe: async () => undefined,
        pollIntervalMs: 1,
        readinessTimeoutMs: 100,
        cleanupTimeoutMs: 100,
      }),
    );

    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure).not.toBeInstanceOf(AggregateError);
    expect(failure.message).toContain("child error before readiness");
    expect(failure.cause).toMatchObject({ code: "ENOENT" });
    expect(failure.message).toContain("iam-process-smoke-command-that-does-not-exist");
  });
  it("creates and removes an owned temporary directory for each attempt", async () => {
    let ownedDirectory = "";

    await withOwnedTemporaryDirectory({
      prefix: "iam-api-core-process-smoke-",
      cleanupTimeoutMs: 2_000,
      async run(directory) {
        ownedDirectory = directory;
        await writeFile(`${directory}/owned.txt`, "owned", "utf8");
        expect(existsSync(directory)).toBe(true);
      },
    });

    const directoryError = await captureFailure(access(ownedDirectory));
    expect(directoryError).toMatchObject({ code: "ENOENT" });
  });
  it("removes its temporary directory when the attempt fails", async () => {
    let ownedDirectory = "";

    const failure = await captureFailure(
      withOwnedTemporaryDirectory({
        prefix: "iam-api-core-process-smoke-",
        cleanupTimeoutMs: 2_000,
        async run(directory) {
          ownedDirectory = directory;
          await writeFile(`${directory}/owned.txt`, "owned", "utf8");
          throw new Error("attempt assertion failed");
        },
      }),
    );

    expect(failure.message).toContain("attempt assertion failed");
    const directoryError = await captureFailure(access(ownedDirectory));
    expect(directoryError).toMatchObject({ code: "ENOENT" });
  });
});
