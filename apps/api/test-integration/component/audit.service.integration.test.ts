import { createApiAuditLogWriter } from "@api/services/audit/audit.service";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const insertedValues: unknown[] = [];
const createAuditLog = mock(async (value: unknown) => {
  insertedValues.push(value);
});

const auditWriter = createApiAuditLogWriter({
  auditRepository: { createAuditLog },
});

beforeEach(() => {
  insertedValues.length = 0;
  createAuditLog.mockClear();
});

describe("api audit writer", () => {
  test("writes redacted audit logs with iam source app", async () => {
    await auditWriter.recordAuditLog({
      action: "auth.password.reset",
      outcome: "success",
      actorType: "anonymous",
      targetType: "user",
      targetCode: "13800000000",
      details: {
        password: "plain",
        errorCode: "IGNORED",
        nested: { verificationCode: "123456" },
      },
    });

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      action: "auth.password.reset",
      outcome: "success",
      actorType: "anonymous",
      sourceApp: "iam",
      targetType: "user",
      targetCode: "13800000000",
      details: {
        password: "[REDACTED]",
        errorCode: "IGNORED",
        nested: { verificationCode: "[REDACTED]" },
      },
    });
  });

  test("rejects invalid client actors before writing", async () => {
    await expect(auditWriter.recordAuditLog({
      action: "internal.delegation.create",
      outcome: "success",
      actorType: "client",
      targetType: "delegation",
      targetId: 1,
    })).rejects.toThrow("client actor requires actorClientCode");

    expect(createAuditLog).not.toHaveBeenCalled();
  });
});
