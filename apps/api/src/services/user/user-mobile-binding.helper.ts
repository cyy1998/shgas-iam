import type { DbClient } from "@iam/db";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import * as selfUserAudit from "@api/services/audit/events/self-user.audit";
import * as mobileService from "@api/services/mobile/mobile.service";
import { InvalidMobileError } from "@iam/api-core/errors/InvalidMobileError";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { MobileAlreadyExistsError } from "@iam/api-core/errors/MobileAlreadyExistsError";

export async function assertCanBindMobile(
  userId: number,
  phoneNumber: string,
  code: string,
  tx: DbClient,
) {
  if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
    throw new InvalidMobileError("无效手机号");
  }
  if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
    throw new MobileAlreadyExistsError("手机号已存在");
  }
  if (!await mobileService.checkVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
    await selfUserAudit.recordMobileBindInvalidCode(userId, phoneNumber, tx);
    throw new InvalidVerificationCodeError("验证码错误");
  }
}
