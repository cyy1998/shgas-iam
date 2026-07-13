import { ApiErrorCode } from "@iam/contracts";
import { expect, test } from "bun:test";
import { requirePhoneNumber } from "../open.validation";

test("rejects a missing non-recovery phone number", () => {
  expect(() => requirePhoneNumber(undefined)).toThrow(expect.objectContaining({
    code: ApiErrorCode.BadRequest,
    httpStatus: 400,
    message: "手机号不能为空",
  }));
});

test("returns the provided non-recovery phone number", () => {
  expect(requirePhoneNumber("17721462865")).toBe("17721462865");
});
