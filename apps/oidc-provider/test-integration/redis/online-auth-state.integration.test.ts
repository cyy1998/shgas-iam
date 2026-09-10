import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createBoundedProcessLogCapture, spawnOwnedProcessTree, terminateProcessTree } from "@iam/api-core/testing/process-smoke-harness";
import { customSsoMaintenancePrefixes } from "@iam/custom-sso/maintenance";
import { sessionKernelMaintenancePrefixes } from "@iam/session-kernel/maintenance";
import Redis from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { maintainOnlineAuthState } from "../../src/composition/session/online-auth-state-maintenance.ts";
import { providerSessionMaintenancePrefixes } from "../../src/session/provider-session.ts";
import { oidcProtocolObjectMaintenancePrefixes } from "../../src/storage/redis-adapter.ts";
import { createOidcProviderRedisTestHarness } from "./redis-test-harness.ts";

const commands = new Set<() => Promise<void>>();

async function cleanupCommands() {
  const outcomes = await Promise.allSettled([...commands].map(cleanup => cleanup()));
  const failures = outcomes.filter(outcome => outcome.status === "rejected").map(outcome => outcome.reason);
  if (failures.length)
    throw new AggregateError(failures, "Maintenance command tree cleanup failed");
}

let harness: Awaited<ReturnType<typeof createOidcProviderRedisTestHarness>>;
let scope: Awaited<ReturnType<typeof harness.createScope>>;
beforeAll(async () => {
  harness = await createOidcProviderRedisTestHarness();
});
beforeEach(async () => {
  scope = await harness.createScope();
});
afterEach(async () => {
  await cleanupCommands();
  await scope.close();
});
afterAll(async () => {
  await cleanupCommands();
  await harness.close();
});

async function inventory() {
  const kernelNamespace = `${scope.unique("kernel")}:`;
  const options = { kernelNamespace, writersStopped: true };
  // Global protocol owners must already be empty; never delete a caller's existing inventory.
  const preflight = await maintainOnlineAuthState({ ...options, redis: scope.observer, operation: "verify" });
  expect(preflight.status).toBe("passed");
  const prefixes = [
    ...sessionKernelMaintenancePrefixes(kernelNamespace),
    ...customSsoMaintenancePrefixes(),
    ...oidcProtocolObjectMaintenancePrefixes(),
    ...providerSessionMaintenancePrefixes(),
  ];
  const targets: string[] = [];
  for (const prefix of prefixes) {
    // These deliberate malformed, unindexed records need no token, reverse lookup or payload decoder.
    for (const expiring of [false, true]) {
      const key = `${prefix}${scope.unique("orphan")}`;
      scope.trackKey(key);
      targets.push(key);
      await scope.writer.set(key, "malformed orphan");
      if (expiring)
        await scope.writer.pexpire(key, 120_000);
    }
  }
  const preserved = [
    `${kernelNamespace}unknown:`,
    `${kernelNamespace}state:unknown:`,
    `${kernelNamespace}id:unknown:`,
    "other-kernel:state:p:",
    "subject-access:",
    "subject-facts:",
    "client-runtime-snapshot:v1:",
    "bull:",
    "login-restriction:",
    "sms-code:",
    "nonce:",
    "oidc:client-auth-failures:",
    "oidc:user-tokens:",
    "oidc:unknown:",
    "global_session:",
  ].map(prefix => `${prefix}${scope.unique("preserved")}`);
  for (const key of preserved) {
    scope.trackKey(key);
    await scope.writer.set(key, "preserved", "PX", 120_000);
  }
  async function observe(keys: string[]) {
    return await Promise.all(keys.map(async key => ({
      payload: await scope.observer.get(key),
      expiresAt: await scope.observer.pexpiretime(key),
    })));
  }
  return { options, targets, preserved, observe };
}

