import {
  profileV2GateExitCode,
  runProfileV2BackfillCommand,
  runProfileV2PostgresGateCommand,
  runProfileV2RedisAccessGateCommand,
} from "@worker/commands/profile-v2-maintenance";
import { closeProfileV2MaintenanceResources } from "@worker/composition/profile-v2-maintenance-shutdown";
import { describe, expect, mock, test } from "bun:test";

describe("Profile V2 maintenance command", () => {
  test("advances only the cursor returned by a completely safe batch", async () => {
    const backfillBatch = mock(async ({ afterUserId }: { afterUserId: number }) =>
      afterUserId === 7
        ? {
            version: 2 as const,
            nextAfterUserId: 9,
            complete: false,
            scanned: 2,
            rebuilt: 2,
            reused: 0,
            facts: { published: 2, retainedNewer: 0 },
            barriers: { seeded: 1, retainedExisting: 1 },
          }
        : {
            version: 2 as const,
            nextAfterUserId: 10,
            complete: true,
            scanned: 1,
            rebuilt: 0,
            reused: 1,
            facts: { published: 0, retainedNewer: 1 },
            barriers: { seeded: 0, retainedExisting: 1 },
          });
    const info = mock(() => {});
    const error = mock(() => {});

    const report = await runProfileV2BackfillCommand({
      backfill: { backfillBatch },
      logger: { info, error },
    }, {
      afterUserId: 7,
      batchSize: 2,
    });

    expect(backfillBatch).toHaveBeenNthCalledWith(1, {
      version: 2,
      afterUserId: 7,
      batchSize: 2,
    });
    expect(backfillBatch).toHaveBeenNthCalledWith(2, {
      version: 2,
      afterUserId: 9,
      batchSize: 2,
    });
    expect(report).toEqual({
      version: 2,
      startAfterUserId: 7,
      nextAfterUserId: 10,
      batches: 2,
      scanned: 3,
      rebuilt: 2,
      reused: 1,
    });
    expect(error).not.toHaveBeenCalled();
  });

  test("logs only the last safe cursor when a batch fails", async () => {
    const unsafe = new Error("profile payload must not be logged");
    const info = mock(() => {});
    const error = mock(() => {});

    const run = runProfileV2BackfillCommand({
      backfill: { backfillBatch: mock(async () => { throw unsafe; }) },
      logger: { info, error },
    }, {
      afterUserId: 42,
      batchSize: 50,
    });

    await expect(run).rejects.toBe(unsafe);
    expect(error).toHaveBeenCalledWith({
      version: 2,
      batch: 1,
      safeAfterUserId: 42,
    }, "Profile V2 backfill batch failed");
    expect(JSON.stringify(error.mock.calls)).not.toContain("profile payload");
  });

  test("returns independent read-only PostgreSQL and Redis gate reports", async () => {
    const postgresReport = gateReport("postgres", "failed");
    const redisReport = gateReport("redis-access", "passed");
    const info = mock(() => {});

    await expect(runProfileV2PostgresGateCommand({
      verifier: { verify: mock(async () => postgresReport) },
      logger: { info },
    }, { batchSize: 100 })).resolves.toEqual(postgresReport);
    await expect(runProfileV2RedisAccessGateCommand({
      verifier: { verify: mock(async () => redisReport) },
      logger: { info },
    }, { batchSize: 100 })).resolves.toEqual(redisReport);

    expect(info).toHaveBeenCalledWith(postgresReport, "Profile V2 PostgreSQL gate completed");
    expect(info).toHaveBeenCalledWith(redisReport, "Profile V2 Redis and Subject Access gate completed");
    expect(profileV2GateExitCode(postgresReport)).toBe(1);
    expect(profileV2GateExitCode(redisReport)).toBe(0);
  });

  test("fails when any owned resource cannot shut down", async () => {
    const redisFailure = new Error("redis close failed");
    const databaseFailure = new Error("database close failed");

    await expect(closeProfileV2MaintenanceResources([
      Promise.reject(redisFailure),
      Promise.resolve(),
      Promise.reject(databaseFailure),
    ])).rejects.toMatchObject({
      name: "AggregateError",
      errors: [redisFailure, databaseFailure],
    });
  });
});

function gateReport(
  gate: "postgres" | "redis-access",
  status: "failed" | "passed",
) {
  return {
    version: 2 as const,
    gate,
    verifiedAt: "2026-08-21T04:00:00.000Z",
    status,
    counts: { users: 3, verifiedUsers: 3 },
    failures: status === "failed"
      ? [{ code: "profile-version-mismatch", count: 1, samples: ["user:2"] }]
      : [],
  };
}
