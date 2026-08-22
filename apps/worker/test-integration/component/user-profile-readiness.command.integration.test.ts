import {
  runUserProfilePostgresGateCommand,
  runUserProfileRedisGateCommand,
  userProfileGateExitCode,
} from "@worker/commands/user-profile-readiness";
import { describe, expect, mock, test } from "bun:test";

describe("User Profile readiness command", () => {
  test("runs fixed-version PostgreSQL and Redis gates without a caller version", async () => {
    const postgresReport = gateReport("postgres", "failed");
    const redisReport = gateReport("redis-access", "passed");
    const verifyPostgres = mock(async (_input: { batchSize: number }) => postgresReport);
    const verifyRedis = mock(async (_input: { batchSize: number }) => redisReport);
    const info = mock(() => {});

    const actualPostgresReport = await runUserProfilePostgresGateCommand({
      verifier: { verify: verifyPostgres },
      logger: { info },
    }, { batchSize: 100 });
    const actualRedisReport = await runUserProfileRedisGateCommand({
      verifier: { verify: verifyRedis },
      logger: { info },
    }, { batchSize: 100 });

    expect(actualPostgresReport).toEqual(postgresReport);
    expect(actualRedisReport).toEqual(redisReport);
    expect(verifyPostgres).toHaveBeenCalledWith({ batchSize: 100 });
    expect(verifyRedis).toHaveBeenCalledWith({ batchSize: 100 });
    expect(info).toHaveBeenCalledWith(postgresReport, "User Profile PostgreSQL gate completed");
    expect(info).toHaveBeenCalledWith(
      redisReport,
      "User Profile Redis and Subject Access gate completed",
    );
    expect(userProfileGateExitCode(postgresReport)).toBe(1);
    expect(userProfileGateExitCode(redisReport)).toBe(0);
  });
});

function gateReport(
  gate: "postgres" | "redis-access",
  status: "failed" | "passed",
) {
  return {
    version: 3,
    gate,
    verifiedAt: "2026-08-22T04:00:00.000Z",
    status,
    counts: { users: 3, verifiedUsers: 3 },
    failures: status === "failed"
      ? [{ code: "profile-version-mismatch", count: 1, samples: ["user:2"] }]
      : [],
  } as const;
}
