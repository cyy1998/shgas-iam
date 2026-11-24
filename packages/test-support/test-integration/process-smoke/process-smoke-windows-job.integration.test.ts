import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { access, copyFile, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { closeOwnedProcessScope, ownedProcessScopeEnvironment } from "@iam/runtime/process";
import type { ProcessSmokeChild } from "@iam/test-support/process-smoke-harness";
import {
  createProcessSmokeEnvironment,
  runProcessCommandSmoke,
  runProcessSmoke,
  spawnOwnedProcessTree,
  terminateProcessByPid,
  terminateProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/test-support/process-smoke-harness";

const supervisorCloseTimeoutMs = 8_000;
const descendantExitTimeoutMs = 1_000;
const processTreeCleanupTimeoutMs = 2_000;
const descendantCleanupConfirmationTimeoutMs = 100;
const descendantPostKillExitTimeoutMs = 1_000;
const temporaryDirectoryCleanupTimeoutMs = 2_000;
const windowsJobSmokeTestTimeoutMs = 17_000;
const jobApiCacheTestTimeoutMs = 40_000;
const runtimeProcessUrl = import.meta.resolve("@iam/runtime/process");
const runtimeSupervisorPath = fileURLToPath(new URL("./windows-job-supervisor.ps1", runtimeProcessUrl));
const runtimeLauncherPath = fileURLToPath(new URL("./windows-job-launcher.mjs", runtimeProcessUrl));
const detachedDescendantScript = [
  "const { spawn } = require('node:child_process');",
  "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],",
  "  { detached: true, stdio: 'ignore', windowsHide: true });",
  "child.unref();",
  "process.stdout.write('DESCENDANT_PID=' + child.pid + '\\n');",
].join("\n");

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

async function waitForPidExit(pid: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ESRCH") {
        return true;
      }
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

async function waitForSupervisorClose(supervisor: ProcessSmokeChild, getDiagnostic: () => string) {
  return await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    const timeout = setTimeout(
      () =>
        reject(
          new Error(`Windows Job supervisor did not close within ${supervisorCloseTimeoutMs}ms; ${getDiagnostic()}`),
        ),
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

for (const packagedLauncher of [false, true])
  test.skipIf(process.platform !== "win32")(
    `kills descendants through a real Windows Job after the leader exits (${packagedLauncher ? "standalone launcher" : "runtime launcher"})`,
    async () => {
      let ownedTemporaryDirectory = "";

      await withOwnedTemporaryDirectory({
        prefix: "iam-test-support-windows-job-smoke-",
        cleanupTimeoutMs: temporaryDirectoryCleanupTimeoutMs,
        async run(temporaryDirectory) {
          ownedTemporaryDirectory = temporaryDirectory;
          const launcherExecutable = join(temporaryDirectory, "windows-job-launcher.exe");
          const supervisorPath = join(temporaryDirectory, "windows-job-supervisor.ps1");
          if (packagedLauncher) {
            await runProcessCommandSmoke({
              label: "compile standalone Windows Job launcher",
              completionTimeoutMs: 10000,
              cleanupTimeoutMs: 2000,
              start: () =>
                spawnOwnedProcessTree({
                  executable: process.execPath,
                  args: [
                    "build",
                    runtimeLauncherPath,
                    "--compile",
                    "--no-compile-autoload-dotenv",
                    "--no-compile-autoload-bunfig",
                    "--windows-hide-console",
                    `--outfile=${launcherExecutable}`,
                  ],
                  cwd: temporaryDirectory,
                  env: process.env,
                }),
            });
            await copyFile(runtimeSupervisorPath, supervisorPath);
          }
          const tailMarker = "WINDOWS_JOB_TAIL_MARKER";
          const targetScript = [
            detachedDescendantScript,
            "process.stdout.write('TEMP_DIRECTORY=' + process.env.TEMP + '\\n');",
            `process.stderr.write('x'.repeat(256 * 1024) + '${tailMarker}\\n',`,
            "  () => process.exit(23));",
          ].join("\n");
          const supervisor = spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["-e", targetScript],
            ...(packagedLauncher ? { windowsJob: { supervisorPath, launcherExecutable } } : {}),
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
            const exit = await waitForSupervisorClose(supervisor, () => `exit=${observedExit}; output=${output}`);
            descendantPid = Number(/DESCENDANT_PID=(\d+)/u.exec(output)?.[1]);
            expect(exit).toEqual({ code: 23, signal: null });
            expect(descendantPid).toBeGreaterThan(0);
            expect(output).toContain(`TEMP_DIRECTORY=${temporaryDirectory}`);
            expect(output).toContain(tailMarker);
            const descendantExited = await waitForPidExit(descendantPid, descendantExitTimeoutMs);
            expect(descendantExited).toBe(true);
          } catch (error) {
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
              descendantPid !== undefined &&
              !(await waitForPidExit(descendantPid, descendantCleanupConfirmationTimeoutMs))
            ) {
              await terminateProcessByPid(descendantPid, {
                timeoutMs: descendantPostKillExitTimeoutMs,
              });
            }
          } catch (error) {
            cleanupFailure = toError(error);
          }

          if (testFailure !== undefined && cleanupFailure !== undefined) {
            throw new AggregateError([testFailure, cleanupFailure], "Windows Job assertion and cleanup both failed");
          }
          if (testFailure !== undefined) throw testFailure;
          if (cleanupFailure !== undefined) throw cleanupFailure;
        },
      });

      const directoryError = await access(ownedTemporaryDirectory).then(
        () => undefined,
        (error) => error,
      );
      expect(directoryError).toMatchObject({ code: "ENOENT" });
    },
    windowsJobSmokeTestTimeoutMs,
  );

async function withJobApiCache(
  run: (fixture: {
    temporaryDirectory: string;
    cacheDirectory: string;
    launch: (options?: { script?: string; supervisorPath?: string }) => Promise<string>;
  }) => Promise<void>,
) {
  await withOwnedTemporaryDirectory({
    prefix: "iam-test-support-windows-job-cache-",
    cleanupTimeoutMs: temporaryDirectoryCleanupTimeoutMs,
    async run(temporaryDirectory) {
      const cacheDirectory = join(temporaryDirectory, "cache");
      const wrapperPath = join(temporaryDirectory, "cache-test-supervisor.ps1");
      await writeFile(
        wrapperPath,
        [
          "param([string]$NodeExecutable, [string]$LauncherPath, [string]$RuntimeKind)",
          "& $env:TEST_JOB_SUPERVISOR -NodeExecutable $NodeExecutable -LauncherPath $env:TEST_JOB_LAUNCHER `",
          "  -RuntimeKind bun -JobApiCacheDirectory $env:TEST_JOB_CACHE",
          "$code = $LASTEXITCODE",
          '$api = "IamOwnedProcess.JobApi" -as [type]',
          'if ($api) { [Console]::WriteLine("JOB_API_DLL=" + [IO.Path]::GetFileName($api.Assembly.Location)) }',
          "exit $code",
        ].join("\r\n"),
      );

      await run({
        temporaryDirectory,
        cacheDirectory,
        async launch({ script = "console.log('job target ran')", supervisorPath = runtimeSupervisorPath } = {}) {
          const result = await runProcessCommandSmoke({
            label: "launch through Windows Job API cache",
            completionTimeoutMs: supervisorCloseTimeoutMs,
            cleanupTimeoutMs: processTreeCleanupTimeoutMs,
            start: () =>
              spawnOwnedProcessTree({
                executable: process.execPath,
                args: ["-e", script],
                windowsJob: { supervisorPath: wrapperPath, launcherExecutable: process.execPath },
                cwd: temporaryDirectory,
                env: createProcessSmokeEnvironment({
                  source: process.env,
                  temporaryDirectory,
                  overrides: {
                    TEST_JOB_SUPERVISOR: supervisorPath,
                    TEST_JOB_LAUNCHER: runtimeLauncherPath,
                    TEST_JOB_CACHE: cacheDirectory,
                  },
                }),
              }),
          });
          return result.output;
        },
      });
    },
  });
}

test.skipIf(process.platform !== "win32")(
  "concurrent cold launches publish a single source-keyed Job API DLL and later launches load it",
  async () => {
    await withJobApiCache(async ({ temporaryDirectory, cacheDirectory, launch }) => {
      const coldLaunches = await Promise.allSettled([launch(), launch(), launch()]);
      for (const launch of coldLaunches) {
        if (launch.status === "rejected") throw launch.reason;
      }

      const entries = await readdir(cacheDirectory);
      expect(entries).toEqual([expect.stringMatching(/^IamOwnedProcess\.JobApi\.[a-f0-9]{64}\.dll$/u)]);
      const [dll] = entries;
      if (!dll) throw new Error("Windows Job API DLL was not published");
      const cachedAssembly = `JOB_API_DLL=${dll}`;
      for (const launch of coldLaunches) {
        if (launch.status === "fulfilled") expect(launch.value).toContain(cachedAssembly);
      }
      const warmOutput = await launch();
      expect(warmOutput).toContain("job target ran");
      expect(warmOutput).toContain(cachedAssembly);

      const changedSupervisor = join(temporaryDirectory, "changed-supervisor.ps1");
      const source = await readFile(runtimeSupervisorPath, "utf8");
      await writeFile(changedSupervisor, source.replace("using System;", "using System; // changed Job API source"));
      const changedOutput = await launch({ supervisorPath: changedSupervisor });
      const changedEntries = await readdir(cacheDirectory);
      expect(changedEntries).toHaveLength(2);
      expect(changedEntries).toContain(dll);
      const changedDll = changedEntries.find((entry) => entry !== dll);
      if (!changedDll) throw new Error("Changed Job API source did not publish a new DLL");
      expect(changedOutput).toContain(`JOB_API_DLL=${changedDll}`);
    });
  },
  jobApiCacheTestTimeoutMs,
);

for (const failure of ["corrupt DLL", "unwritable cache path"]) {
  test.skipIf(process.platform !== "win32")(
    `compiles in memory and kills detached descendants when the Job API cache has a ${failure}`,
    async () => {
      await withJobApiCache(async ({ cacheDirectory, launch }) => {
        if (failure === "corrupt DLL") {
          await launch();
          const [dll] = await readdir(cacheDirectory);
          if (!dll) throw new Error("Windows Job API DLL was not published");
          await writeFile(join(cacheDirectory, dll), "invalid DLL");
        } else {
          await writeFile(cacheDirectory, "a cache directory cannot be created over this file");
        }

        const output = await launch({ script: detachedDescendantScript });
        const pid = Number(/DESCENDANT_PID=(\d+)/u.exec(output)?.[1]);
        expect(pid).toBeGreaterThan(0);
        const exited = await waitForPidExit(pid, descendantExitTimeoutMs);
        if (!exited) await terminateProcessByPid(pid, { timeoutMs: descendantPostKillExitTimeoutMs });
        expect(exited).toBe(true);
        expect(output).toMatch(/JOB_API_DLL=\r?$/mu);
      });
    },
    jobApiCacheTestTimeoutMs,
  );
}

test.skipIf(process.platform !== "win32")(
  "recovers a running Windows Job scope and fences launches after its permit is revoked",
  async () => {
    await withOwnedTemporaryDirectory({
      prefix: "iam-test-support-windows-job-scope-",
      cleanupTimeoutMs: temporaryDirectoryCleanupTimeoutMs,
      async run(temporaryDirectory) {
        const activeFile = join(temporaryDirectory, "active");
        const pidFile = join(temporaryDirectory, "pid");
        const id = randomUUID();
        await writeFile(activeFile, "active");
        const env = ownedProcessScopeEnvironment(
          { id, activeFile },
          createProcessSmokeEnvironment({ source: process.env, temporaryDirectory, overrides: { TEST_PID: pidFile } }),
        );
        const start = (script: string) =>
          spawnOwnedProcessTree({ executable: process.execPath, args: ["-e", script], cwd: temporaryDirectory, env });

        let targetPid: number | undefined;
        let recovered = false;
        await runProcessSmoke({
          label: "recover the revoked Windows Job scope",
          start: () =>
            start(
              "require('node:fs').writeFileSync(process.env.TEST_PID, String(process.pid)); setInterval(() => {}, 1000);",
            ),
          readinessTimeoutMs: supervisorCloseTimeoutMs,
          cleanupTimeoutMs: 11_000,
          async probe(signal) {
            const content = await readFile(pidFile, { encoding: "utf8", signal }).catch((error: unknown) => {
              if (error instanceof Error && "code" in error && error.code === "ENOENT") return "";
              throw error;
            });
            const pid = Number(content);
            if (!pid) return undefined;
            targetPid = pid;
            return pid;
          },
          async stop(child) {
            try {
              await unlink(activeFile);
              await closeOwnedProcessScope(id, { timeoutMs: 2_000, forceAfterMs: 0 });
              if (targetPid !== undefined) recovered = await waitForPidExit(targetPid, descendantExitTimeoutMs);
            } finally {
              await terminateProcessTree(child, { timeoutMs: processTreeCleanupTimeoutMs });
            }
          },
        });
        expect(recovered).toBe(true);

        const revoked = await runProcessCommandSmoke({
          label: "reject a Windows Job launch without its permit",
          start: () => start("console.log('REVOKED_JOB_TARGET_RAN')"),
          expectedExitCode: 1,
          completionTimeoutMs: supervisorCloseTimeoutMs,
          cleanupTimeoutMs: processTreeCleanupTimeoutMs,
        });
        expect(revoked.output).toContain("owned process scope launch permit was revoked");
        expect(revoked.output).not.toContain("REVOKED_JOB_TARGET_RAN");
      },
    });
  },
  jobApiCacheTestTimeoutMs,
);
