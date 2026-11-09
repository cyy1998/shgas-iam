import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createOfflineMaintenanceRedis, runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { redisUrlString } from "@iam/runtime/redis/config";
import Redis from "ioredis";

function configuration() {
  const value = process.env.IAM_RUNTIME_TEST_REDIS_URL;
  if (!value) throw new Error("Root-managed Redis test resource is required");
  return redisUrlString().parse(value);
}

async function waitForClosed(observer: Redis, ids: string[]) {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const clients = String(await observer.call("CLIENT", "LIST"));
    const active = clients.split("\n").map((line) => line.match(/^id=(\d+) /)?.[1]);
    if (ids.every((id) => !active.includes(id))) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Owned maintenance Redis connections remained open");
}

test("aborting one offline owner releases its connection while a parallel invocation remains usable", async () => {
  const config = configuration();
  const observer = new Redis(config);
  const firstSignal = new AbortController();
  const first = createOfflineMaintenanceRedis(config, firstSignal.signal);
  const peer = createOfflineMaintenanceRedis(config, new AbortController().signal);
  try {
    await first.connect();
    await peer.connect();
    const firstId = String(await first.redis.call("CLIENT", "ID"));
    const peerId = String(await peer.redis.call("CLIENT", "ID"));
    expect(firstId).not.toBe(peerId);
    firstSignal.abort();
    await waitForClosed(observer, [firstId]);
    const ping = await peer.redis.ping();
    expect(ping).toBe("PONG");
    first.close();
    peer.close();
    await waitForClosed(observer, [firstId, peerId]);
  } finally {
    first.close();
    peer.close();
    await observer.quit();
  }
});

test("a maintenance deadline interrupts its blocked Redis call and closes its own socket before returning failure", async () => {
  const config = configuration();
  const observer = new Redis(config);
  let owner: ReturnType<typeof createOfflineMaintenanceRedis> | undefined;
  let clientId: string | undefined;
  let failure: unknown;
  try {
    try {
      await runMaintenanceCommandWithLifecycle({
        deadlineMs: 100,
        shutdown: async () => {
          owner?.close();
        },
        run: async (signal) => {
          owner = createOfflineMaintenanceRedis(config, signal);
          await owner.connect();
          clientId = String(await owner.redis.call("CLIENT", "ID"));
          await owner.redis.blpop(`iam:test:maintenance:${randomUUID()}`, 0);
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!clientId) throw new Error("Expected an owned connection before the deadline");
    await waitForClosed(observer, [clientId]);
    const ping = await observer.ping();
    expect(ping).toBe("PONG");
  } finally {
    owner?.close();
    await observer.quit();
  }
});

test("an initialization failure is reported and leaves no retrying offline connection", async () => {
  const config = configuration();
  const owner = createOfflineMaintenanceRedis(
    { ...config, username: `invalid-${randomUUID()}`, password: "invalid" },
    new AbortController().signal,
  );
  let failure: unknown;
  try {
    try {
      await owner.connect();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
  } finally {
    owner.close();
  }
  expect(owner.redis.status).toBe("end");
});
