import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import Redis from "ioredis";
import {
  type ManagedResourceRun,
  readManagedResourceRun,
  runManagedComposeCommand,
} from "../../../scripts/test-resources/managed-resources.mjs";
import type { E2EScenarioReferences } from "./seed.ts";

export interface E2ERunContext {
  version: 3;
  runId: string;
  project: string;
  projectDirectory: string;
  resourceRecordPath: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  stubsOrigin: string;
  stubsToken: string;
  databaseUrl: string;
  redisUrl: string;
  pgSnapshotPath: string;
  redisSnapshotPath: string;
  adminPassword: string;
  internalApiKey: string;
  references: E2EScenarioReferences;
}

export type E2ERedisSnapshotEntry = { key: string; ttlMs: number; valueBase64: string };

export async function readE2ERunContext(path = process.env.IAM_E2E_CONTEXT_PATH): Promise<E2ERunContext> {
  if (!path) throw new Error("IAM_E2E_CONTEXT_PATH is required for Container E2E");
  const context: E2ERunContext = JSON.parse(await readFile(path, "utf8"));
  if (context?.version !== 3) throw new Error("Unsupported E2E runtime context");
  return context;
}

export async function resetE2EState(context: E2ERunContext) {
  const run = await readE2EResourceRun(context);
  const sql = await readFile(context.pgSnapshotPath);
  const entries: E2ERedisSnapshotEntry[] = JSON.parse(await readFile(context.redisSnapshotPath, "utf8"));
  const running = await runE2ECompose(run, ["ps", "--status", "running", "-q", "worker"]);
  if (!running.trim()) await startWorker(run);
  await runE2ECompose(
    run,
    [
      "exec",
      "-T",
      "postgres",
      "psql",
      "--no-psqlrc",
      "-U",
      "iam_e2e",
      "-d",
      "iam_e2e",
      "-v",
      "ON_ERROR_STOP=1",
      "--single-transaction",
      "--file=-",
    ],
    { input: sql, timeoutMs: 40_000 },
  );

  const redis = new Redis(context.redisUrl, {
    lazyConnect: true,
    connectTimeout: 5_000,
    commandTimeout: 10_000,
    retryStrategy: () => null,
  });
  try {
    await redis.connect();
    // Keep the seeded Redis state visible as a unit to services that remain live.
    const restore = redis.multi().flushdb();
    for (const { key, ttlMs, valueBase64 } of entries) {
      restore.restore(key, ttlMs, Buffer.from(valueBase64, "base64"), "REPLACE");
    }
    const results = await restore.exec();
    if (!results) throw new Error("E2E Redis snapshot transaction did not execute");
    for (const [error] of results) {
      if (error) throw new Error("E2E Redis snapshot restore failed", { cause: error });
    }
  } finally {
    redis.disconnect();
  }

  await resetE2EStubs(context.stubsOrigin, context.stubsToken, context.references.runId);
}

export async function stopE2EWorker(context: E2ERunContext) {
  await runE2ECompose(await readE2EResourceRun(context), ["stop", "worker"], { timeoutMs: 30_000 });
}

export async function startE2EWorker(context: E2ERunContext) {
  await startWorker(await readE2EResourceRun(context));
}

async function startWorker(run: ManagedResourceRun) {
  await runE2ECompose(
    run,
    ["up", "--detach", "--no-build", "--no-deps", "--no-recreate", "--wait", "--wait-timeout", "40", "worker"],
    { timeoutMs: 45_000 },
  );
}

async function readE2EResourceRun(context: E2ERunContext) {
  const run = await readManagedResourceRun(context.projectDirectory, context.resourceRecordPath);
  if (run.record.project !== context.project) throw new Error("E2E resource record does not match the runtime context");
  return run;
}

interface E2ECommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
  input?: Buffer;
}

export function runE2ECommand(executable: string, args: readonly string[], options: E2ECommandOptions = {}) {
  options.signal?.throwIfAborted();
  const { cwd, env, signal, timeoutMs = 10_000, input } = options;
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = execFile(
      executable,
      args,
      { cwd, env, signal, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${executable} ${args.join(" ")} failed
${(stderr || stdout || error.message).slice(-4096)}`,
              { cause: error },
            ),
          );
        } else {
          resolve({ stdout, stderr });
        }
      },
    );
    child.stdin?.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code !== "EPIPE") reject(error);
    });
    child.stdin?.end(input);
  });
}

export async function runE2ECompose(
  run: ManagedResourceRun,
  args: string[],
  options: Pick<E2ECommandOptions, "signal" | "timeoutMs" | "input"> & { includeStderr?: boolean } = {},
) {
  const { output } = await runManagedComposeCommand(run, args, {
    runCommand: async ({ executable, args = [], cwd, env }) => {
      const { stdout, stderr } = await runE2ECommand(executable, args, { ...options, cwd, env });
      return { exitCode: 0, signal: null, output: options.includeStderr ? stdout + stderr : stdout };
    },
  });
  return output;
}

export async function resetE2EStubs(stubsOrigin: string, stubsToken: string, runId: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(10_000);
  const response = await fetch(new URL("/_stubs/reset", stubsOrigin), {
    method: "POST",
    headers: { authorization: `Bearer ${stubsToken}`, "content-type": "application/json" },
    body: JSON.stringify({ runId }),
    redirect: "error",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  await response.body?.cancel();
  if (response.status !== 204) {
    throw new Error(`E2E stubs reset failed (HTTP ${response.status})`);
  }
}

export async function readDeliveredSmsCode(
  context: Pick<E2ERunContext, "stubsOrigin" | "stubsToken">,
  options: { timeoutMs?: number; intervalMs?: number; signal?: AbortSignal } = {},
) {
  const timeoutMs = options.timeoutMs ?? 5_000;
  const intervalMs = options.intervalMs ?? 100;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    options.signal?.throwIfAborted();
    const requestTimeout = AbortSignal.timeout(3_000);
    const response = await fetch(new URL("/_stubs/sms", context.stubsOrigin), {
      headers: { authorization: `Bearer ${context.stubsToken}` },
      redirect: "error",
      signal: options.signal ? AbortSignal.any([options.signal, requestTimeout]) : requestTimeout,
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`E2E stubs SMS readback failed (HTTP ${response.status})`);
    }
    const payload: unknown = await response.json();
    const code =
      typeof payload === "object" && payload !== null && "code" in payload && typeof payload.code === "string"
        ? payload.code.trim()
        : "";
    if (/^\d{4}$/u.test(code)) return code;
    if (Date.now() + intervalMs > deadline) break;
    await delay(intervalMs, undefined, { signal: options.signal });
  }
  throw new Error("The SMS provider did not deliver a verification code");
}

export async function readE2EServiceLogs(
  context: E2ERunContext,
  service: string,
  options: { since?: Date; tail?: number; signal?: AbortSignal } = {},
) {
  const args = ["logs", "--no-color", "--no-log-prefix"];
  if (options.since !== undefined) args.push("--since", options.since.toISOString());
  if (options.tail !== undefined) args.push("--tail", String(options.tail));
  return await runE2ECompose(await readE2EResourceRun(context), [...args, service], {
    signal: options.signal,
    includeStderr: true,
  });
}
