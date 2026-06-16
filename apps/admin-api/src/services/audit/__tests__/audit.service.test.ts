import { beforeEach, describe, expect, mock, test } from "bun:test";

const insertedValues: unknown[] = [];
const values = mock(async (value: unknown) => {
  insertedValues.push(value);
});
const insert = mock(() => ({ values }));
let selectedRows: unknown[] = [];
const select = mock((projection?: unknown) => {
  if (projection !== undefined) {
    return {
      from: mock(() => ({
        where: mock(async () => [{ value: selectedRows.length }]),
      })),
    };
  }
  return {
    from: mock(() => ({
      where: mock(() => ({
        orderBy: mock(() => ({
          limit: mock(() => ({
            offset: mock(async () => selectedRows),
          })),
        })),
      })),
    })),
  };
});

mock.module("@iam/db", () => ({
  default: { insert, select },
}));

const auditService = await import("../audit.service");

beforeEach(() => {
  insertedValues.length = 0;
  selectedRows = [];
  insert.mockClear();
  select.mockClear();
  values.mockClear();
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

describe("admin auditService.recordAuditLog", () => {
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
    expect(auditService.normalizeAuditLogQueryActions({
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
    expect(auditService.normalizeAuditLogQueryActions({
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
});
