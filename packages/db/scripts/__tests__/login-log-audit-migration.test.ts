import { describe, expect, test } from "bun:test";
import {
  mapLoginLogToAuditLog,
  mapLoginTypeToAuditAction,
  parseLoginLogAuditMigrationArgs,
} from "../login-log-audit-migration";

describe("login_log audit migration helpers", () => {
  test("defaults to dry-run with conservative batch and sample sizes", () => {
    expect(parseLoginLogAuditMigrationArgs([])).toEqual({
      dryRun: true,
      batchSize: 500,
      sampleSize: 5,
    });
  });

  test("parses execute mode and numeric options", () => {
    expect(
      parseLoginLogAuditMigrationArgs([
        "--",
        "--execute",
        "--batch-size",
        "100",
        "--sample-size=2",
      ]),
    ).toEqual({
      dryRun: false,
      batchSize: 100,
      sampleSize: 2,
    });
  });

  test("rejects invalid batch size", () => {
    expect(() =>
      parseLoginLogAuditMigrationArgs(["--batch-size", "0"]),
    ).toThrow("--batch-size must be a positive integer");
  });

  test("maps known and unknown login types to audit actions", () => {
    expect(mapLoginTypeToAuditAction("password")).toBe(
      "auth.login.password.success",
    );
    expect(mapLoginTypeToAuditAction("全局密码登录")).toBe(
      "auth.login.password.success",
    );
    expect(mapLoginTypeToAuditAction("SMS")).toBe(
      "auth.login.mobile.success",
    );
    expect(mapLoginTypeToAuditAction("oa")).toBe("auth.login.oa.success");
    expect(mapLoginTypeToAuditAction("unknown")).toBe("auth.login.success");
  });

  test("maps legacy login row to append-only audit log value", () => {
    const mapped = mapLoginLogToAuditLog({
      id: 12,
      userId: 1001,
      username: "zhangsan",
      name: "张三",
      clientCode: "iam-admin",
      loginType: "wechat",
      loginTime: "2026-05-29T10:30:00.000Z",
    });

    expect(mapped).toMatchObject({
      action: "auth.login.wechat.success",
      outcome: "success",
      actorType: "user",
      actorUserId: 1001,
      actorUsername: "zhangsan",
      targetType: "user",
      targetId: 1001,
      targetCode: "zhangsan",
      sourceApp: "api",
      details: {
        migrationSource: "login_log",
        legacyLoginLogId: 12,
        loginType: "wechat",
        clientCode: "iam-admin",
      },
    });
    expect(mapped.eventTime.toISOString()).toBe("2026-05-29T10:30:00.000Z");
  });
});
