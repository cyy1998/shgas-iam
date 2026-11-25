import { afterAll, beforeAll, expect, test } from "bun:test";
import { createAuditLogWriter, createAuditRepository } from "@iam/db/audit";
import { auditLogs } from "@iam/db/schema";
import { eq } from "drizzle-orm";
import { createMigratedPostgresTestHarness } from "../support/migrated-postgres-harness";

let postgres: Awaited<ReturnType<typeof createMigratedPostgresTestHarness>>;

beforeAll(async () => {
  postgres = await createMigratedPostgresTestHarness();
});

afterAll(async () => {
  await postgres?.close();
});

test("persists a normalized, redacted audit event from a transaction", async () => {
  const requestId = "audit-record-test";
  const eventTime = new Date("2026-11-01T12:00:00Z");
  await postgres.db.transaction(async (tx) => {
    const writer = createAuditLogWriter({ auditRepository: createAuditRepository(tx), sourceApp: "sso-api" });
    await writer.recordAuditLog({
      action: "auth.login.local",
      outcome: "success",
      actorType: "user",
      actorUserId: 17,
      actorUsername: "alice",
      actorClientCode: "unused",
      targetType: "user",
      targetId: 17,
      targetName: "Alice",
      requestId,
      traceId: "trace-17",
      route: "/sso/callback",
      method: "GET",
      details: { nested: { token: "secret", result: "accepted" } },
      eventTime,
    });
  });

  const rows = await postgres.db.select().from(auditLogs).where(eq(auditLogs.requestId, requestId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    action: "auth.login.local",
    outcome: "success",
    actorType: "user",
    actorUserId: 17,
    actorUsername: "alice",
    actorClientCode: null,
    targetType: "user",
    targetId: 17,
    sourceApp: "sso-api",
    requestId,
    traceId: "trace-17",
    route: "/sso/callback",
    method: "GET",
    eventTime,
    details: { actorName: "Alice", targetName: "Alice", nested: { token: "[REDACTED]", result: "accepted" } },
  });
});

test("rolls back the audit event when the owning transaction fails", async () => {
  const requestId = "audit-rollback-test";
  const failure = new Error("abort caller transaction");
  const error = await postgres.db
    .transaction(async (tx) => {
      const writer = createAuditLogWriter({ auditRepository: createAuditRepository(tx), sourceApp: "integration-api" });
      await writer.recordAuditLog({
        action: "internal.delegation.create",
        outcome: "success",
        actorType: "client",
        actorClientCode: "directory-client",
        targetType: "delegation",
        requestId,
      });
      throw failure;
    })
    .catch((cause: unknown) => cause);

  const rows = await postgres.db.select().from(auditLogs).where(eq(auditLogs.requestId, requestId));
  expect(error).toBe(failure);
  expect(rows).toEqual([]);
});
