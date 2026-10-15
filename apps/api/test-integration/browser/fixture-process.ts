import { execSync, spawn } from "node:child_process";
import process from "node:process";
import type { ProcessSmokeChild } from "@iam/api-core/testing/process-smoke-harness";
import { terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { ownApiTestExecutor, resetApiRedisTestDatabase } from "../redis/fixture-lifecycle";

export function fixtureBunExecutable() {
  return execSync('bun -e "console.log(process.execPath)"', {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4096,
  }).trim();
}

export async function startBrowserFixture(script: string, args: string[] = []) {
  if (!process.env.IAM_API_TEST_REDIS_URL) throw new Error("IAM_API_TEST_REDIS_URL is required");
  // Resolve the real executable through the installed CLI shim, then own the direct child.
  const executable = fixtureBunExecutable();
  const child = spawn(executable, ["--no-env-file", script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    detached: process.platform !== "win32",
    windowsHide: true,
    stdio: "pipe",
  });
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  let stderr = "";
  child.stderr!.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4096);
  });
  let exitCode: number | null;
  const stop = ownApiTestExecutor(async () => {
    child.stdin.end();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      exitCode = await Promise.race([
        exit,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Browser fixture did not exit after stdin closed")), 5000);
        }),
      ]);
      if (!/^fixture-stopped$/mu.test(stderr)) throw new Error(`Browser fixture stop was not confirmed: ${stderr}`);
    } catch (failure) {
      try {
        await terminateProcessTree(child, { timeoutMs: 5000 });
      } catch (cleanup) {
        throw new AggregateError([failure, cleanup], "Browser fixture stop failed");
      }
      throw failure;
    } finally {
      clearTimeout(timer);
    }
  });
  let closing: Promise<void> | undefined;
  const close = () =>
    (closing ??= (async () => {
      await resetApiRedisTestDatabase();
      await stop();
      if (exitCode !== 0) throw new Error(`Browser fixture failed (${exitCode}): ${stderr}`);
    })());
  try {
    const line = await readReady(child, exit);
    return { ready: line, close };
  } catch (failure) {
    try {
      await close();
    } catch (cleanup) {
      throw new AggregateError([failure, cleanup], "Browser fixture startup and cleanup failed", {
        cause: failure,
      });
    }
    throw failure;
  }
}
async function readReady(child: ProcessSmokeChild, exit: Promise<number | null>) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      new Promise<string>((resolve, reject) => {
        let stdout = "";
        child.stdout!.on("data", (chunk) => {
          stdout = (stdout + String(chunk)).slice(0, 32769);
          if (stdout.length > 32768) reject(new Error("Browser fixture readiness exceeded limit"));
          const newline = stdout.indexOf("\n");
          if (newline >= 0) resolve(stdout.slice(0, newline));
        });
        timer = setTimeout(() => reject(new Error("Browser fixture readiness timed out")), 10000);
      }),
      exit.then(() => {
        throw new Error("Browser fixture exited before readiness");
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
