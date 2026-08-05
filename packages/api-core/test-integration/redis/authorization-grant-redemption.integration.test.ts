import type {
  AuthorizationGrantRedisTestScope,
  RedisTestHarness,
} from "./redis-test-harness";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { createRedisTestHarness } from "./redis-test-harness";

const writerAttemptIds = [
  "50000000-0000-4000-8000-000000000001",
  "50000000-0000-4000-8000-000000000002",
  "50000000-0000-4000-8000-000000000003",
];
const observerAttemptIds = [
  "60000000-0000-4000-8000-000000000001",
  "60000000-0000-4000-8000-000000000002",
  "60000000-0000-4000-8000-000000000003",
];

let harness: RedisTestHarness | undefined;
let scope: AuthorizationGrantRedisTestScope | undefined;

beforeAll(async () => {
  harness = await createRedisTestHarness();
});

beforeEach(async () => {
  scope = await harness!.createAuthorizationGrantScope({
    leaseDurationMs: 200,
    observerAttemptIds,
    writerAttemptIds,
  });
});

afterEach(async () => {
  await scope?.close();
  scope = undefined;
});

afterAll(async () => {
  await harness?.close();
  harness = undefined;
});

describe("Authorization Grant redemption real Redis contract", () => {
  test("linearizes concurrent reservation and one-time consumption across clients", async () => {
    await scope!.writer.initialize({
      expiresAt: Date.now() + 30_000,
      grantId: "redis-grant-1",
    });

    const results = await Promise.all([
      scope!.writer.begin("redis-grant-1"),
      scope!.observer.begin("redis-grant-1"),
    ]);
    const winner = results.find(result => result.status === "reserved");
    const loser = results.find(result => result.status === "busy");
    expect(winner?.status).toBe("reserved");
    expect(loser?.status).toBe("busy");
    if (winner?.status !== "reserved")
      throw new Error("expected one reservation winner");

    const consumption = await scope!.writer.consume(winner.reservation);
    expect(consumption).toBe("consumed");
    const replay = await scope!.observer.begin("redis-grant-1");
    expect(replay).toEqual({
      status: "consumed",
    });
  });

  test("uses Redis time to fence an expired lease before a new attempt takes over", async () => {
    await scope!.writer.initialize({
      expiresAt: Date.now() + 30_000,
      grantId: "redis-grant-2",
    });
    const first = await scope!.writer.begin("redis-grant-2");
    if (first.status !== "reserved")
      throw new Error("expected the first Redis reservation");

    await Bun.sleep(250);
    const expiredConsumption = await scope!.writer.consume(first.reservation);
    expect(expiredConsumption).toBe("lease-expired");
    const second = await scope!.observer.begin("redis-grant-2");
    if (second.status !== "reserved")
      throw new Error("expected a takeover after the Redis lease expired");
    const staleConsumption = await scope!.writer.consume(first.reservation);
    expect(staleConsumption).toBe("stale-attempt");
    const takeoverConsumption = await scope!.observer.consume(second.reservation);
    expect(takeoverConsumption).toBe("consumed");
  });

  test("releases a retryable attempt to the issued state", async () => {
    await scope!.writer.initialize({
      expiresAt: Date.now() + 30_000,
      grantId: "redis-grant-3",
    });
    const first = await scope!.writer.begin("redis-grant-3");
    if (first.status !== "reserved")
      throw new Error("expected the first Redis reservation");

    const release = await scope!.writer.release(first.reservation);
    expect(release).toBe("released");
    const retry = await scope!.observer.begin("redis-grant-3");
    expect(retry).toMatchObject({
      status: "reserved",
      reservation: {
        expiresAt: first.reservation.expiresAt,
        grantId: "redis-grant-3",
      },
    });
  });

  test("renews the winning attempt beyond its original Redis-time lease", async () => {
    await scope!.writer.initialize({
      expiresAt: Date.now() + 30_000,
      grantId: "redis-grant-4",
    });
    const first = await scope!.writer.begin("redis-grant-4");
    if (first.status !== "reserved")
      throw new Error("expected the first Redis reservation");

    await Bun.sleep(120);
    const renewed = await scope!.writer.renew(first.reservation);
    if (renewed.status !== "renewed")
      throw new Error("expected the Redis lease renewal");
    expect(renewed.reservation.leaseExpiresAt).toBeGreaterThan(
      first.reservation.leaseExpiresAt,
    );

    await Bun.sleep(120);
    const originalConsumption = await scope!.writer.consume(first.reservation);
    expect(originalConsumption).toBe("stale-attempt");
    const renewedConsumption = await scope!.writer.consume(renewed.reservation);
    expect(renewedConsumption).toBe("consumed");
  });
});
