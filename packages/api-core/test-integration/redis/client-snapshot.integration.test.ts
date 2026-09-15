import { randomUUID } from "node:crypto";
import { connect, createServer } from "node:net";
import { ClientSnapshotUnavailableError } from "@iam/api-core/client-snapshot";
import { createClientSnapshots } from "@iam/api-core/client-snapshot/composition";
import {
  createClientSnapshotMaintenance,
  createClientSnapshotVerifier,
} from "@iam/api-core/client-snapshot/maintenance";
import { clientSnapshotKeys } from "@iam/api-core/client-snapshot/testing";
import { ClientStatus } from "@iam/contracts";
import { afterAll, afterEach, beforeAll, expect, test } from "bun:test";
import Redis from "ioredis";

let redis: Redis;
const codes: string[] = [];
beforeAll(async () => {
  const url = process.env.IAM_API_CORE_TEST_REDIS_URL;
  if (!url)
    throw new Error("IAM_API_CORE_TEST_REDIS_URL required");
  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  await redis.connect();
});
afterEach(async () => {
  for (const code of codes.splice(0)) {
    const keys = clientSnapshotKeys(code);
    await redis.unlink(keys.control, ...keys.payloads);
  }
});
afterAll(async () => {
  await redis?.quit();
});
function fixture() {
  const code = `snapshot-${randomUUID()}`;
  codes.push(code);
  let ordinary: unknown = {
    clientCode: code,
    status: ClientStatus.Enable,
    ssoEnabled: false,
    ssoConfig: null,
    secret: "SECRET-SENTINEL",
  };
  let secret: unknown = {
    secret: "current",
    credentialId: randomUUID(),
    updatedAt: new Date().toISOString(),
    control: "PRIVATE",
  };
  let clientLoads = 0;
  let secretLoads = 0;
  const source = {
    async loadClient() {
      clientLoads++;
      return ordinary;
    },
    async loadCredential() {
      secretLoads++;
      return secret;
    },
  };
  return {
    code,
    source,
    setClient(value: unknown) {
      ordinary = value;
    },
    setSecret(value: unknown) {
      secret = value;
    },
    counts: () => ({ clientLoads, secretLoads }),
  };
}
function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function failure(work: () => Promise<unknown>) {
  try {
    await work();
  }
  catch (error) {
    return error;
  }
  throw new Error("Expected failure");
}

test("ordinary cold/warm serializer strips sensitive source fields, gate shares actual reader, negative TTL differs", async () => {
  const f = fixture();
  const snapshots = createClientSnapshots({ redis, source: f.source });
  const [cold, gate, credential] = await Promise.all([
    snapshots.client.acquire(f.code),
    snapshots.gate.acquire(f.code),
    snapshots.credential.acquire(f.code),
  ]);
  expect(cold).toEqual({
    kind: "present",
    value: {
      clientCode: f.code,
      status: ClientStatus.Enable,
      ssoEnabled: false,
      ssoConfig: null,
    },
  });
  expect(gate).toEqual({
    kind: "present",
    value: { clientCode: f.code, status: ClientStatus.Enable },
  });
  expect(credential.kind).toBe("present");
  expect(JSON.stringify(credential)).not.toContain("PRIVATE");
  const warm = await snapshots.client.acquire(f.code);
  expect(warm).toEqual(cold);
  expect(f.counts()).toEqual({ clientLoads: 1, secretLoads: 1 });
  const keys = clientSnapshotKeys(f.code);
  const presentTtl = await redis.pttl(keys.payloads[0]);
  expect(presentTtl).toBeGreaterThan(28_000);
  f.setClient(null);
  f.setSecret(null);
  await snapshots.invalidateClient(f.code);
  const absent = await snapshots.client.acquire(f.code);
  expect(absent).toEqual({ kind: "absent" });
  const absentTtl = await redis.pttl(keys.payloads[0]);
  expect(absentTtl).toBeGreaterThan(1_000);
  expect(absentTtl).toBeLessThanOrEqual(3_000);
  const secretAbsent = await snapshots.credential.acquire(f.code);
  expect(secretAbsent).toEqual({ kind: "absent" });
  expect(cold.kind).toBe("present");
});

