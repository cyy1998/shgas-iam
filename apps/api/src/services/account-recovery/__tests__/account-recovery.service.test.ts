import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createAccountRecoveryService } from "../account-recovery.service";

describe("createAccountRecoveryService", () => {
  test("resolves a masked bound mobile for Account Recovery", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => ({ mobile: "17721462865" })),
      },
    });

    await expect(service.resolveBoundMobile("zhangsan", "177****2865"))
      .resolves
      .toBe("17721462865");
  });

  test("resolves the raw bound mobile for Account Recovery", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => ({ mobile: "17721462865" })),
      },
    });

    await expect(service.resolveBoundMobile("zhangsan", "17721462865"))
      .resolves
      .toBe("17721462865");
  });

  test("rejects Account Recovery without a username", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => null),
      },
    });

    await expect(service.resolveBoundMobile(undefined, undefined))
      .rejects
      .toMatchObject({
        code: ApiErrorCode.BadRequest,
        message: "用户名不能为空",
      });
  });

  test("rejects Account Recovery for a missing active user", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => null),
      },
    });

    await expect(service.resolveBoundMobile("missing", undefined))
      .rejects
      .toMatchObject({
        code: ApiErrorCode.BadRequest,
        message: "用户不存在",
      });
  });

  test("rejects Account Recovery when the active user has no bound mobile", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => ({ mobile: null })),
      },
    });

    await expect(service.resolveBoundMobile("zhangsan", undefined))
      .rejects
      .toMatchObject({
        code: ApiErrorCode.BadRequest,
        message: "该用户暂未绑定手机号",
      });
  });

  test("rejects a mobile outside the active user's Account Recovery binding", async () => {
    const service = createAccountRecoveryService({
      userLookup: {
        getActiveUserByUsername: mock(async () => ({ mobile: "17721462865" })),
      },
    });

    await expect(service.resolveBoundMobile("zhangsan", "138****1234"))
      .rejects
      .toMatchObject({
        code: ApiErrorCode.BadRequest,
        message: "用户名与手机号不匹配",
      });
  });
});
