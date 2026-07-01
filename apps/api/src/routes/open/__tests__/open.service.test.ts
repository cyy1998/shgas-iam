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
});
