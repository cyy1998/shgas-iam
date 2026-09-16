import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { execSync, spawn } from "node:child_process";
import process from "node:process";

export async function startBrowserFixture(script: string, args: string[] = []) {
  if (!process.env.IAM_API_TEST_REDIS_URL)
    throw new Error("IAM_API_TEST_REDIS_URL is required");
  // Resolve the real executable through the installed CLI shim, then own the direct child.
  const executable = execSync("bun -e \"console.log(process.execPath)\"", {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
    maxBuffer: 4096,
  }).trim();
  const child = spawn(
    executable,
    [script, ...args],
    { cwd: process.cwd(), env: process.env, windowsHide: true, stdio: "pipe" },
  );
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4096);
  });
  async function close() {
    child.stdin.end();
    const timer = setTimeout(() => child.kill(), 5000);
    try {
      const code = await exit;
      if (code !== 0)
        throw new Error(`Browser fixture failed (${code}): ${stderr}`);
    }
    finally {
      clearTimeout(timer);
    }
  }
  try {
    const line = await readReady(child, exit);
    return { ready: line, close };
  }
  catch (failure) {
    try {
      await close();
    }
    catch (cleanup) {
      throw new AggregateError([failure, cleanup], "Browser fixture startup and cleanup failed", {
        cause: failure,
      });
    }
    throw failure;
  }
}
async function readReady(child: ChildProcessWithoutNullStreams, exit: Promise<number | null>) {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      new Promise<string>((resolve, reject) => {
        let stdout = "";
        child.stdout.on("data", (chunk) => {
          stdout = (stdout + String(chunk)).slice(0, 32769);
          if (stdout.length > 32768)
            reject(new Error("Browser fixture readiness exceeded limit"));
          const newline = stdout.indexOf("\n");
          if (newline >= 0)
            resolve(stdout.slice(0, newline));
        });
        timer = setTimeout(() => reject(new Error("Browser fixture readiness timed out")), 10000);
      }),
      exit.then(() => {
        throw new Error("Browser fixture exited before readiness");
      }),
    ]);
  }
  finally {
    clearTimeout(timer!);
  }
}
