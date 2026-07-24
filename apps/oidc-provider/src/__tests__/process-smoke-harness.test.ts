import type {
  ProcessSmokeChild,
  ProcessTreeOwner,
} from "./process-smoke-harness.ts";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { access, writeFile } from "node:fs/promises";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  FatalReadinessError,
  PortCollisionError,
  ProcessSmokeError,
  recoverFromPortCollision,
  runProcessSmoke,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "./process-smoke-harness.ts";

class FakeChild extends EventEmitter implements ProcessSmokeChild {
  readonly pid = 321;
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  private closed = false;

  constructor(readonly processTreeOwner?: ProcessTreeOwner) {
    super();
  }

  kill(signal: NodeJS.Signals = "SIGTERM") {
    this.finish(null, signal);
    return true;
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null = null) {
    if (this.exitCode !== null || this.signalCode !== null)
      return;
    this.exitCode = code;
    this.signalCode = signal;
    this.emit("exit", code, signal);
  }

  emitClose() {
    if (this.closed)
      return;
    this.closed = true;
    this.stdout.end();
    this.stderr.end();
    this.stdout.destroy();
    this.stderr.destroy();
    this.emit("close", this.exitCode, this.signalCode);
  }

  finish(code: number | null, signal: NodeJS.Signals | null = null) {
    this.emitExit(code, signal);
    this.emitClose();
  }
}

async function captureFailure(promise: Promise<unknown>) {
  let failure: unknown;
  try {
    await promise;
  }
  catch (error) {
    failure = error;
  }
  if (!(failure instanceof Error))
    throw new Error("expected the process smoke operation to fail");
  return failure;
}

function stopFakeChild(child: ProcessSmokeChild) {
  child.kill("SIGKILL");
  return Promise.resolve();
}

