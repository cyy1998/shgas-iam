import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import { createAdminAuditService, normalizeAuditLogQueryActions } from "@admin-api/services/audit/audit.service";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const insertedValues: unknown[] = [];
let selectedRows: unknown[] = [];
const createAuditLog = mock(async (value: unknown) => {
  insertedValues.push(value);
});
const searchAuditLogsPaged = mock(async () => ({
  rows: selectedRows,
  total: selectedRows.length,
}));

const auditService = createAdminAuditService({
  auditRepository: {
    createAuditLog,
    searchAuditLogsPaged: searchAuditLogsPaged as any,
  },
});

beforeEach(() => {
  insertedValues.length = 0;
  selectedRows = [];
  createAuditLog.mockClear();
  searchAuditLogsPaged.mockClear();
});

function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    eventTime: new Date("2026-01-01T00:00:00.000Z"),
    action: "admin.user.update",
    outcome: "success",
    actorType: "admin",
    actorUserId: 1,
    actorUsername: "admin",
    actorClientCode: null,
    actorSystemKey: null,
    targetType: "user",
    targetId: 1001,
    targetCode: "zhangsan",
    sourceApp: "iam-admin",
    requestId: "req-1",
    traceId: null,
    ip: null,
    userAgent: null,
    route: null,
    method: null,
    details: {},
    ...overrides,
  };
}

describe("admin audit writer", () => {
  test("writes redacted audit logs with iam-admin source app", async () => {
    await auditService.recordAuditLog({
      action: "admin.client.rotate_secret",
      outcome: "success",
      actorType: "admin",
      actorUserId: 1,
      actorUsername: "admin",
      targetType: "client",
      targetCode: "portal",
      details: {
        clientSecret: "secret",
        secretRotated: true,
      },
    });

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      action: "admin.client.rotate_secret",
      outcome: "success",
      actorType: "admin",
      actorUserId: 1,
      actorUsername: "admin",
      actorClientCode: null,
      actorSystemKey: null,
      sourceApp: "iam-admin",
      details: {
        clientSecret: "[REDACTED]",
        secretRotated: true,
      },
    });
  });
});

describe("admin auditService.searchAuditLogsForAdmin", () => {
  test("expands canonical login action queries to canonical and legacy actions", () => {
    expect(normalizeAuditLogQueryActions({
      conditions: { action: "auth.login.password" },
      pageNum: 1,
      pageSize: 10,
    })).toMatchObject({
      conditions: {
        actions: [
          "auth.login.password",
          "auth.login.password.success",
          "auth.login.password.failure",
        ],
      },
    });
  });

  test("deduplicates multiple action queries while keeping non-login actions exact", () => {
    expect(normalizeAuditLogQueryActions({
      conditions: {
        actions: [
          "auth.login.password",
          "auth.login.password.failure",
          "admin.user.update",
        ],
      },
      pageNum: 1,
      pageSize: 10,
    })).toMatchObject({
      conditions: {
        actions: [
          "auth.login.password",
          "auth.login.password.success",
          "auth.login.password.failure",
          "admin.user.update",
        ],
      },
    });
  });

  test("returns target user audit records", async () => {
    selectedRows = [auditRow()];

    await expect(auditService.searchAuditLogsForAdmin({
      conditions: { targetType: "user", targetId: 1001 },
      pageNum: 1,
      pageSize: 10,
    })).resolves.toMatchObject({
      result: [{ targetType: "user", targetId: 1001 }],
      total: 1,
      pages: 1,
    });
  });

  test("returns target employment audit records", async () => {
    selectedRows = [auditRow({
      action: "admin.employment.transfer",
      targetType: "employment",
      targetId: 4001,
      targetCode: null,
    })];

    await expect(auditService.searchAuditLogsForAdmin({
      conditions: { targetType: "employment", targetId: 4001 },
      pageNum: 1,
      pageSize: 10,
    })).resolves.toMatchObject({
      result: [{ targetType: "employment", targetId: 4001 }],
      total: 1,
      pages: 1,
    });
  });

  test("accepts and forwards traceId exact filters", async () => {
    const traceId = "11111111111111111111111111111111";
    const query = AuditLogPaginationQueryDtoSchema.parse({
      conditions: { traceId },
      pageNum: 1,
      pageSize: 10,
    });
    selectedRows = [auditRow({ traceId })];

    await expect(auditService.searchAuditLogsForAdmin(query)).resolves.toMatchObject({
      result: [{ traceId }],
      total: 1,
      pages: 1,
    });

    expect(searchAuditLogsPaged).toHaveBeenCalledWith(expect.objectContaining({
      conditions: expect.objectContaining({ traceId }),
    }));
  });
});
