import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import {
  createBoundedProcessLogCapture,
  createProcessSmokeSuite,
  type ProcessSmokeChild,
  ProcessSmokeError,
  runProcessSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";
import { captureFailure, FakeChild, stopFakeChild } from "../../src/__tests__/fixtures/process-smoke.fixture";

function processTreeScript(detachedDescendants: boolean) {
  const descendant = `
    const watchdog = setTimeout(() => process.exit(1), 15_000);
    process.once("SIGTERM", () => {
      clearTimeout(watchdog);
      console.error("stopped " + process.pid);
    });
    console.log("ready " + process.pid);
  `;
  return `
    const { spawn } = require("node:child_process");
    if (${!detachedDescendants}) {
      process.stdin.once("data", (chunk) => console.log(String(chunk).trim()));
      process.once("SIGTERM", () => process.stdin.pause());
    } else {
      process.once("SIGTERM", () => {});
    }
    for (let index = 0; index < 2; index++) {
      spawn(process.execPath, ["-e", ${JSON.stringify(descendant)}], {
        detached: ${detachedDescendants}, stdio: ["ignore", "inherit", "inherit"],
      });
    }
  `;
}

async function assertProcessTreeShutdown(child: ProcessSmokeChild, detachedDescendants: boolean) {
  const output = createBoundedProcessLogCapture(child, { maxBytes: 4_096 });
  try {
    const pids = await runProcessSmoke({
      label: "process tree with inherited stdio",
      start: () => child,
      async probe() {
        const pids = Array.from(output.snapshot().matchAll(/ready (\d+)/gu), ([, pid]) => Number(pid));
        if (pids.length !== 2) return undefined;
        for (const pid of pids) {
          const stat = await readFile(`/proc/${pid}/stat`, "utf8");
          const group = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[2]);
          const expectedGroup = detachedDescendants ? pid : child.pid;
          if (group !== expectedGroup) throw new Error(`process ${pid} is in unexpected group ${group}`);
        }
        return pids;
      },
      readinessTimeoutMs: 5_000,
      cleanupTimeoutMs: 3_000,
    });

    expect(child.exitCode).toBe(0);
    expect(child.stdout?.readableEnded).toBe(true);
    expect(child.stderr?.readableEnded).toBe(true);
    for (const pid of pids) {
      expect(output.snapshot()).toContain(`stopped ${pid}`);
      const exit = await captureFailure(access(`/proc/${pid}`));
      expect(exit).toMatchObject({ code: "ENOENT" });
    }
    return output.snapshot();
  } finally {
    output.dispose();
  }
}

describe("process smoke harness resource ownership", () => {
  it("stops descendants in separate process groups and drains their inherited stdio", async () => {
    const child = spawnOwnedProcessTree({
      executable: process.execPath,
      args: ["-e", processTreeScript(true)],
      cwd: process.cwd(),
      env: process.env,
    });

    await assertProcessTreeShutdown(child, true);
  }, 15_000);

  it("stops the process group of a direct detached child with piped stdin", async () => {
    const child = spawn(process.execPath, ["-e", processTreeScript(false)], { detached: true, stdio: "pipe" });
    child.stdin.write("fixture input\n");

    const output = await assertProcessTreeShutdown(child, false);
    expect(output).toContain("fixture input");
    expect(child.stdin.destroyed).toBe(true);
  }, 15_000);

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
