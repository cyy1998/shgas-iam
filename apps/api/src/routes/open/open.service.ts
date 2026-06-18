import type { OpenServiceDeps } from "./open.port";
import { CustomError } from "@iam/api-core/errors/CustomError";

export function maskMobile(mobile: string | null): string | null {
  if (mobile === null) {
    return null;
  }
  if (mobile.length <= 7) {
    return mobile.replace(/.(?=.{2})/g, "*");
  }
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

export function createOpenService(deps: OpenServiceDeps) {
  async function resolveResetPasswordMobile(username?: string, phoneNumber?: string): Promise<string> {
    if (!username) {
      throw new CustomError("用户名不能为空");
    }
    const user = await deps.userService.getUserDetailByUsername(username);
    if (!user.mobile) {
      throw new CustomError("该用户暂未绑定手机号");
    }
    const maskedMobile = maskMobile(user.mobile);
    if (phoneNumber && phoneNumber !== user.mobile && phoneNumber !== maskedMobile) {
      throw new CustomError("用户名与手机号不匹配");
    }
    return user.mobile;
  }

  return {
    maskMobile,
    resolveResetPasswordMobile,
    requirePhoneNumber,
  };
}

export type OpenService = ReturnType<typeof createOpenService>;

export function requirePhoneNumber(phoneNumber?: string): string {
  if (!phoneNumber) {
    throw new CustomError("手机号不能为空");
  }
  return phoneNumber;
}
