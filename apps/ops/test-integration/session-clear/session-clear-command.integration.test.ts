import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import type { Socket } from "node:net";
import { createConnection, createServer } from "node:net";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { createClientSnapshotMaintenance, createClientSnapshotVerifier } from "@iam/client-snapshot/maintenance";
import { createClientSnapshotMaintenanceTestFixture } from "@iam/client-snapshot/testing";
import { ClientStatus } from "@iam/contracts";
import { createCustomSsoMaintenanceTestFixture } from "@iam/custom-sso/testing";
import { createOidcMaintenanceTestFixture } from "@iam/oidc/testing";
import { createOfflineMaintenanceRedis, runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
import { runClientSnapshotMaintenance } from "@ops/commands/client-runtime/client-snapshot-maintenance";
import { parseSessionClearArgs } from "@ops/commands/session-clear/arguments";
import { createSessionClearMaintenance } from "@ops/composition/session-clear-maintenance";
import { parseOfflineMaintenanceEnv } from "@ops/env";
import Redis from "ioredis";
import {
  createOpsRedisTestHarness,
  overrideOpsRedisTestUrl,
  resetOpsRedisTestDatabase,
  resolveOpsRedisTestUrl,
} from "../support/redis-test-harness";
import { runOpsCommand } from "../support/run-ops-command";

let harness: Awaited<ReturnType<typeof createOpsRedisTestHarness>>;
const cleanups: Array<() => Promise<void>> = [];
let stopHarness: (() => Promise<void>) | undefined;
beforeEach(async () => {
  stopHarness = undefined;
  harness = await createOpsRedisTestHarness();
  stopHarness = harness.close;
});
afterEach(async () => {
  const stops = cleanups.splice(0);
  if (stopHarness) await resetOpsRedisTestDatabase([stopHarness, ...stops]);
});

async function observation(keys: string[]) {
  return await Promise.all(
    keys.map(async (key) => ({
      value: await harness.observer.dump(key),
      expiry: await harness.observer.pexpiretime(key),
    })),
  );
}
async function command(operation: string, args: string[], expectedExitCode = 0, overrides: NodeJS.ProcessEnv = {}) {
  const pending = runOpsCommand({
    args: ["session", operation, ...args],
    env: { ...harness.commandEnvironment(), ...overrides },
    expectedExitCode,
  });
  cleanups.push(async () => {
    await pending;
  });
  void pending.catch(() => {});
  const result = await pending;
  const line = result.output.split(/\r?\n/u).find((line) => line.includes('{"version":1,'));
  if (!line) throw new Error(`Safe report missing for session ${operation}`);
  const report = JSON.parse(line.slice(line.indexOf('{"version":1,')));
  expect(result.output).not.toContain(resolveOpsRedisTestUrl(process.env));
  expect(result.output).not.toContain("sensitive-fixture");
  return { ...result, report };
}
const stopped = ["--writers-stopped", "--drained"];

async function runSessionOwners(mode: "inventory" | "apply" | "verify", args: string[], redis: Redis) {
  const input = parseSessionClearArgs([mode, ...args]);
  const owners = createSessionClearMaintenance(redis, input, new AbortController().signal);
  const reports = [];
  for (const owner of owners) reports.push(await owner.run());
  return reports;
}

async function maintainSessions(mode: "inventory" | "apply" | "verify", args: string[], redis = harness.writer) {
  const reports = await runSessionOwners(mode, args, redis);
  expect(reports.reduce((total, report) => total + report.unknown, 0)).toBe(0);
  return reports;
}

async function verifySessions(args: string[], expectedMatching = 0, redis = harness.writer) {
  const reports = await maintainSessions("verify", args, redis);
  expect(reports.reduce((total, report) => total + report.matching, 0)).toBe(expectedMatching);
}

async function withMaintenanceRedis<T>(url: string, run: (redis: Redis) => Promise<T>) {
  let connection: ReturnType<typeof createOfflineMaintenanceRedis> | undefined;
  return await runMaintenanceCommandWithLifecycle({
    deadlineMs: 10_000,
    async shutdown() {
      connection?.close();
    },
    async run(signal) {
      connection = createOfflineMaintenanceRedis(parseOfflineMaintenanceEnv({ IAM_OPS_REDIS_URL: url }), signal);
      await connection.connect();
      return await run(connection.redis);
    },
  });
}

function verifySnapshots(redis: Redis) {
  return createClientSnapshotVerifier({
    scan: async (cursor, match, pattern, count, limit) => await redis.scan(cursor, match, pattern, count, limit),
  }).verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
}

async function restrictedRedis(username: string) {
  const redis = new Redis(resolveOpsRedisTestUrl(process.env), {
    username,
    password: "scan-password",
    lazyConnect: true,
    enableReadyCheck: false,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
  });
  cleanups.push(async () => {
    try {
      if (redis.status === "ready") await redis.quit();
    } finally {
      redis.disconnect();
    }
  });
  await redis.connect();
  return redis;
}

function target(ns: string) {
  return [
    "--layout",
    "unified",
    "--kernel-namespace",
    ns,
    "--custom-namespace",
    ns,
    "--oidc-namespace",
    ns,
    ...stopped,
  ];
}
function fixtures(ns: string) {
  return {
    kernel: createSessionMaintenanceTestFixture(harness.writer, ns),
    custom: createCustomSsoMaintenanceTestFixture(harness.writer, ns),
    oidc: createOidcMaintenanceTestFixture(harness.writer, ns),
  };
}
async function seedUnified(ns: string) {
  const owners = fixtures(ns);
  return [
    ...(await owners.kernel.seedUnified()),
    ...(await owners.custom.seedUnified()),
    ...(await owners.oidc.seedUnified()),
  ];
}

for (const variant of ["leading-and-trailing-whitespace", "only-whitespace", "reserved-url-characters"] as const) {
  test(`the session composition preserves a Redis ACL password containing ${variant}`, async () => {
    const ns = `opaque-credentials:${randomUUID()}`;
    const username = `ops-opaque-${randomUUID()}`;
    const password =
      variant === "only-whitespace"
        ? " \t "
        : variant === "reserved-url-characters"
          ? `opaque-@:/?#%${randomUUID()}`
          : `  opaque-${randomUUID()}  `;
    await harness.writer.call(
      "ACL",
      "SETUSER",
      username,
      "on",
      `>${password}`,
      "~*",
      "+scan",
      "+auth",
      "+select",
      "+client",
      "+quit",
    );
    cleanups.push(async () => {
      await harness.writer.call("ACL", "DELUSER", username);
    });
    const targetKeys = await seedUnified(ns);
    const peerKeys = await fixtures(`peer:${ns}`).kernel.seedUnified();
    const before = await observation([...targetKeys, ...peerKeys]);
    const url = overrideOpsRedisTestUrl({ username, password });
    const reports = await withMaintenanceRedis(url, (redis) => maintainSessions("inventory", target(ns), redis));
    expect(reports.reduce((total, owner) => total + owner.matching, 0)).toBe(targetKeys.length);
    // Missing AUTH would let the permissive default account clear these records.
    const denied = await withMaintenanceRedis(url, (redis) => runSessionOwners("apply", target(ns), redis));
    expect(denied.reduce((total, owner) => total + owner.unknown, 0)).toBe(targetKeys.length);
    const after = await observation([...targetKeys, ...peerKeys]);
    expect(after).toEqual(before);
    const connections = await harness.observer.client("LIST");
    expect(connections).not.toContain(`user=${username}`);
  }, 15000);
}

test("session clear counts and removes all owned records while preserving other namespaces and state owners", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const keys = await seedUnified(ns);
  const retained = [
    ...(await fixtures(`other:${ns}`).kernel.seedUnified()),
    ...(await harness.seedNonOwnerSentinels([
      `${ns}:subject-access:`,
      `${ns}:client-runtime-snapshot:v1:foreign:`,
      `${ns}:subject-facts:`,
      `${ns}:bull:`,
      `${ns}:login-restriction:`,
      `${ns}:sms-code:`,
      `${ns}:nonce:`,
      `${ns}:client-auth-failures:`,
      `${ns}:global_session:`,
      `${ns}:unified-other:`,
    ])),
  ];
  const before = await observation([...keys, ...retained]);
  const inventory = await maintainSessions("inventory", target(ns));
  expect(inventory.reduce((total, owner) => total + owner.matching, 0)).toBe(keys.length);
  await verifySessions(target(ns), keys.length);
  const afterRead = await observation([...keys, ...retained]);
  expect(afterRead).toEqual(before);
  const cleared = await command("apply", target(ns));
  expect(cleared.report).toMatchObject({ mode: "apply", status: "completed" });
  await verifySessions(target(ns));
  const remaining = await harness.observer.exists(...keys);
  const after = await observation(retained);
  expect(remaining).toBe(0);
  expect(after).toEqual(before.slice(keys.length));
  await maintainSessions("apply", target(ns));
}, 60_000);