async function command(
  args: string[],
  namespace: string,
  overrides: Record<string, string | undefined> = {},
  lifecycle: { timeoutMs?: number; signal?: AbortSignal } = {},
) {
  const url = new URL(process.env.IAM_OIDC_PROVIDER_TEST_REDIS_URL!);
  const pnpm = process.env.npm_execpath;
  if (!pnpm)
    throw new Error("Run this contract through the package test command");
  const child = spawnOwnedProcessTree({
    executable: process.execPath,
    args: [pnpm, "online-auth:state", "--", ...args],
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    env: {
      ...process.env,
      NODE_ENV: "production",
      IAM_OIDC_PROVIDER_REDIS_HOST: url.hostname,
      IAM_OIDC_PROVIDER_REDIS_PORT: url.port || "6379",
      IAM_OIDC_PROVIDER_REDIS_DB: url.pathname.slice(1) || "0",
      IAM_OIDC_PROVIDER_REDIS_PASSWORD: decodeURIComponent(url.password) || undefined,
      IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: namespace,
      ...overrides,
    },
  });
  const capture = createBoundedProcessLogCapture(child, { maxBytes: 64 * 1024 });
  let cleanupPromise: Promise<void> | undefined;
  const cleanup = () => cleanupPromise ??= terminateProcessTree(child, { timeoutMs: 5000 }).then(() => {
    commands.delete(cleanup);
  });
  commands.add(cleanup);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    const outcome = await new Promise<{ code: number; termination: "timeout" | "abort" | null }>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", code => resolve({ code: code ?? 1, termination: null }));
      timer = setTimeout(resolve, lifecycle.timeoutMs ?? 15_000, { code: 1, termination: "timeout" });
      cancel = () => resolve({ code: 1, termination: "abort" });
      lifecycle.signal?.addEventListener("abort", cancel, { once: true });
      if (lifecycle.signal?.aborted)
        cancel();
    });
    return { ...outcome, output: capture.snapshot() };
  }
  finally {
    clearTimeout(timer);
    if (cancel)
      lifecycle.signal?.removeEventListener("abort", cancel);
    try {
      await cleanup();
    }
    finally {
      capture.dispose();
    }
  }
}

function report(output: string) {
  const line = output.split(/\r?\n/u).find(value => value.includes("{\"status\":"));
  if (!line)
    throw new Error("Maintenance report missing");
  return JSON.parse(line.slice(line.indexOf("{")));
}

it("runs the published command in separate processes over every source and target owner family", async () => {
  const s = await inventory();
  const original = await s.observe([...s.targets, ...s.preserved]);
  const dryRun = await command(["dry-run", "--writers-stopped"], s.options.kernelNamespace);
  expect(dryRun.code).toBe(0);
  expect(report(dryRun.output)).toMatchObject({ status: "passed", operation: "dry-run" });
  const dirty = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(dirty.code).not.toBe(0);
  expect(report(dirty.output).status).toBe("failed");
  const afterReadOnly = await s.observe([...s.targets, ...s.preserved]);
  expect(afterReadOnly).toEqual(original);
  const missingConfirmation = await command(["apply"], s.options.kernelNamespace);
  expect(missingConfirmation.code).not.toBe(0);
  const missingTarget = await command(["apply", "--writers-stopped"], s.options.kernelNamespace, { IAM_OIDC_PROVIDER_REDIS_HOST: undefined });
  expect(missingTarget.code).not.toBe(0);
  const afterRejected = await s.observe([...s.targets, ...s.preserved]);
  expect(afterRejected).toEqual(original);
  const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(applied.code).toBe(0);
  const verified = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(verified.code).toBe(0);
  expect(report(verified.output)).toMatchObject({ status: "passed", operation: "verify", counts: {
    kernel: { observed: 0, removed: 0 },
    grant: { observed: 0, removed: 0 },
    oidcObjects: { observed: 0, removed: 0 },
    providerSession: { observed: 0, removed: 0 },
  } });
  const absent = await s.observe(s.targets);
  expect(absent).toEqual(s.targets.map(() => ({ payload: null, expiresAt: -2 })));
  const retained = await s.observe(s.preserved);
  expect(retained).toEqual(original.slice(s.targets.length));
  const repeated = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(repeated.code).toBe(0);
  expect(report(repeated.output).counts).toEqual(report(verified.output).counts);
  // New inventory after a successful apply must invalidate a subsequent independent verify.
  await scope.writer.set(s.targets[0]!, "late offline fixture");
  const late = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(late.code).not.toBe(0);
  const rerun = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(rerun.code).toBe(0);
  const final = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(final.code).toBe(0);
}, 45_000);

it("recovers a committed UNLINK with lost response and refuses incomplete or aborted scans", async () => {
  const s = await inventory();
  const original = await s.observe(s.preserved);
  let committed = 0;
  const unknown = await maintainOnlineAuthState({ ...s.options, operation: "apply", redis: {
    scan: (...args) => scope.writer.scan(...args),
    async unlink(...keys) {
      committed += await scope.writer.unlink(...keys);
      throw new Error("sensitive response lost after Redis committed");
    },
  } });
  expect(committed).toBeGreaterThan(0);
  expect(unknown.status).toBe("failed");
  expect(JSON.stringify(unknown)).not.toContain("sensitive");
  const dirty = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(dirty.code).not.toBe(0);
  const aborted = await maintainOnlineAuthState({ ...s.options, redis: scope.writer, operation: "apply", signal: AbortSignal.abort() });
  expect(aborted.status).toBe("failed");
  const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(applied.code).toBe(0);
  const verified = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(verified.code).toBe(0);
  const retained = await s.observe(s.preserved);
  expect(retained).toEqual(original);
}, 20_000);