describe("process smoke harness", () => {
  it("reports an early exit with bounded stderr diagnostics", async () => {
    const child = new FakeChild();
    const failurePromise = runProcessSmoke({
      label: "fast-fail",
      start: () => child,
      probe: async () => undefined,
      stop: stopFakeChild,
      maxOutputBytes: 96,
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    });

    queueMicrotask(() => {
      child.stderr.write(`discard-me:${"x".repeat(256)}:useful-tail`);
      child.finish(23);
    });

    const failure = await captureFailure(failurePromise);
    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("exited before readiness");
    expect(failure.message).toContain("exitCode=23");
    expect(failure.message).toContain("output truncated");
    expect(failure.message).not.toContain("discard-me");
    expect(failure.message).toContain("useful-tail");
  });

  it("drains output emitted between exit and close before reporting failure", async () => {
    const child = new FakeChild();
    const failurePromise = runProcessSmoke({
      label: "exit-before-close",
      start: () => child,
      probe: async () => undefined,
      stop: stopFakeChild,
      outputDrainTimeoutMs: 50,
      pollIntervalMs: 1,
      readinessTimeoutMs: 5,
      cleanupTimeoutMs: 50,
    });

    queueMicrotask(() => {
      child.emitExit(98);
      child.stderr.write("late startup failure: EADDRINUSE");
      setTimeout(() => child.emitClose(), 10);
    });

    const failure = await captureFailure(failurePromise);
    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("exited before readiness");
    expect(failure.message).toContain("exitCode=98");
    expect(failure.message).toContain("late startup failure: EADDRINUSE");
  });

  it("reports a child spawn error immediately", async () => {
    const child = new FakeChild();
    const failurePromise = runProcessSmoke({
      label: "spawn-error",
      start: () => child,
      probe: async () => undefined,
      stop: stopFakeChild,
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    });

    queueMicrotask(() => child.emit("error", new Error("spawn ENOENT")));

    const failure = await captureFailure(failurePromise);
    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("child error before readiness");
    expect(failure.message).toContain("spawn ENOENT");
  });

  it("does not accept a matching protocol response without child-owned startup evidence", async () => {
    const child = new FakeChild();
    const failurePromise = runProcessSmoke({
      label: "competing-server",
      start: () => child,
      probe: async () => ({ issuer: "http://issuer.test/oidc" }),
      childReadinessEvidence: "owned listener ready",
      stop: stopFakeChild,
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    });

    queueMicrotask(() => child.finish(98));

    const failure = await captureFailure(failurePromise);
    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("exited before readiness");
  });

  it("requires both child-owned evidence and a successful protocol probe", async () => {
    const child = new FakeChild();
    queueMicrotask(() => {
      child.stdout.write("owned listener ");
      queueMicrotask(() => child.stdout.write("ready"));
    });

    const result = await runProcessSmoke({
      label: "owned-server",
      start: () => child,
      probe: async () => ({ issuer: "http://issuer.test/oidc" }),
      childReadinessEvidence: "owned listener ready",
      stop: stopFakeChild,
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    });

    expect(result).toEqual({ issuer: "http://issuer.test/oidc" });
  });

  it("reports a real spawn ENOENT without inventing a cleanup failure", async () => {
    const failure = await captureFailure(runProcessSmoke({
      label: "missing-command",
      start: () => spawn(
        "iam-process-smoke-command-that-does-not-exist",
        [],
        { stdio: ["ignore", "pipe", "pipe"] },
      ),
      probe: async () => undefined,
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 100,
    }));

    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure).not.toBeInstanceOf(AggregateError);
    expect(failure.message).toContain("child error before readiness");
    expect(failure.message).toContain("ENOENT");
  });

  it("times out a never-ready child quickly and still cleans it up", async () => {
    const child = new FakeChild();
    let cleaned = false;

    const failure = await captureFailure(runProcessSmoke({
      label: "never-ready",
      start: () => child,
      probe: async () => undefined,
      stop: async (processChild) => {
        cleaned = true;
        await stopFakeChild(processChild);
      },
      pollIntervalMs: 1,
      readinessTimeoutMs: 5,
      cleanupTimeoutMs: 50,
    }));

    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("readiness deadline exceeded after 5ms");
    expect(cleaned).toBe(true);
  });

  it("preserves both an assertion failure and a cleanup failure", async () => {
    const child = new FakeChild();

    const failure = await captureFailure(runProcessSmoke({
      label: "assertion-and-cleanup",
      start: () => child,
      probe: async () => {
        throw new FatalReadinessError("discovery issuer mismatch");
      },
      stop: async () => {
        throw new Error("tree cleanup failed");
      },
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    }));

    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.message).toContain("readiness and cleanup both failed");
    expect(failure.message).toContain("tree cleanup failed");
    expect((failure as AggregateError).errors).toHaveLength(2);
  });

  it("fails a successful readiness probe when cleanup fails", async () => {
    const child = new FakeChild();

    const failure = await captureFailure(runProcessSmoke({
      label: "cleanup-only",
      start: () => child,
      probe: async () => ({ issuer: "http://issuer.test/oidc" }),
      stop: async () => {
        throw new Error("cleanup deadline exceeded");
      },
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 50,
    }));

    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("cleanup failed");
    expect(failure.message).toContain("cleanup deadline exceeded");
  });

  it("bounds a cleanup operation that never settles", async () => {
    const child = new FakeChild();

    const failure = await captureFailure(runProcessSmoke({
      label: "cleanup-timeout",
      start: () => child,
      probe: async () => "ready",
      stop: async () => await new Promise<void>(() => {}),
      pollIntervalMs: 1,
      readinessTimeoutMs: 100,
      cleanupTimeoutMs: 5,
    }));

    expect(failure).toBeInstanceOf(ProcessSmokeError);
    expect(failure.message).toContain("cleanup deadline exceeded after 5ms");
  });

  it("retries only explicit port collisions", async () => {
    let attempts = 0;
    const result = await recoverFromPortCollision(async () => {
      attempts += 1;
      if (attempts === 1)
        throw new PortCollisionError("reserved port was taken");
      return "ready";
    }, { maxAttempts: 3 });

    expect(result).toBe("ready");
    expect(attempts).toBe(2);

    attempts = 0;
    const failure = await captureFailure(recoverFromPortCollision(async () => {
      attempts += 1;
      throw new Error("configuration failed");
    }, { maxAttempts: 3 }));
    expect(failure.message).toContain("configuration failed");
    expect(attempts).toBe(1);
  });

  it("terminates a POSIX process group instead of only its parent", async () => {
    const child = new FakeChild();
    const calls: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    let treeAlive = true;

    await terminateProcessTree(child, {
      platform: "linux",
      timeoutMs: 50,
      forceAfterMs: 25,
      isProcessTreeAlive: async () => treeAlive,
      killProcess(pid, signal) {
        calls.push({ pid, signal });
        treeAlive = false;
        child.finish(null, signal);
      },
    });

    expect(calls).toEqual([{ pid: -321, signal: "SIGTERM" }]);
  });

  it("kills descendants when the POSIX group leader exited first", async () => {
    const child = new FakeChild();
    const calls: Array<{ pid: number; signal: NodeJS.Signals }> = [];
    let treeAlive = true;
    child.finish(0);

    await terminateProcessTree(child, {
      platform: "linux",
      timeoutMs: 50,
      forceAfterMs: 2,
      pollIntervalMs: 1,
      isProcessTreeAlive: async () => treeAlive,
      killProcess(pid, signal) {
        calls.push({ pid, signal });
        if (signal === "SIGKILL")
          treeAlive = false;
      },
    });

    expect(calls).toEqual([
      { pid: -321, signal: "SIGTERM" },
      { pid: -321, signal: "SIGKILL" },
    ]);
  });

  it("fails when POSIX descendants survive the forced group kill", async () => {
    const child = new FakeChild();
    child.finish(0);

    const failure = await captureFailure(terminateProcessTree(child, {
      platform: "linux",
      timeoutMs: 5,
      forceAfterMs: 1,
      pollIntervalMs: 1,
      isProcessTreeAlive: async () => true,
      killProcess() {},
    }));

    expect(failure.message).toContain("process group 321 did not exit");
  });

  it("uses taskkill tree semantics on Windows", async () => {
    const child = new FakeChild();
    const pids: number[] = [];

    await terminateProcessTree(child, {
      platform: "win32",
      timeoutMs: 50,
      async runWindowsTreeKill(pid) {
        pids.push(pid);
        child.finish(null, "SIGKILL");
      },
    });

    expect(pids).toEqual([321]);
  });

  it("accepts a closed Windows Job supervisor as full-tree proof", async () => {
    const child = new FakeChild("windows-job");
    const pids: number[] = [];
    child.finish(0);

    await terminateProcessTree(child, {
      platform: "win32",
      timeoutMs: 50,
      async runWindowsTreeKill(pid) {
        pids.push(pid);
      },
    });

    expect(pids).toEqual([]);
  });

  it("fails when the Windows tree owner cannot confirm cleanup", async () => {
    const child = new FakeChild();
    child.finish(0);

    const failure = await captureFailure(terminateProcessTree(child, {
      platform: "win32",
      timeoutMs: 50,
      async runWindowsTreeKill() {
        throw new Error("tree owner no longer addressable");
      },
    }));

    expect(failure.message).toContain("tree owner no longer addressable");
  });

  it("creates and removes an owned temporary directory for each attempt", async () => {
    let ownedDirectory = "";

    await withOwnedTemporaryDirectory({
      prefix: "iam-oidc-smoke-harness-",
      cleanupTimeoutMs: 2_000,
      async run(directory) {
        ownedDirectory = directory;
        await writeFile(`${directory}/owned.txt`, "owned", "utf8");
        await expect(access(directory)).resolves.toBeUndefined();
      },
    });

    await expect(access(ownedDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("removes its temporary directory when the attempt fails", async () => {
    let ownedDirectory = "";

    const failure = await captureFailure(withOwnedTemporaryDirectory({
      prefix: "iam-oidc-smoke-harness-",
      cleanupTimeoutMs: 2_000,
      async run(directory) {
        ownedDirectory = directory;
        await writeFile(`${directory}/owned.txt`, "owned", "utf8");
        throw new Error("attempt assertion failed");
      },
    }));

    expect(failure.message).toContain("attempt assertion failed");
    await expect(access(ownedDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