test("injected TTL expires and invalidation does not replace an already accepted observation", async () => {
  const f = fixture();
  const snapshots = createClientSnapshots({
    redis,
    source: f.source,
    presentTtlMs: 40,
    absentTtlMs: 20,
  });
  const original = await snapshots.client.acquire(f.code);
  await new Promise(resolve => setTimeout(resolve, 65));
  f.setClient(null);
  const current = await snapshots.client.acquire(f.code);
  expect(current.kind).toBe("absent");
  expect(original.kind).toBe("present");
});

for (const kind of ["client", "gate", "credential"] as const) {
  for (const cache of ["warm", "negative", "bad-payload", "bad-control"] as const) {
    test(`${kind} ${cache}: independent invalidation separates new acquisition from delayed Redis observation`, async () => {
      const f = fixture();
      if (cache === "negative") {
        f.setClient(null);
        f.setSecret(null);
      }
      const reached = latch();
      const resume = latch();
      let delay = false;
      const snapshots = createClientSnapshots({
        source: f.source,
        redis: {
          async eval(script, count, ...args) {
            const result = await redis.eval(script, count, ...args);
            if (delay) {
              delay = false;
              reached.release();
              await resume.promise;
            }
            return result;
          },
        },
      });
      const original = await snapshots[kind].acquire(f.code);
      const keys = clientSnapshotKeys(f.code);
      if (cache === "bad-payload")
        await redis.set(keys.payloads[kind === "credential" ? 1 : 0], "bad");
      if (cache === "bad-control")
        await redis.hset(keys.control, "schemaVersion", "bad");
      const independent = redis.duplicate({ lazyConnect: true });
      await independent.connect();
      delay = true;
      const a = snapshots[kind].acquire(f.code);
      let b:
        | ReturnType<typeof snapshots.client.acquire>
        | ReturnType<typeof snapshots.credential.acquire>
        | ReturnType<typeof snapshots.gate.acquire>
        | undefined;
      try {
        await reached.promise;
        f.setClient({
          clientCode: f.code,
          status: ClientStatus.Maintenance,
          ssoEnabled: false,
          ssoConfig: null,
        });
        f.setSecret({
          secret: "replacement",
          credentialId: randomUUID(),
          updatedAt: new Date().toISOString(),
        });
        await createClientSnapshots({ redis: independent, source: f.source }).invalidateClient(f.code);
        b = snapshots[kind].acquire(f.code);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const completed = await Promise.race([
          b.then(() => true),
          new Promise<false>((resolve) => {
            timer = setTimeout(resolve, 500, false);
          }),
        ]);
        clearTimeout(timer);
        expect(completed).toBe(true);
        const current = await b;
        expect(current).toMatchObject(
          kind === "credential"
            ? { kind: "present", value: { secret: "replacement" } }
            : { kind: "present", value: { status: ClientStatus.Maintenance } },
        );
        resume.release();
        const accepted = await a;
        expect(accepted).toEqual(cache === "warm" || cache === "negative" ? original : current);
      }
      finally {
        resume.release();
        await Promise.allSettled([a, ...(b ? [b] : [])]);
        await independent.quit();
      }
    });
  }
}

