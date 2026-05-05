import { CustomError } from "@api/errors/CustomError";
import * as userService from "@api/services/user/user.service";

export function maskMobile(mobile: string | null): string | null {
  if (mobile === null) {
    return null;
  }
  if (mobile.length <= 7) {
    return mobile.replace(/.(?=.{2})/g, "*");
  }
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}

export async function resolveResetPasswordMobile(username?: string, phoneNumber?: string): Promise<string> {
  if (!username) {
    throw new CustomError("用户名不能为空");
  }
  const user = await userService.getUserDetailByUsername(username);
  if (!user.mobile) {
    throw new CustomError("该用户暂未绑定手机号");
  }
  const maskedMobile = maskMobile(user.mobile);
  if (phoneNumber && phoneNumber !== user.mobile && phoneNumber !== maskedMobile) {
    throw new CustomError("用户名与手机号不匹配");
  }
  return user.mobile;
}

export function requirePhoneNumber(phoneNumber?: string): string {
  if (!phoneNumber) {
    throw new CustomError("手机号不能为空");
  }
  return phoneNumber;
}
