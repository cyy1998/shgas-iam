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

test("exports the internal user search candidate codes at runtime", () => {
  expect(String(ApiErrorCode.UserSearchResultTooLarge)).toBe(
    "USER_SEARCH_RESULT_TOO_LARGE",
  );
  expect(String(ApiErrorCode.UserSearchUnavailable)).toBe(
    "USER_SEARCH_UNAVAILABLE",
  );
});

test("exports the Privilege Delegation Resolution input error code at runtime", () => {
  expect(String(ApiErrorCode.PrivilegeDelegationResolutionInputNotFound)).toBe(
    "PRIVILEGE.DELEGATION_RESOLUTION_INPUT_NOT_FOUND",
  );
  expect(String(ApiErrorCode.PrivilegeDelegationResolutionUnavailable)).toBe(
    "PRIVILEGE.DELEGATION_RESOLUTION_UNAVAILABLE",
  );
});