for (const kind of ["client", "credential"] as const) {
  test(`${kind} singleflight, successful invalidation and bootstrap ABA reject late refill`, async () => {
    const f = fixture();
    const snapshots = createClientSnapshots({ redis, source: f.source });
    await snapshots[kind].acquire(f.code);
    const keys = clientSnapshotKeys(f.code);
    const epoch = await redis.hget(keys.control, "epoch");
    await redis.unlink(...keys.payloads);
    const reached = latch();
    const resume = latch();
    const method = kind === "client" ? "loadClient" : "loadCredential";
    const load = f.source[method];
    let delayed = true;
    f.source[method] = async () => {
      const row = await load();
      if (delayed) {
        delayed = false;
        reached.release();
        await resume.promise;
      }
      return row;
    };
    const a = snapshots[kind].acquire(f.code);
    const b = snapshots[kind].acquire(f.code);
    await reached.promise;
    f.setClient(null);
    f.setSecret(null);
    await redis.unlink(keys.control);
    const other = createClientSnapshots({ redis, source: f.source });
    await other[kind].acquire(f.code);
    const nextEpoch = await redis.hget(keys.control, "epoch");
    expect(nextEpoch).not.toBe(epoch);
    resume.release();
    const results = await Promise.all([a, b]);
    expect(results).toEqual([{ kind: "absent" }, { kind: "absent" }]);
    expect(kind === "client" ? f.counts().clientLoads : f.counts().secretLoads).toBe(3);
  });
}

test("each CAS conflict retries complete acquisition once, exhaustion is unavailable", async () => {
  const f = fixture();
  const snapshots = createClientSnapshots({ redis, source: f.source });
  const load = f.source.loadClient;
  f.source.loadClient = async () => {
    const value = await load();
    await snapshots.invalidateClient(f.code);
    return value;
  };
  const error = await failure(() => snapshots.client.acquire(f.code));
  expect(error).toBeInstanceOf(ClientSnapshotUnavailableError);
  expect(f.counts().clientLoads).toBe(2);
  const keys = clientSnapshotKeys(f.code);
  const payload = await redis.get(keys.payloads[0]);
  expect(payload).toBeNull();
});

test("bad payload rebuilds; bad control clears both payloads; Redis failure never falls through to source", async () => {
  const f = fixture();
  const snapshots = createClientSnapshots({ redis, source: f.source });
  await snapshots.client.acquire(f.code);
  await snapshots.credential.acquire(f.code);
  const keys = clientSnapshotKeys(f.code);
  await redis.set(keys.payloads[0], "bad");
  const rebuilt = await snapshots.client.acquire(f.code);
  expect(rebuilt.kind).toBe("present");
  const payload = JSON.parse((await redis.get(keys.payloads[0]))!);
  payload.snapshot.value.clientCode = "different-client";
  await redis.set(keys.payloads[0], JSON.stringify(payload));
  const identityRebuilt = await snapshots.client.acquire(f.code);
  expect(identityRebuilt).toMatchObject({ kind: "present", value: { clientCode: f.code } });
  await redis.unlink(keys.control);
  await redis.set(keys.control, "bad");
  await snapshots.client.acquire(f.code);
  const removed = await redis.exists(keys.payloads[1]);
  expect(removed).toBe(0);
  for (const generation of ["00", "999999999999999999999999"]) {
    await redis.hset(keys.control, "generation", generation);
    await snapshots.invalidateClient(f.code);
    const recovered = await snapshots.client.acquire(f.code);
    expect(recovered.kind).toBe("present");
  }
  const disconnected = redis.duplicate({
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  });
  await disconnected.connect();
  disconnected.disconnect();
  const before = f.counts();
  const unavailable = createClientSnapshots({
    redis: disconnected,
    source: f.source,
  });
  const error = await failure(() => unavailable.client.acquire(f.code));
  expect(error).toBeInstanceOf(ClientSnapshotUnavailableError);
  expect(f.counts()).toEqual(before);
});

