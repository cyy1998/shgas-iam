import { readFile } from "node:fs/promises";
import type { BackendService } from "./host-backends.ts";
import type { E2EScenarioReferences } from "./seed.ts";

export interface HybridRunContext {
  version: 1;
  runId: string;
  project: string;
  apisixComposeFile: string;
  origin: string;
  internalOrigin: string;
  wecomMobileOrigin: string;
  logDirectory: string;
  smsDeliveryPath: string;
  databaseUrl: string;
  redisUrl: string;
  adminPassword: string;
  internalApiKey: string;
  references: E2EScenarioReferences;
  backendOrigins: Record<BackendService, string>;
  frontendOrigins: { admin: string; sso: string };
  control: { origin: string; token: string };
  resetCount: number;
}

export async function readHybridRunContext(path = process.env.IAM_E2E_CONTEXT_PATH): Promise<HybridRunContext> {
  if (!path) throw new Error("IAM_E2E_CONTEXT_PATH is required for Hybrid E2E");
  const context: HybridRunContext = JSON.parse(await readFile(path, "utf8"));
  if (context?.version !== 1) throw new Error("Unsupported Hybrid E2E runtime context");
  return context;
}

export async function requestHybridControl(
  context: HybridRunContext,
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
