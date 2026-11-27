import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { captureCommand } from "./command-runner.ts";
import type { E2EScenarioReferences } from "./seed.ts";

export interface E2ERunContext {
  version: 2;
  runId: string;
  project: string;
  composeFile: string;
  projectDirectory: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  stubsOrigin: string;
  stubsToken: string;
  databaseUrl: string;
  redisUrl: string;
  adminPassword: string;
  internalApiKey: string;
  references: E2EScenarioReferences;
  control: { origin: string; token: string };
  logServices: readonly string[];
}

export async function readE2ERunContext(path = process.env.IAM_E2E_CONTEXT_PATH): Promise<E2ERunContext> {
  if (!path) throw new Error("IAM_E2E_CONTEXT_PATH is required for Container E2E");
  const context: E2ERunContext = JSON.parse(await readFile(path, "utf8"));
  if (context?.version !== 2) throw new Error("Unsupported E2E runtime context");
  return context;
}

export async function requestE2EControl(
  context: E2ERunContext,
  path: "/reset" | "/worker/stop" | "/worker/start",
  options: { file?: string; signal?: AbortSignal } = {},
) {
  const timeout = AbortSignal.timeout(110_000);
  const response = await fetch(new URL(path, context.control.origin), {
    method: "POST",
    headers: { authorization: `Bearer ${context.control.token}`, "content-type": "application/json" },
    body: options.file === undefined ? undefined : JSON.stringify({ file: options.file }),
    redirect: "error",
    signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  await response.body?.cancel();
  if (response.status !== 204) {
    throw new Error(`E2E control ${path} failed (HTTP ${response.status}); inspect the runtime logs`);
  }
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
  context: Pick<E2ERunContext, "project" | "composeFile" | "projectDirectory">,
  service: string,
  options: { since?: Date; tail?: number; signal?: AbortSignal } = {},
) {
  const args = [
    "compose",
    "--project-name",
    context.project,
    "--project-directory",
    context.projectDirectory,
    "--file",
    context.composeFile,
    "logs",
    "--no-color",
    "--no-log-prefix",
  ];
  if (options.since !== undefined) {
    args.push("--since", options.since.toISOString());
  }
  if (options.tail !== undefined) {
    args.push("--tail", String(options.tail));
  }
  args.push(service);
  const { stdout, stderr } = await captureCommand("docker", args, {
    cwd: context.projectDirectory,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
    capture: { mode: "line-tail", maxBytes: 1024 * 1024 },
  });
  return `${stdout}${stderr}`;
}