test("session clear ignores payload versions, malformed records, unknown key families and Redis value types", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const owners = fixtures(ns);
  const keys = [
    ...(await seedUnified(ns)),
    ...(await owners.kernel.seedCorruptUnified()),
    await owners.custom.seedCorruptUnified(),
    await owners.oidc.seedMalformedToken(),
    ...(await owners.kernel.seedVersionedKeys()),
    ...(await owners.custom.seedVersionedKeys()),
    ...(await owners.oidc.seedVersionedKeys()),
  ];
  const before = await observation(keys);
  const inventory = await maintainSessions("inventory", target(ns));
  expect(inventory.reduce((total, report) => total + report.matching, 0)).toBe(keys.length);
  await verifySessions(target(ns), keys.length);
  const afterRead = await observation(keys);
  expect(afterRead).toEqual(before);
  await maintainSessions("apply", target(ns));
  await verifySessions(target(ns));
  const remaining = await harness.observer.exists(...keys);
  expect(remaining).toBe(0);
}, 45_000);

test("single owner clears every Client and preserves other owners and exact namespace bytes", async () => {
  const ns = `session-clear:${randomUUID()}:`;
  const owners = fixtures(ns);
  const own = [
    ...(await owners.custom.seedUnified("alpha")),
    ...(await owners.custom.seedUnified("beta")),
    ...(await owners.custom.seedVersionedKeys()),
  ];
  const retained = [
    ...(await owners.kernel.seedUnified()),
    ...(await owners.oidc.seedUnified()),
    ...(await fixtures(ns.slice(0, -1)).custom.seedUnified()),
  ];
  const before = await observation(retained);
  const scope = ["--layout", "unified", "--owner", "custom-sso", "--custom-namespace", ns, ...stopped];
  await maintainSessions("apply", scope);
  await verifySessions(scope);
  const remaining = await harness.observer.exists(...own);
  const after = await observation(retained);
  expect(remaining).toBe(0);
  expect(after).toEqual(before);
}, 45_000);

