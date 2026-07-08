import { BadRequestError } from "@iam/api-core/errors";
import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createOpenService } from "../open.service";

describe("createOpenService", () => {
  test("resolves reset password mobile from live user lookup", async () => {
    const getActiveUserByUsername = mock(async () => ({
      username: "zhangsan",
      mobile: "17721462865",
    }));
    const service = createOpenService({
      userService: { getActiveUserByUsername },
    } as any);

    await expect(service.resolveResetPasswordMobile("zhangsan", "177****2865")).resolves.toBe("17721462865");

    expect(getActiveUserByUsername).toHaveBeenCalledWith("zhangsan");
  });

  test("rejects reset password lookup input with bad request errors", async () => {
    const service = createOpenService({
      userService: { getActiveUserByUsername: mock(async () => null) },
    } as any);

    await expect(service.resolveResetPasswordMobile(undefined, undefined))
      .rejects
      .toMatchObject({
        code: ApiErrorCode.BadRequest,
        httpStatus: 400,
        message: "用户名不能为空",
      });
    await expect(service.resolveResetPasswordMobile("missing", undefined))
      .rejects
      .toBeInstanceOf(BadRequestError);
  });

  test("requires phone number with bad request error", () => {
    expect(() => serviceRequirePhoneNumber()).toThrow(
      expect.objectContaining({
        code: ApiErrorCode.BadRequest,
        httpStatus: 400,
        message: "手机号不能为空",
      }),
    );
  });
});

function serviceRequirePhoneNumber() {
  const service = createOpenService({
    userService: { getActiveUserByUsername: mock(async () => null) },
  } as any);
  return service.requirePhoneNumber(undefined);
}
