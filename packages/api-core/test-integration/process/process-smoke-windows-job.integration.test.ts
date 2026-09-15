import type { ProcessSmokeChild } from "@iam/api-core/testing/process-smoke-harness";
import { access } from "node:fs/promises";
import process from "node:process";
import {
  createProcessSmokeEnvironment,
  spawnOwnedProcessTree,
  terminateProcessByPid,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { expect, test } from "bun:test";

const supervisorCloseTimeoutMs = 8_000;
const descendantExitTimeoutMs = 1_000;
const processTreeCleanupTimeoutMs = 2_000;
const descendantCleanupConfirmationTimeoutMs = 100;
const descendantPostKillExitTimeoutMs = 1_000;
const temporaryDirectoryCleanupTimeoutMs = 2_000;
const windowsJobSmokeTestTimeoutMs = 17_000;

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

async function waitForPidExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    }
    catch (error) {
      if (
        error instanceof Error
        && "code" in error
        && (error as NodeJS.ErrnoException).code === "ESRCH"
      ) {
        return true;
      }
      throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return false;
}

async function waitForSupervisorClose(
  supervisor: ProcessSmokeChild,
  getDiagnostic: () => string,
) {
  return await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(
        `Windows Job supervisor did not close within ${supervisorCloseTimeoutMs}ms; ${getDiagnostic()}`,
      )),
      supervisorCloseTimeoutMs,
    );
    supervisor.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    supervisor.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

test.skipIf(process.platform !== "win32")(
  "kills descendants through a real Windows Job after the leader exits",
  async () => {
    let ownedTemporaryDirectory = "";

    await withOwnedTemporaryDirectory({
      prefix: "iam-api-core-windows-job-smoke-",
      cleanupTimeoutMs: temporaryDirectoryCleanupTimeoutMs,
      async run(temporaryDirectory) {
        ownedTemporaryDirectory = temporaryDirectory;
        const tailMarker = "WINDOWS_JOB_TAIL_MARKER";
        const targetScript = [
          "const { spawn } = require('node:child_process');",
          "const child = spawn(process.execPath,",
          "  ['-e', 'setInterval(() => {}, 1000)'],",
          "  { detached: true, stdio: 'ignore', windowsHide: true });",
          "child.unref();",
          "process.stdout.write('DESCENDANT_PID=' + child.pid + '\\n');",
          "process.stdout.write('TEMP_DIRECTORY=' + process.env.TEMP + '\\n');",
          `process.stderr.write('x'.repeat(256 * 1024) + '${tailMarker}\\n',`,
          "  () => process.exit(23));",
        ].join("\n");
        const supervisor = spawnOwnedProcessTree({
          executable: process.execPath,
          args: ["-e", targetScript],
          cwd: temporaryDirectory,
          env: createProcessSmokeEnvironment({
            source: process.env,
            temporaryDirectory,
            overrides: {
              NODE_ENV: "test",
              FORCE_COLOR: "0",
              NO_COLOR: "1",
            },
          }),
        });
        let output = "";
        let observedExit = "not observed";
        let descendantPid: number | undefined;
        let testFailure: Error | undefined;
        const captureOutput = (chunk: Buffer) => {
          output = `${output}${chunk.toString()}`.slice(-(512 * 1024));
        };
        supervisor.stdout?.on("data", captureOutput);
        supervisor.stderr?.on("data", captureOutput);
        supervisor.once("exit", (code, signal) => {
          observedExit = `code=${code ?? "null"} signal=${signal ?? "null"}`;
        });

        try {
          const exit = await waitForSupervisorClose(
            supervisor,
            () => `exit=${observedExit}; output=${output}`,
          );
          descendantPid = Number(
            /DESCENDANT_PID=(\d+)/u.exec(output)?.[1],
          );
          expect(exit).toEqual({ code: 23, signal: null });
          expect(descendantPid).toBeGreaterThan(0);
          expect(output).toContain(`TEMP_DIRECTORY=${temporaryDirectory}`);
          expect(output).toContain(tailMarker);
          const descendantExited = await waitForPidExit(
            descendantPid,
            descendantExitTimeoutMs,
          );
          expect(descendantExited).toBe(true);
        }
        catch (error) {
          testFailure = toError(error);
        }

        let cleanupFailure: Error | undefined;
        try {
          if (supervisor.exitCode === null && supervisor.signalCode === null) {
            await terminateProcessTree(supervisor, {
              timeoutMs: processTreeCleanupTimeoutMs,
            });
          }
          if (
            descendantPid !== undefined
            && !await waitForPidExit(
              descendantPid,
              descendantCleanupConfirmationTimeoutMs,
            )
          ) {
            await terminateProcessByPid(descendantPid, {
              timeoutMs: descendantPostKillExitTimeoutMs,
            });
          }
        }
        catch (error) {
          cleanupFailure = toError(error);
        }

        if (testFailure !== undefined && cleanupFailure !== undefined) {
          throw new AggregateError(
            [testFailure, cleanupFailure],
            "Windows Job assertion and cleanup both failed",
          );
        }
        if (testFailure !== undefined)
          throw testFailure;
        if (cleanupFailure !== undefined)
          throw cleanupFailure;
      },
    });

    const directoryError = await access(ownedTemporaryDirectory).then(
      () => undefined,
      error => error,
    );
    expect(directoryError).toMatchObject({ code: "ENOENT" });
  },
  windowsJobSmokeTestTimeoutMs,
);