test("session clear paginates whole keys and removes large indexes without inspecting members", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const owners = fixtures(ns);
  const index = await owners.kernel.seedLargeUnifiedIndex(1001);
  const keys = await Promise.all(Array.from({ length: 250 }, () => owners.custom.seedUnknownUnifiedFamily()));
  const before = await index.count();
  expect(before).toBe(1001);
  const inventory = await maintainSessions("inventory", target(ns));
  expect(inventory.reduce((total, report) => total + report.matching, 0)).toBe(keys.length + 1);
  await maintainSessions("apply", target(ns));
  await verifySessions(target(ns));
  const remaining = await harness.observer.exists(...keys);
  const members = await index.count();
  expect(remaining).toBe(0);
  expect(members).toBe(0);
}, 40_000);

test("inventory and verify need only SCAN; clear needs only SCAN and UNLINK", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const user = `session-clear-${randomUUID()}`;
  await harness.writer.call(
    "ACL",
    "SETUSER",
    user,
    "on",
    ">scan-password",
    "~*",
    "+scan",
    "+auth",
    "+select",
    "+client",
    "+quit",
  );
  cleanups.push(async () => {
    await harness.writer.call("ACL", "DELUSER", user);
  });
  const reader = await restrictedRedis(user);
  await verifySessions(target(ns), 0, reader);
  const dirty = await fixtures(ns).oidc.seedMalformedToken();
  const inventory = await maintainSessions("inventory", target(ns), reader);
  expect(inventory.reduce((total, report) => total + report.matching, 0)).toBe(1);
  await verifySessions(target(ns), 1, reader);
  const denied = await runSessionOwners("apply", target(ns), reader);
  expect(denied.reduce((total, owner) => total + owner.unknown, 0)).toBe(1);
  const preserved = await harness.observer.get(dirty);
  expect(preserved).toBe("sensitive-fixture");
  await harness.writer.call("ACL", "SETUSER", user, "+unlink");
  await maintainSessions("apply", target(ns), reader);
  await verifySessions(target(ns), 0, reader);
}, 30_000);

