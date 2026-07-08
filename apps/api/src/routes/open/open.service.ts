import type { OpenServiceDeps } from "./open.port";
import { BadRequestError } from "@iam/api-core/errors/BadRequestError";

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
      throw new BadRequestError("用户名不能为空");
    }
    const user = await deps.userService.getActiveUserByUsername(username);
    if (user === null) {
      throw new BadRequestError("用户不存在");
    }
    if (!user.mobile) {
      throw new BadRequestError("该用户暂未绑定手机号");
    }
    const maskedMobile = maskMobile(user.mobile);
    if (phoneNumber && phoneNumber !== user.mobile && phoneNumber !== maskedMobile) {
      throw new BadRequestError("用户名与手机号不匹配");
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
    throw new BadRequestError("手机号不能为空");
  }
  return phoneNumber;
}
