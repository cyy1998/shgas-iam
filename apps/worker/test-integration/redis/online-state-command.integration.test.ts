import type { Socket } from "node:net";
import { randomUUID } from "node:crypto";
import { createConnection, createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import { createClientSnapshotVerifier } from "@iam/api-core/client-snapshot/maintenance";
import { createClientSnapshotMaintenanceTestFixture } from "@iam/api-core/client-snapshot/testing";
import {
  runProcessCommandSmoke,
  spawnOwnedProcessTree,
  withOwnedTemporaryDirectory,
} from "@iam/api-core/testing/process-smoke-harness";
import { ClientStatus } from "@iam/contracts";
import { createUnifiedCustomSsoMaintenance } from "@iam/custom-sso/maintenance";
import { createCustomSsoMaintenanceTestFixture } from "@iam/custom-sso/testing";
import { createOidcMaintenanceTestFixture } from "@iam/oidc/testing";
import { createSessionMaintenanceTestFixture } from "@iam/session-kernel/testing";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { createWorkerRedisTestHarness, resolveWorkerRedisTestUrl } from "./redis-test-harness";

const workerRoot = fileURLToPath(new URL("../../", import.meta.url));
let harness: Awaited<ReturnType<typeof createWorkerRedisTestHarness>>;
const cleanups: Array<() => Promise<void>> = [];
beforeEach(async () => {
  harness = await createWorkerRedisTestHarness();
  const snapshots = await createClientSnapshotVerifier(harness.observer).verifyAllAfterRedisRestore({
    protocolTrafficStopped: true,
  });
  expect(snapshots.matchingKeys).toBe(0);
});
afterEach(async () => {
  const results = await Promise.allSettled(cleanups.splice(0).map(close => close()));
  await harness.close();
  const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (errors.length)
    throw new AggregateError(errors, "Maintenance test resource cleanup failed");
});

const owned = (key: string) => harness.ownedRestoreFixtureKey(key);
async function observation(keys: string[]) {
  return await Promise.all(
    keys.map(async key => ({
      value: await harness.observer.dump(key),
      expiry: await harness.observer.pexpiretime(key),
    })),
  );
}
async function command(
  script: string,
  args: string[],
  expectedExitCode = 0,
  overrides: NodeJS.ProcessEnv = {},
) {
  const result = await withOwnedTemporaryDirectory({
    prefix: "iam193-command-",
    cleanupTimeoutMs: 5000,
    async run(temporaryDirectory) {
      return await runProcessCommandSmoke({
        label: script,
        completionTimeoutMs: 20_000,
        cleanupTimeoutMs: 5000,
        expectedExitCode,
        start: () =>
          spawnOwnedProcessTree({
            executable: process.execPath,
            args: ["--no-env-file", "run", script, "--", ...args],
            cwd: workerRoot,
            env: { ...harness.commandEnvironment(temporaryDirectory), ...overrides },
          }),
      });
    },
  });
  const line = result.output.split(/\r?\n/u).find(line => line.includes("{\"version\":1,"));
  if (!line)
    throw new Error(`Safe report missing for ${script}`);
  const report = JSON.parse(line.slice(line.indexOf("{\"version\":1,")));
  expect(result.output).not.toContain(resolveWorkerRedisTestUrl(process.env));
  expect(result.output).not.toContain("sensitive-fixture");
  return { ...result, report };
}
const stopped = ["--writers-stopped", "--drained"];
function authorizationScope(ns: string) {
  return ["--layout", "unified", "--owner", "custom-sso", "--custom-namespace", ns, "--client-code", "alpha", "--artifacts", "authorization", ...stopped];
}
function target(ns: string, mode: string) {
  return [
    mode,
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
    kernel: createSessionMaintenanceTestFixture(harness.writer, ns, owned),
    custom: createCustomSsoMaintenanceTestFixture(harness.writer, ns, owned),
    oidc: createOidcMaintenanceTestFixture(harness.writer, ns, owned),
  };
}
async function seedUnified(ns: string) {
  const owners = fixtures(ns);
  return {
    allKeys: [
      ...(await owners.kernel.seedUnified()),
      ...(await owners.custom.seedUnified()),
      ...(await owners.oidc.seedUnified()),
    ],
  };
}
test("unified CLI includes no-index/no-TTL states, protocol continuations and orphan IDs while retaining other namespaces", async () => {
  const ns = `iam193:${randomUUID()}`;
  const fixture = await seedUnified(ns);
  const retained = [
    ...(await fixtures(`other:${ns}`).kernel.seedUnified()),
    ...(await harness.seedNonOwnerSentinels([
      "subject-access:",
      "client-runtime-snapshot:v1:foreign:",
      "subject-facts:",
      "bull:",
      "login-restriction:",
      "sms-code:",
      "nonce:",
      "oidc:client-auth-failures:",
      "oidc:user-tokens:",
      "global_session:",
    ])),
  ];
  const before = await observation([...fixture.allKeys, ...retained]);
  const inventory = await command("online-auth:state", target(ns, "inventory"));
  expect(inventory.report.status).toBe("completed");
  await command("online-auth:state", target(ns, "verify"), 1);
  expect(await observation([...fixture.allKeys, ...retained])).toEqual(before);
  await command("online-auth:state", target(ns, "apply"));
  await command("online-auth:state", target(ns, "verify"));
  expect(await harness.observer.exists(...fixture.allKeys)).toBe(0);
  expect(await observation(retained)).toEqual(before.slice(fixture.allKeys.length));
  await command("online-auth:state", target(ns, "apply"));
}, 60_000);

test("unknown state, unknown version and wrong Redis type stay intact and block completion", async () => {
  const ns = `iam193:${randomUUID()}`;
  const fixture = await seedUnified(ns);
  const owners = fixtures(ns);
  const bad = [
    ...(await owners.kernel.seedCorruptUnified()),
    await owners.custom.seedCorruptUnified(),
    await owners.oidc.seedUnknownUnifiedFamily(),
  ];
  const before = await observation(bad);
  await command("online-auth:state", target(ns, "inventory"), 1);
  await command("online-auth:state", target(ns, "apply"), 1);
  await command("online-auth:state", target(ns, "verify"), 1);
  expect(await observation(bad)).toEqual(before);
  expect(await harness.observer.exists(...fixture.allKeys)).toBe(0);
  // Only the fixture owner removes the known test corruption, never the maintenance command.
  await harness.writer.unlink(...bad);
  await command("online-auth:state", target(ns, "apply"));
  await command("online-auth:state", target(ns, "verify"));
}, 60_000);

test("scoped protocol cleanup preserves another Client byte-for-byte and includes its own continuation", async () => {
  const ns = `iam193:${randomUUID()}`;
  const custom = fixtures(ns).custom;
  const own = await custom.seedContinuation("alpha");
  const other = await custom.seedContinuation("beta");
  const before = await observation([other]);
  const scope = [
    "--layout",
    "unified",
    "--owner",
    "custom-sso",
    "--custom-namespace",
    ns,
    "--client-code",
    "alpha",
    ...stopped,
  ];
  await command("online-auth:state", ["apply", ...scope]);
  await command("online-auth:state", ["verify", ...scope]);
  expect(await harness.observer.exists(own)).toBe(0);
  expect(await observation([other])).toEqual(before);
}, 30_000);

test("authorization CLI clears every target purpose while preserving same-Client Tokens, all reverse indexes and sessions", async () => {
  const ns = `iam204:${randomUUID()}`;
  const custom = fixtures(ns).custom;
  const target = await custom.seedAuthorizationPreservation();
  const other = await custom.seedAuthorizationPreservation("business");
  const later = await custom.seedAuthorizationPreservation("later-managed");
  const retained = [...target.retained, ...other.retained, ...other.authorization, ...later.retained, ...later.authorization, ...(await fixtures(ns).kernel.seedUnified()), ...(await fixtures(ns).oidc.seedUnified()), ...(await fixtures(`other:${ns}`).custom.seedUnified())];
  const before = await observation(retained);
  const scope = authorizationScope(ns);
  const inventory = await command("online-auth:state", ["inventory", ...scope]);
  expect(inventory.report.owners[0].matching).toBe(target.authorization.length);
  await command("online-auth:state", ["verify", ...scope], 1);
  await command("online-auth:state", ["apply", ...scope]);
  await command("online-auth:state", ["verify", ...scope]);
  await command("online-auth:state", ["apply", ...scope]);
  const after = await observation(retained);
  const remaining = await harness.observer.exists(...target.authorization);
  expect(after).toEqual(before);
  expect(remaining).toBe(0);
}, 45_000);

test("authorization CLI retains bad unclassifiable Code and blocks all modes until explicitly repaired", async () => {
  const ns = `iam204:${randomUUID()}`;
  const custom = fixtures(ns).custom;
  const target = await custom.seedAuthorizationPreservation();
  const bad = await custom.seedCorruptUnified();
  const unknown = await custom.seedUnknownUnifiedFamily();
  const retained = [...target.retained, bad, unknown];
  const before = await observation(retained);
  for (const mode of ["inventory", "apply", "verify"])
    await command("online-auth:state", [mode, ...authorizationScope(ns)], 1);
  const after = await observation(retained);
  expect(after).toEqual(before);
  await harness.writer.unlink(bad, unknown);
  await command("online-auth:state", ["apply", ...authorizationScope(ns)]);
  await command("online-auth:state", ["verify", ...authorizationScope(ns)]);
}, 45_000);

test("authorization owner paginates and reports CAS replacement without touching preserved Tokens", async () => {
  const ns = `iam204:${randomUUID()}`;
  const target = await fixtures(ns).custom.seedAuthorizationPreservation();
  const before = await observation(target.retained);
  let replaced = false;
  const owner = createUnifiedCustomSsoMaintenance({
    scan: async (...args) => await harness.writer.scan(...args),
    get: async key => await harness.writer.get(key),
    async eval(script, count, ...args) {
      if (!replaced) {
        // Generic transport-side race: the observed string changes before the production CAS.
        await harness.writer.append(args[0]!, " ");
        replaced = true;
      }
      return await harness.writer.eval(script, count, ...args);
    },
  }, ns);
  let cursor = "0";
  let changed = 0;
  let removed = 0;
  do {
    const result = await owner.apply({ cursor, limit: 1, clientCode: "alpha", artifacts: "authorization" });
    cursor = result.nextCursor;
    changed += result.changed;
    removed += result.removed;
    expect(result.unknown).toBe(0);
  } while (cursor !== "0");
  expect(changed).toBe(1);
  expect(removed).toBe(target.authorization.length - 1);
  await command("online-auth:state", ["verify", ...authorizationScope(ns)], 1);
  await command("online-auth:state", ["apply", ...authorizationScope(ns)]);
  await command("online-auth:state", ["verify", ...authorizationScope(ns)]);
  const after = await observation(target.retained);
  expect(after).toEqual(before);
}, 30_000);

test("large Kernel indexes make bounded progress and require a complete independent rerun", async () => {
  const ns = `iam193:${randomUUID()}`;
  const owners = fixtures(ns);
  const index = await owners.kernel.seedLargeUnifiedIndex(1001);
  await command("online-auth:state", target(ns, "inventory"), 1);
  await command("online-auth:state", target(ns, "apply"), 1);
  const remaining = await index.count();
  expect(remaining).toBe(1);
  await command("online-auth:state", target(ns, "verify"), 1);
  await command("online-auth:state", target(ns, "apply"));
  await command("online-auth:state", target(ns, "verify"));
}, 40_000);

test("independent full verify runs with scan-only ACL and cannot repair dirty state", async () => {
  const ns = `iam193:${randomUUID()}`;
  const user = `iam193-${randomUUID()}`;
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
  const env = { IAM_WORKER_REDIS_USERNAME: user, IAM_WORKER_REDIS_PASSWORD: "scan-password" };
  await command("online-auth:state", target(ns, "verify"), 0, env);
  const dirty = await fixtures(ns).oidc.seedMalformedToken();
  await command("online-auth:state", target(ns, "verify"), 1, env);
  expect(await harness.observer.get(dirty)).toBe("sensitive-fixture");
  await command("online-auth:state", target(ns, "apply"), 1, env);
  expect(await harness.observer.get(dirty)).toBe("sensitive-fixture");
  await command("client-snapshot:verify", ["--all", ...stopped], 0, env);
  const cache = await createClientSnapshotMaintenanceTestFixture(
    harness.writer,
    owned,
  ).seedInvalidClientPayload(`iam193-${randomUUID()}`);
  await command("client-snapshot:verify", ["--all", ...stopped], 1, env);
  await command("client-snapshot:repair", ["--all", ...stopped], 1, env);
  expect(await harness.observer.get(cache)).toBe("sensitive-fixture");
  await command("client-snapshot:repair", ["--all", ...stopped]);
  await command("client-snapshot:verify", ["--all", ...stopped], 0, env);
}, 40_000);

test("Snapshot CLI shares control across ordinary and sensitive readers without changing Secret or sessions", async () => {
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
        };
      },
      async loadCredential() {
        return { secret, credentialId, updatedAt };
      },
    },
  });
  const snapshotFixture = createClientSnapshotMaintenanceTestFixture(harness.writer, owned);
  snapshotFixture.trackClient(clientCode);
  const otherKeys = snapshotFixture.trackClient(other);
  const beforeClient = await snapshots.client.acquire(clientCode);
  const beforeSecret = await snapshots.credential.acquire(clientCode);
  await snapshots.client.acquire(other);
  await snapshots.credential.acquire(other);
  const otherBefore = await observation(otherKeys);
  const sessions = await fixtures(`iam193:${randomUUID()}`).kernel.seedUnified();
  const sessionBefore = await observation(sessions);
  enabled = false;
  await command("client-snapshot:repair", ["--client-code", clientCode]);
  const afterClient = await snapshots.client.acquire(clientCode);
  const afterSecret = await snapshots.credential.acquire(clientCode);
  expect(beforeClient).not.toEqual(afterClient);
  expect(beforeSecret.kind).toBe("present");
  expect(afterSecret).toEqual(beforeSecret);
  expect(await observation(otherKeys)).toEqual(otherBefore);
  expect(await observation(sessions)).toEqual(sessionBefore);
  const badCache = await snapshotFixture.seedInvalidClientPayload(clientCode);
  await command("client-snapshot:verify", ["--all", ...stopped], 1);
  await command("client-snapshot:repair", ["--all", ...stopped]);
  await command("client-snapshot:verify", ["--all", ...stopped]);
  expect(await harness.observer.exists(badCache)).toBe(0);
  expect(await observation(sessions)).toEqual(sessionBefore);
}, 50_000);