test("Snapshot verification reports remaining inventory through a read-only ACL", async () => {
  const user = `snapshot-readonly-${randomUUID()}`;
  await harness.writer.call(
    "ACL",
    "SETUSER",
    user,
    "on",
    ">scan-password",
    "~*",
    "+scan",
    "+auth",
    "+select",
    "+client",
    "+quit",
  );
  cleanups.push(async () => {
    await harness.writer.call("ACL", "DELUSER", user);
  });
  const environment = { IAM_OPS_REDIS_URL: overrideOpsRedisTestUrl({ username: user, password: "scan-password" }) };
  const scope = ["--all", ...stopped];
  const cache = await createClientSnapshotMaintenanceTestFixture(harness.writer).seedInvalidClientPayload(
    `snapshot-${randomUUID()}`,
  );
  const before = await observation([cache]);
  const blocked = await runClientSnapshotMaintenance(["verify", ...scope], environment);
  expect(blocked).toMatchObject({ exitCode: 1, report: { mode: "verify", status: "failed", matching: 1 } });
  const afterVerify = await observation([cache]);
  expect(afterVerify).toEqual(before);

  const denied = await runClientSnapshotMaintenance(["repair", ...scope], environment);
  expect(denied).toMatchObject({ exitCode: 1, report: { mode: "repair", status: "failed" } });
  const afterDeniedRepair = await observation([cache]);
  expect(afterDeniedRepair).toEqual(before);

  const repaired = await runClientSnapshotMaintenance(["repair", ...scope], {
    IAM_OPS_REDIS_URL: resolveOpsRedisTestUrl(process.env),
  });
  expect(repaired).toMatchObject({
    exitCode: 0,
    report: { mode: "repair", status: "completed", scope: "all-client-runtime-caches" },
  });
  const verified = await runClientSnapshotMaintenance(["verify", ...scope], environment);
  expect(verified).toMatchObject({ exitCode: 0, report: { mode: "verify", status: "completed", matching: 0 } });
}, 30_000);

test("Snapshot repair shares control across ordinary and sensitive readers without changing Secret or sessions", async () => {
  const clientCode = `iam193-${randomUUID()}`;
  const other = `iam193-${randomUUID()}`;
  let enabled = true;
  const secret = "sensitive-fixture";
  const credentialId = randomUUID();
  const updatedAt = new Date().toISOString();
  const snapshots = createClientSnapshots({
    redis: harness.writer,
    source: {
      async loadClient(code) {
        return {
          clientCode: code,
          status: enabled ? ClientStatus.Enable : ClientStatus.Maintenance,
          ssoEnabled: false,
          ssoConfig: null,
          admissionEnabled: false,
          admissionFilter: null,
        };
      },
      async loadCredential() {
        return { secret, credentialId, updatedAt };
      },
    },
  });
  const snapshotFixture = createClientSnapshotMaintenanceTestFixture(harness.writer);
  const otherKeys = snapshotFixture.trackClient(other);
  const beforeClient = await snapshots.client.acquire(clientCode);
  const beforeSecret = await snapshots.credential.acquire(clientCode);
  await snapshots.client.acquire(other);
  await snapshots.credential.acquire(other);
  const otherBefore = await observation(otherKeys);
  const sessions = await fixtures(`iam193:${randomUUID()}`).kernel.seedUnified();
  const sessionBefore = await observation(sessions);
  enabled = false;
  const repaired = await runClientSnapshotMaintenance(["repair", "--client-code", clientCode], {
    IAM_OPS_REDIS_URL: resolveOpsRedisTestUrl(process.env),
  });
  expect(repaired).toMatchObject({
    exitCode: 0,
    report: { status: "completed", reason: "scope-complete", scope: "client-protocol-snapshot" },
  });
  const afterClient = await snapshots.client.acquire(clientCode);
  const afterSecret = await snapshots.credential.acquire(clientCode);
  const otherAfter = await observation(otherKeys);
  const sessionsAfter = await observation(sessions);
  expect(beforeClient).not.toEqual(afterClient);
  expect(beforeSecret.kind).toBe("present");
  expect(afterSecret).toEqual(beforeSecret);
  expect(otherAfter).toEqual(otherBefore);
  expect(sessionsAfter).toEqual(sessionBefore);
}, 30_000);

