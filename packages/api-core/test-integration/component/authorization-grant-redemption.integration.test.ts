import { describe, expect, test } from "bun:test";
import {
  createAuthorizationGrantRedemption,
} from "../../src/authorization-grant/authorization-grant-redemption";
import {
  createInMemoryAuthorizationGrantRedemptionStore,
  createManualAuthorizationGrantRedemptionScheduler,
} from "../../src/authorization-grant/testing";

describe("AuthorizationGrantRedemption", () => {
  test("schedules lease heartbeats through the injected scheduler", async () => {
    let scheduledDelayMs: number | undefined;
    let resolveDelay = () => {};
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 90,
      random: {
        uuid: () => "00000000-0000-4000-8000-000000000001",
      },
      scheduler: {
        delay(delayMs) {
          scheduledDelayMs = delayMs;
          const promise = new Promise<void>((resolve) => {
            resolveDelay = resolve;
          });
          return {
            promise,
            cancel: resolveDelay,
          };
        },
      },
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => 1_000 },
      }),
    });
    await redemption.initialize({ expiresAt: 2_000, grantId: "grant-0" });
    const attempt = await redemption.begin("grant-0");
    if (attempt.status !== "reserved")
      throw new Error("expected the attempt to reserve the grant");

    await expect(redemption.withLease(
      attempt.reservation,
      async lease => await lease.consume(),
    )).resolves.toBe("consumed");

    expect(scheduledDelayMs).toBe(30);
  });

  test("gives one concurrent attempt the lease and reports the other as busy", async () => {
    const attempts = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ];
    const store = createInMemoryAuthorizationGrantRedemptionStore({
      clock: { now: () => 1_000 },
    });
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: { uuid: () => attempts.shift()! },
      store,
    });
    await redemption.initialize({
      expiresAt: 60_000,
      grantId: "grant-1",
    });

    const results = await Promise.all([
      redemption.begin("grant-1"),
      redemption.begin("grant-1"),
    ]);

    expect(results).toEqual([
      {
        status: "reserved",
        reservation: {
          attemptId: "10000000-0000-4000-8000-000000000001",
          expiresAt: 60_000,
          grantId: "grant-1",
          leaseExpiresAt: 6_000,
        },
      },
      {
        status: "busy",
        leaseExpiresAt: 6_000,
      },
    ]);
  });

  test("releases the same attempt without extending the original grant expiry", async () => {
    let now = 1_000;
    const attempts = [
      "20000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000002",
    ];
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: { uuid: () => attempts.shift()! },
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => now },
      }),
    });
    await redemption.initialize({ expiresAt: 7_000, grantId: "grant-2" });
    const first = await redemption.begin("grant-2");
    if (first.status !== "reserved")
      throw new Error("expected the first attempt to reserve the grant");

    now = 2_000;
    await expect(redemption.release(first.reservation)).resolves.toBe("released");
    now = 3_000;
    await expect(redemption.begin("grant-2")).resolves.toEqual({
      status: "reserved",
      reservation: {
        attemptId: "20000000-0000-4000-8000-000000000002",
        expiresAt: 7_000,
        grantId: "grant-2",
        leaseExpiresAt: 7_000,
      },
    });
  });

  test("consumes only the reserved attempt and never grants another lease", async () => {
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: {
        uuid: () => "30000000-0000-4000-8000-000000000001",
      },
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => 1_000 },
      }),
    });
    await redemption.initialize({ expiresAt: 60_000, grantId: "grant-3" });
    const attempt = await redemption.begin("grant-3");
    if (attempt.status !== "reserved")
      throw new Error("expected the attempt to reserve the grant");

    await expect(redemption.consume(attempt.reservation)).resolves.toBe("consumed");
    await expect(redemption.begin("grant-3")).resolves.toEqual({
      status: "consumed",
    });
  });

  test("rejects an expired lease and fences it after a new attempt takes over", async () => {
    let now = 1_000;
    const attempts = [
      "40000000-0000-4000-8000-000000000001",
      "40000000-0000-4000-8000-000000000002",
    ];
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: { uuid: () => attempts.shift()! },
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => now },
      }),
    });
    await redemption.initialize({ expiresAt: 7_000, grantId: "grant-4" });
    const first = await redemption.begin("grant-4");
    if (first.status !== "reserved")
      throw new Error("expected the first attempt to reserve the grant");

    now = 6_000;
    await expect(redemption.consume(first.reservation)).resolves.toBe("lease-expired");
    const second = await redemption.begin("grant-4");
    if (second.status !== "reserved")
      throw new Error("expected a new attempt after the lease expired");
    await expect(redemption.consume(first.reservation)).resolves.toBe("stale-attempt");

    now = 7_000;
    await expect(redemption.consume(second.reservation)).resolves.toBe("expired");
  });

  test("renews only the current attempt without extending the grant expiry", async () => {
    let now = 1_000;
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 5_000,
      random: {
        uuid: () => "50000000-0000-4000-8000-000000000001",
      },
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => now },
      }),
    });
    await redemption.initialize({ expiresAt: 12_000, grantId: "grant-5" });
    const attempt = await redemption.begin("grant-5");
    if (attempt.status !== "reserved")
      throw new Error("expected the attempt to reserve the grant");

    now = 4_000;
    const renewed = await redemption.renew(attempt.reservation);
    expect(renewed).toEqual({
      status: "renewed",
      reservation: {
        ...attempt.reservation,
        expiresAt: 12_000,
        leaseExpiresAt: 9_000,
      },
    });
    if (renewed.status !== "renewed")
      throw new Error("expected the current attempt to renew");

    now = 7_000;
    await expect(redemption.consume(attempt.reservation)).resolves.toBe("stale-attempt");
    await expect(redemption.consume(renewed.reservation)).resolves.toBe("consumed");
  });

  test("maintains the lease across an operation longer than one lease window", async () => {
    let now = 1_000;
    let finishOperation = () => {};
    const operationCanFinish = new Promise<void>((resolve) => {
      finishOperation = resolve;
    });
    const manualScheduler = createManualAuthorizationGrantRedemptionScheduler();
    const redemption = createAuthorizationGrantRedemption({
      leaseDurationMs: 90,
      random: {
        uuid: () => "60000000-0000-4000-8000-000000000001",
      },
      scheduler: manualScheduler.scheduler,
      store: createInMemoryAuthorizationGrantRedemptionStore({
        clock: { now: () => now },
      }),
    });
    await redemption.initialize({
      expiresAt: 2_000,
      grantId: "grant-6",
    });
    const attempt = await redemption.begin("grant-6");
    if (attempt.status !== "reserved")
      throw new Error("expected the attempt to reserve the grant");

    const result = redemption.withLease(attempt.reservation, async (lease) => {
      await operationCanFinish;
      return await lease.consume();
    });

    for (const currentTime of [1_040, 1_080, 1_120]) {
      now = currentTime;
      await expect(manualScheduler.advanceToNextHeartbeat()).resolves.toBe(30);
    }
    finishOperation();

    await expect(result).resolves.toBe("consumed");

    await expect(redemption.begin("grant-6")).resolves.toEqual({
      status: "consumed",
    });
  });
});