test("targeted and full repair preserve non-target data, independent scan-only verifier reports restored inventory", async () => {
  const f = fixture();
  const other = fixture();
  const maintenance = createClientSnapshotMaintenance(redis);
  const verifier = createClientSnapshotVerifier({
    scan: (...args) => redis.scan(...args),
  });
  const empty = await verifier.verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
  expect(empty.matchingKeys).toBe(0);
  const snapshots = createClientSnapshots({ redis, source: f.source });
  const otherSnapshots = createClientSnapshots({ redis, source: other.source });
  await snapshots.client.acquire(f.code);
  await snapshots.credential.acquire(f.code);
  await otherSnapshots.client.acquire(other.code);
  const otherKeys = clientSnapshotKeys(other.code);
  const preserved = await redis.get(otherKeys.payloads[0]);
  await maintenance.repairClient(f.code);
  const afterTarget = await redis.get(otherKeys.payloads[0]);
  expect(afterTarget).toBe(preserved);
  const sentinel = `non-owner:${randomUUID()}`;
  await redis.set(sentinel, "retained");
  const username = `snapshot-verify-${randomUUID()}`;
  const password = randomUUID();
  await redis.acl("SETUSER", username, "on", `>${password}`, "~*", "-@all", "+scan");
  const scanOnly = redis.duplicate({ username, password, lazyConnect: true, enableReadyCheck: false });
  try {
    await scanOnly.connect();
    const restricted = createClientSnapshotVerifier(scanOnly);
    const notEmpty = await restricted.verifyAllAfterRedisRestore({ protocolTrafficStopped: true });
    expect(notEmpty.matchingKeys).toBeGreaterThan(0);
    let unlinked = false;
    const interrupted = createClientSnapshotMaintenance({
      eval: (...args) => redis.eval(...args),
      scan: (...args) => redis.scan(...args),
      async unlink(...keys) {
        if (unlinked)
          throw new Error("interrupted repair");
        unlinked = true;
        return redis.unlink(...keys);
      },
    });
    const failedRepair = await failure(() =>
      interrupted.repairAllAfterRedisRestore({ protocolTrafficStopped: true }),
    );
    expect(failedRepair).toBeInstanceOf(Error);
    await maintenance.repairAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });
    const report = await restricted.verifyAllAfterRedisRestore({
      protocolTrafficStopped: true,
    });
    expect(report.matchingKeys).toBe(0);
    const retained = await redis.get(sentinel);
    expect(retained).toBe("retained");
    const recovered = await snapshots.client.acquire(f.code);
    expect(recovered.kind).toBe("present");
  }
  finally {
    scanOnly.disconnect();
    await redis.acl("DELUSER", username);
    await redis.unlink(sentinel);
  }
});

test("warm acquisition uses one real socket request/response exchange; cold uses two and one source load", async () => {
  const f = fixture();
  const target = new URL(process.env.IAM_API_CORE_TEST_REDIS_URL!);
  const upstreamAddress = { host: target.hostname, port: Number(target.port) };
  let requests = 0;
  let responses = 0;
  const server = createServer((downstream) => {
    const upstream = connect(upstreamAddress);
    downstream.on("data", () => {
      requests++;
    });
    upstream.on("data", () => {
      responses++;
    });
    downstream.on("data", data => upstream.write(data));
    upstream.on("data", data => downstream.write(data));
    upstream.on("end", () => downstream.end());
    downstream.on("end", () => upstream.end());
    downstream.on("close", () => upstream.destroy());
    upstream.on("error", () => downstream.destroy());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing proxy address");
  target.hostname = "127.0.0.1";
  target.port = String(address.port);
  const connection = new Redis(target.toString(), {
    lazyConnect: true,
    retryStrategy: () => null,
  });
  try {
    await connection.connect();

    await connection.ping();
    const snapshots = createClientSnapshots({
      redis: connection,
      source: f.source,
    });
    requests = responses = 0;
    await snapshots.client.acquire(f.code);
    const cold = { requests, responses, sourceLoads: f.counts().clientLoads };
    expect(cold).toEqual({ requests: 2, responses: 2, sourceLoads: 1 });
    requests = responses = 0;
    await snapshots.client.acquire(f.code);
    const warm = {
      requests,
      responses,
      sourceLoads: f.counts().clientLoads - cold.sourceLoads,
    };
    expect(warm).toEqual({ requests: 1, responses: 1, sourceLoads: 0 });
    process.stdout.write(`Client Snapshot socket sample ${JSON.stringify({ cold, warm })}\n`);
  }
  finally {
    await connection.quit();
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
});