test("invalid input is rejected before connecting and nonresponding Redis is bounded", async () => {
  const ns = `iam193:${randomUUID()}`;
  await command("online-auth:state", ["apply", "--layout", "unified"], 2);
  await command("online-auth:state", ["apply", "--layout", "source", "--kernel-namespace", ns, ...stopped], 2, { IAM_WORKER_REDIS_HOST: "" });
  await command("online-auth:state", ["apply", ...target(ns, "inventory").slice(1), "--artifacts", "authorization"], 2);
  await command("online-auth:state", ["apply", "--layout", "unified", "--owner", "custom-sso", "--custom-namespace", ns, "--artifacts", "authorization", ...stopped], 2);
  await command("online-auth:state", target(ns, "inventory"), 1, { IAM_WORKER_REDIS_HOST: "" });
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback listener");
  const started = Date.now();
  await command("online-auth:state", [...target(ns, "inventory"), "--deadline-ms", "200"], 1, {
    IAM_WORKER_REDIS_PORT: String(address.port),
  });
  expect(Date.now() - started).toBeLessThan(10_000);
}, 30_000);

test.each([false, true])("actual CLI reports committed deletion with lost response and safely reruns (authorization only: %s)", async (authorizationOnly) => {
  const ns = `iam193:${randomUUID()}`;
  const selected = authorizationOnly ? await fixtures(ns).custom.seedAuthorizationPreservation() : undefined;
  const fixture = selected ? { allKeys: selected.authorization } : await seedUnified(ns);
  const retainedBefore = selected ? await observation(selected.retained) : [];
  const args = (mode: string) => authorizationOnly ? [mode, ...authorizationScope(ns)] : target(ns, mode);
  const url = new URL(resolveWorkerRedisTestUrl(process.env));
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
      // The proxy forwards bytes to real Redis. It only drops the actual EVAL reply.
      if (chunk.toString().toLowerCase().includes("\r\neval\r\n"))
        drop = true;
      upstream.write(chunk);
    });
    upstream.on("data", (chunk) => {
      if (drop && !committed && chunk.toString().startsWith(":1\r\n")) {
        committed = true;
        client.destroy();
        upstream.destroy();
      }
      else {
        client.write(chunk);
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(async () => {
    sockets.forEach(socket => socket.destroy());
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback proxy");
  await command("online-auth:state", args("apply"), 1, { IAM_WORKER_REDIS_PORT: String(address.port) });
  expect(committed).toBe(true);
  const remaining = await harness.observer.exists(...fixture.allKeys);
  expect(remaining).toBeGreaterThan(0);
  expect(remaining).toBeLessThan(fixture.allKeys.length);
  await command("online-auth:state", args("verify"), 1);
  await command("online-auth:state", args("apply"));
  await command("online-auth:state", args("verify"));
  if (selected) {
    const retainedAfter = await observation(selected.retained);
    expect(retainedAfter).toEqual(retainedBefore);
  }
}, 45_000);