test("Snapshot full repair clears invalid payloads without changing sessions", async () => {
  const sessions = await fixtures(`session-clear:${randomUUID()}`).kernel.seedUnified();
  const sessionBefore = await observation(sessions);
  const badCache = await createClientSnapshotMaintenanceTestFixture(harness.writer).seedInvalidClientPayload(
    `session-clear-${randomUUID()}`,
  );
  await createClientSnapshotMaintenance(harness.writer).repairAllAfterRedisRestore({ protocolTrafficStopped: true });
  const verified = await verifySnapshots(harness.writer);
  expect(verified.matchingKeys).toBe(0);
  const remaining = await harness.observer.exists(badCache);
  const finalSessions = await observation(sessions);
  expect(remaining).toBe(0);
  expect(finalSessions).toEqual(sessionBefore);
}, 30_000);

test("cleanup rejects invalid input before connecting", async () => {
  const rejected = await command("apply", ["--layout", "unified"], 2, { IAM_OPS_REDIS_URL: "" });
  expect(rejected.report.reason).toBe("invalid-input");
}, 15_000);

test("cleanup reports invalid Redis configuration as an operation failure", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const secretUrl = "redis://private-user:private-password@localhost/invalid-db";
  const result = await command("inventory", target(ns), 1, { IAM_OPS_REDIS_URL: secretUrl });
  expect(result.output).toContain("IAM_OPS_REDIS_URL");
  expect(result.output).not.toContain("private-");
  expect(result.output).not.toContain(secretUrl);
}, 15_000);

async function listen(server: ReturnType<typeof createServer>, sockets: Set<Socket>) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    sockets.forEach((socket) => {
      socket.destroy();
    });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing loopback listener");
  return address.port;
}

test("nonresponding Redis is bounded by the cleanup deadline", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  const port = await listen(server, sockets);
  const started = Date.now();
  await command("inventory", [...target(ns), "--deadline-ms", "200"], 1, {
    IAM_OPS_REDIS_URL: overrideOpsRedisTestUrl({ port }),
  });
  expect(Date.now() - started).toBeLessThan(10_000);
}, 30_000);

test("clear reports failure when the UNLINK reply is lost and safely reruns after partial deletion", async () => {
  const ns = `session-clear:${randomUUID()}`;
  const keys = await seedUnified(ns);
  const url = new URL(resolveOpsRedisTestUrl(process.env));
  const sockets = new Set<Socket>();
  let drop = false;
  let committed = false;
  const server = createServer((client) => {
    const upstream = createConnection({ host: url.hostname, port: Number(url.port) });
    sockets.add(client);
    sockets.add(upstream);
    client.on("error", () => {});
    upstream.on("error", () => client.destroy());
    client.on("close", () => {
      sockets.delete(client);
      upstream.destroy();
    });
    upstream.on("close", () => {
      sockets.delete(upstream);
      client.destroy();
    });
    client.on("data", (chunk) => {
      if (chunk.toString().toLowerCase().includes("\r\nunlink\r\n")) drop = true;
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      if (drop && !committed && /^:[1-9]\d*\r\n/u.test(chunk.toString())) {
        committed = true;
        client.destroy();
        upstream.destroy();
      } else client.write(chunk);
    });
  });
  const port = await listen(server, sockets);
  const proxyUrl = overrideOpsRedisTestUrl({ port });
  const [report] = await withMaintenanceRedis(proxyUrl, (redis) =>
    runSessionOwners("apply", [...target(ns), "--owner", "kernel"], redis),
  );
  expect(report).toMatchObject({ removed: 0 });
  expect(report?.unknown).toBeGreaterThan(0);
  expect(committed).toBe(true);
  const remaining = await harness.observer.exists(...keys);
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThan(keys.length);
  await verifySessions(target(ns), remaining);
  await maintainSessions("apply", target(ns));
  await verifySessions(target(ns));
}, 45_000);
