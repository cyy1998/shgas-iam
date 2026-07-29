import { expect, test } from "bun:test";
import { ApiErrorCode } from "../api-error-code";

test("exports the admin session mutation service codes at runtime", () => {
  expect(String(ApiErrorCode.AdminLoginStateAuditFailedAfterEffect)).toBe(
    "ADMIN_LOGIN_STATE_AUDIT_FAILED_AFTER_EFFECT",
  );
  expect(String(ApiErrorCode.AdminSessionCurrentProtected)).toBe(
    "ADMIN_SESSION_CURRENT_PROTECTED",
  );
});
