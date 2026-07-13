import type { AccountRecoveryServiceDeps } from "./account-recovery.port";
import { BadRequestError } from "@iam/api-core/errors/BadRequestError";

export function createAccountRecoveryService(deps: AccountRecoveryServiceDeps) {
  async function resolveBoundMobile(username?: string, phoneNumber?: string): Promise<string> {
    if (!username) {
      throw new BadRequestError("用户名不能为空");
    }
    const user = await deps.userLookup.getActiveUserByUsername(username);
    if (user === null) {
      throw new BadRequestError("用户不存在");
    }
    if (!user.mobile) {
      throw new BadRequestError("该用户暂未绑定手机号");
    }
    if (phoneNumber && phoneNumber !== user.mobile && phoneNumber !== maskBoundMobile(user.mobile)) {
      throw new BadRequestError("用户名与手机号不匹配");
    }
    return user.mobile;
  }

  return { resolveBoundMobile };
}

export type AccountRecoveryService = ReturnType<typeof createAccountRecoveryService>;

function maskBoundMobile(mobile: string): string {
  if (mobile.length <= 7) {
    return mobile.replace(/.(?=.{2})/g, "*");
  }
  return `${mobile.slice(0, 3)}****${mobile.slice(-4)}`;
}
