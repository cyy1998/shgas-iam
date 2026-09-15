import { AuditLogPaginationQueryDtoSchema } from "@admin-api/services/audit/audit.schema";
import { createAdminAuditService } from "@admin-api/services/audit/audit.service";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const insertedValues: unknown[] = [];
let selectedRows: unknown[] = [];
let selectedTotal: number | undefined;
const createAuditLog = mock(async (value: unknown) => {
  insertedValues.push(value);
});
const searchAuditLogsPaged = mock(async () => ({
  rows: selectedRows,
  total: selectedTotal ?? selectedRows.length,
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
  selectedTotal = undefined;
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
  test("merges and deduplicates exact single and multiple action filters", async () => {
    await auditService.searchAuditLogsForAdmin(AuditLogPaginationQueryDtoSchema.parse({
      conditions: {
        action: "auth.login.password",
        actions: ["auth.login.password", "auth.login.password.failure", "external.import.success"],
        outcome: "failure",
      },
      pageNum: 2,
      pageSize: 10,
    }));
    expect(searchAuditLogsPaged).toHaveBeenCalledWith({
      conditions: {
        actions: ["auth.login.password", "auth.login.password.failure", "external.import.success"],
        outcome: "failure",
      },
      pageNum: 2,
      pageSize: 10,
    });
  });
  test.each([
    { targetType: "user", targetId: 1001 },
    { targetType: "employment", targetId: 4001 },
  ])("forwards target filter %j to the repository", async (conditions) => {
    const query = { conditions, pageNum: 2, pageSize: 10 };
    await auditService.searchAuditLogsForAdmin(query);
    expect(searchAuditLogsPaged).toHaveBeenCalledWith(query);
  });

  test("maps returned rows and derives pages from the total rather than page length", async () => {
    selectedRows = [auditRow()];
    selectedTotal = 21;
    const result = await auditService.searchAuditLogsForAdmin({ conditions: {}, pageNum: 3, pageSize: 10 });
    expect(result).toMatchObject({
      result: [{ targetType: "user", targetId: 1001 }],
      total: 21,
      pageNum: 3,
      pageSize: 10,
      pages: 3,
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
