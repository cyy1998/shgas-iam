import { describe, expect, mock, test } from "bun:test";
import {
  runUserDocumentPostgresGateCommand,
  runUserDocumentRedisGateCommand,
  userDocumentGateExitCode,
} from "@ops/commands/user-document/user-document-readiness";

describe("User Document readiness command", () => {
  test("runs fixed-version PostgreSQL and Redis gates without a caller version", async () => {
    const postgresReport = gateReport("postgres", "failed");
    const redisReport = gateReport("redis-access", "passed");
    const verifyPostgres = mock(async (_input: { batchSize: number }) => postgresReport);
    const verifyRedis = mock(async (_input: { batchSize: number }) => redisReport);
    const info = mock(() => {});

    const actualPostgresReport = await runUserDocumentPostgresGateCommand(
      {
        verifier: { verify: verifyPostgres },
        logger: { info },
      },
      { batchSize: 100 },
    );
    const actualRedisReport = await runUserDocumentRedisGateCommand(
      {
        verifier: { verify: verifyRedis },
        logger: { info },
      },
      { batchSize: 100 },
    );

    expect(actualPostgresReport).toEqual(postgresReport);
    expect(actualRedisReport).toEqual(redisReport);
    expect(verifyPostgres).toHaveBeenCalledWith({ batchSize: 100 });
    expect(verifyRedis).toHaveBeenCalledWith({ batchSize: 100 });
    expect(info).toHaveBeenCalledWith(postgresReport, "User Document PostgreSQL gate completed");
    expect(info).toHaveBeenCalledWith(redisReport, "User Document Redis and Subject Access gate completed");
    expect(userDocumentGateExitCode(postgresReport)).toBe(1);
    expect(userDocumentGateExitCode(redisReport)).toBe(0);
  });
});

function gateReport(gate: "postgres" | "redis-access", status: "failed" | "passed") {
  return {
    version: 4,
    gate,
    verifiedAt: "2026-08-22T04:00:00.000Z",
    status,
    counts: { users: 3, verifiedUsers: 3 },
    failures: status === "failed" ? [{ code: "document-version-mismatch", count: 1, samples: ["user:2"] }] : [],
  } as const;
}