it("uses scan-only credentials for read-only operations and reports scan failure even on an empty inventory", async () => {
  const s = await inventory();
  const original = await s.observe([...s.targets, ...s.preserved]);
  const username = scope.unique("scan-reader");
  const password = randomUUID();
  await scope.writer.acl("SETUSER", username, "on", `>${password}`, "~*", "-@all", "+scan", "+select", "+quit");
  const reader = new Redis(process.env.IAM_OIDC_PROVIDER_TEST_REDIS_URL!, {
    username,
    password,
    lazyConnect: true,
    enableReadyCheck: false,
    retryStrategy: () => null,
  });
  reader.on("error", () => {});
  try {
    await reader.connect();
    const dryRun = await maintainOnlineAuthState({ ...s.options, redis: reader, operation: "dry-run" });
    expect(dryRun.status).toBe("passed");
    const verify = await maintainOnlineAuthState({ ...s.options, redis: reader, operation: "verify" });
    expect(verify.status).toBe("failed");
    const forbidden = await maintainOnlineAuthState({ ...s.options, redis: reader, operation: "apply" });
    expect(forbidden.status).toBe("failed");
    const after = await s.observe([...s.targets, ...s.preserved]);
    expect(after).toEqual(original);
    const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
    expect(applied.code).toBe(0);
    const empty = await maintainOnlineAuthState({ ...s.options, redis: reader, operation: "verify" });
    expect(empty.status).toBe("passed");
    await scope.writer.acl("SETUSER", username, "-scan");
    const incomplete = await maintainOnlineAuthState({ ...s.options, redis: reader, operation: "verify" });
    expect(incomplete.status).toBe("failed");
  }
  finally {
    reader.disconnect();
    await scope.writer.acl("DELUSER", username);
  }
});

it("fails the production command on an unresponsive connection and safely reruns against Redis", async () => {
  const s = await inventory();
  const original = await s.observe([...s.targets, ...s.preserved]);
  // A TCP black hole observes connection timeout; it does not implement or simulate Redis.
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const timedOut = await command(["apply", "--writers-stopped"], s.options.kernelNamespace, {
      IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1",
      IAM_OIDC_PROVIDER_REDIS_PORT: String(address.port),
      IAM_OIDC_PROVIDER_REDIS_PASSWORD: "sensitive-timeout-password",
    });
    expect(timedOut.code).not.toBe(0);
    expect(timedOut.output).toContain("Keep traffic stopped");
    expect(timedOut.output).not.toContain("sensitive-timeout-password");
  }
  finally {
    for (const socket of sockets)
      socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  const unchanged = await s.observe([...s.targets, ...s.preserved]);
  expect(unchanged).toEqual(original);
  const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
  expect(applied.code).toBe(0);
  const verified = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
  expect(verified.code).toBe(0);
}, 25_000);

it.each(["timeout", "abort"] as const)("cleans the entire package command tree after harness %s", async (termination) => {
  const s = await inventory();
  const original = await s.observe([...s.targets, ...s.preserved]);
  const controller = new AbortController();
  const sockets = new Set<import("node:net").Socket>();
  const socketErrors: NodeJS.ErrnoException[] = [];
  let connections = 0;
  const server = createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on("error", error => socketErrors.push(error));
    socket.on("close", () => sockets.delete(socket));
    socket.resume();
    if (termination === "abort")
      controller.abort();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Expected TCP address");
    const stopped = await command(["apply", "--writers-stopped"], s.options.kernelNamespace, {
      IAM_OIDC_PROVIDER_REDIS_HOST: "127.0.0.1",
      IAM_OIDC_PROVIDER_REDIS_PORT: String(address.port),
    }, { timeoutMs: 4000, signal: controller.signal });
    expect(stopped.termination).toBe(termination);
    expect(stopped.code).not.toBe(0);
    expect(connections).toBeGreaterThan(0);
    // The Redis connection belongs to the Node grandchild, not the pnpm/Job supervisor.
    // Wait boundedly for peer closure without closing the server side ourselves.
    await new Promise<void>((resolve, reject) => {
      let poll: ReturnType<typeof setInterval>;
      const deadline = setTimeout(() => {
        clearInterval(poll);
        reject(new Error("Maintenance descendant kept its socket"));
      }, 2000);
      poll = setInterval(() => {
        if (sockets.size === 0) {
          clearTimeout(deadline);
          clearInterval(poll);
          resolve();
        }
      }, 10);
    });
    expect(commands.size).toBe(0);
    expect(socketErrors.every(error => error.code === "ECONNRESET")).toBe(true);
    const unchanged = await s.observe([...s.targets, ...s.preserved]);
    expect(unchanged).toEqual(original);
    const applied = await command(["apply", "--writers-stopped"], s.options.kernelNamespace);
    expect(applied.code).toBe(0);
    const verified = await command(["verify", "--writers-stopped"], s.options.kernelNamespace);
    expect(verified.code).toBe(0);
  }
  finally {
    for (const socket of sockets)
      socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}, 25_000);
