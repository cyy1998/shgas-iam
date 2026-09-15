import type { Socket } from "node:net";
import { createServer } from "node:net";
import { terminateProcessByPid } from "@iam/api-core/testing/process-smoke-harness";
import { describe, expect, test } from "bun:test";
import { captureCommand, runCommand } from "../../src/system-boundaries.ts";

async function withinDeadline<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  }
  finally {
    clearTimeout(timer);
  }
}

describe("system command process boundaries", () => {
  test("does not echo child output while preserving command failure", async () => {
    const childCode = [
      "process.stdout.write('SYNTHETIC-CHILD-OUTPUT');",
      "process.stderr.write('SYNTHETIC-CHILD-ERROR');",
      "process.exit(17);",
    ].join("\n");
    const boundaryUrl = new URL("../../src/system-boundaries.ts", import.meta.url).href;
    const runnerCode = [
      `import { runCommand } from ${JSON.stringify(boundaryUrl)};`,
      `try { await runCommand(process.execPath, ["-e", ${JSON.stringify(childCode)}], { cwd: process.cwd() }); }`,
      "catch (error) { console.error(error instanceof Error ? error.message : String(error)); }",
    ].join("\n");

    const result = await captureCommand(
      process.execPath,
      ["-e", runnerCode],
      { capture: { maxBytes: 4_096, mode: "tail" }, cwd: process.cwd() },
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(output).not.toContain("SYNTHETIC-CHILD-OUTPUT");
    expect(output).not.toContain("SYNTHETIC-CHILD-ERROR");
    expect(output).toContain("exited with code 17");
  });

  test.each(["run", "capture"] as const)("%s abort terminates a ready child and preserves the abort cause", async (kind) => {
    let childPid: number | undefined;
    let markReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const sockets = new Set<Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      socket.once("close", () => sockets.delete(socket));
      let data = "";
      socket.on("data", (chunk) => {
        data += chunk.toString();
        if (data.endsWith("\n")) {
          childPid = Number(data.trim());
          markReady();
        }
      });
      socket.on("error", () => {});
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Missing readiness listener");
    const controller = new AbortController();
    const cause = new Error("synthetic command deadline");
    const runner = kind === "run" ? runCommand : captureCommand;
    const result = runner(process.execPath, ["-e", `
      const socket = require("node:net").connect(${address.port}, "127.0.0.1");
      socket.on("connect", () => socket.write(String(process.pid) + "\\n"));
      setInterval(() => {}, 1000);
    `], { cwd: process.cwd(), signal: controller.signal }).then(
      () => undefined,
      error => error,
    );
    const failures: unknown[] = [];
    try {
      await withinDeadline(Promise.race([
        ready,
        result.then(() => {
          throw new Error("Child exited before readiness");
        }),
      ]), 4_000, "Child readiness timed out");
      controller.abort(cause);
      const error = await withinDeadline(result, 2_000, "Aborted command did not complete");
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain("command was aborted");
      expect(error.cause).toBe(cause);
      let exitError: unknown;
      try {
        process.kill(childPid!, 0);
      }
      catch (failure) {
        exitError = failure;
      }
      expect(exitError).toMatchObject({ code: "ESRCH" });
    }
    catch (error) {
      failures.push(error);
    }
    finally {
      controller.abort(cause);
      try {
        if (childPid !== undefined) {
          let alive = false;
          try {
            process.kill(childPid, 0);
            alive = true;
          }
          catch {}
          if (alive)
            await terminateProcessByPid(childPid, { timeoutMs: 2_000 });
        }
      }
      catch (error) {
        failures.push(error);
      }
      for (const socket of sockets)
        socket.destroy();
      try {
        await withinDeadline(
          new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
          1_000,
          "Readiness listener cleanup timed out",
        );
      }
      catch (error) {
        failures.push(error);
      }
    }
    if (failures.length === 1)
      throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, "Command assertion and cleanup failed");
  }, 10_000);
});
