import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

const auditService = {
  recordAuditLog: mock(),
};

mock.module("@admin-api/services/audit/audit.service", () => auditService);

const clientAudit = await import("../events/client.audit");
const employmentAudit = await import("../events/employment.audit");
const userAudit = await import("../events/user.audit");

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  auditService.recordAuditLog.mockReset();
});

describe("admin audit event helpers", () => {
  test("records user mutation with masked target mobile and patch mobile", async () => {
    await userAudit.recordAdminUserAudit(
      "admin.user.update",
      { id: 1001, username: "zhangsan", name: "张三", mobile: "17721462865" },
      { patch: { mobile: "17700001111" } },
      { name: "tx" } as never,
      { actorType: "admin", actorUsername: "admin" },
    );

    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.user.update",
      actorType: "admin",
      actorUsername: "admin",
      targetType: "user",
      targetCode: "zhangsan",
      details: expect.objectContaining({
        targetMobile: "177****2865",
        patch: { mobile: "177****1111" },
      }),
    }), { name: "tx" });
  });

  test("records client mutation without leaking client secret patch values", async () => {
    await clientAudit.recordAdminClientAudit(
      "admin.client.rotate_secret",
      { id: 2001, clientCode: "portal", clientName: "门户", clientSecret: "secret", status: 1 } as never,
      { patch: { clientSecretRotated: true } },
    );

    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.rotate_secret",
      targetType: "client",
      targetCode: "portal",
      details: expect.objectContaining({
        clientCode: "portal",
        patch: { clientSecretRotated: true },
      }),
    }), undefined);
  });

  test("records employment resignation as a user target", async () => {
    await employmentAudit.recordEmploymentResignUserAudit(
      { id: 1001, username: "zhangsan", name: "张三" },
      undefined,
      { actorType: "system", actorSystemKey: "admin-api" },
    );

    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.employment.resign_user",
      targetType: "user",
      targetId: 1001,
      targetCode: "zhangsan",
      details: {
        username: "zhangsan",
        resigned: true,
      },
    }), undefined);
  });
});
