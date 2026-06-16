import { describe, expect, test } from "bun:test";
import {
  auditActionOptions,
  canonicalizeAuditAction,
  expandAuditActionAliases,
  getAuditActionLabel,
} from "../actions";

describe("audit action catalog", () => {
  test("expands canonical login actions to include legacy aliases", () => {
    expect(expandAuditActionAliases(["auth.login.password"])).toEqual([
      "auth.login.password",
      "auth.login.password.success",
      "auth.login.password.failure",
    ]);
  });

  test("canonicalizes legacy login aliases for display", () => {
    expect(canonicalizeAuditAction("auth.login.mobile.failure")).toBe("auth.login.mobile");
    expect(getAuditActionLabel("auth.login.password.failure")).toBe("密码登录");
  });

  test("keeps non-login actions as exact actions", () => {
    expect(expandAuditActionAliases(["admin.user.update"])).toEqual(["admin.user.update"]);
  });

  test("deduplicates mixed canonical and legacy action queries", () => {
    expect(expandAuditActionAliases([
      "auth.login.password",
      "auth.login.password.failure",
      "admin.user.update",
    ])).toEqual([
      "auth.login.password",
      "auth.login.password.success",
      "auth.login.password.failure",
      "admin.user.update",
    ]);
  });

  test("generates canonical action options only", () => {
    const values = auditActionOptions.map(option => option.value);

    expect(values).toContain("auth.login.password");
    expect(values).toContain("admin.client.oidc.configure");
    expect(values).toContain("admin.client.oidc.rotate_secret");
    expect(values).not.toContain("auth.login.password.failure");
  });
});
