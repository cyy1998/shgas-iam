import { beforeEach, describe, expect, mock, test } from "bun:test";

const insertedValues: unknown[] = [];
const values = mock(async (value: unknown) => {
  insertedValues.push(value);
});
const insert = mock(() => ({ values }));

mock.module("@iam/db", () => ({
  default: { insert },
}));

const auditService = await import("../audit.service");

beforeEach(() => {
  insertedValues.length = 0;
  insert.mockClear();
  values.mockClear();
});

describe("api auditService.recordAuditLog", () => {
  test("writes redacted audit logs with api source app", async () => {
    await auditService.recordAuditLog({
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
      sourceApp: "api",
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
    await expect(auditService.recordAuditLog({
      action: "internal.delegation.create",
      outcome: "success",
      actorType: "client",
      targetType: "delegation",
      targetId: 1,
    })).rejects.toThrow("client actor requires actorClientCode");

    expect(values).not.toHaveBeenCalled();
  });
});
