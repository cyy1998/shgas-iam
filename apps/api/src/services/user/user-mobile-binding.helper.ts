import type { UserMobileBindingDeps, UserRequestOptions } from "./user.port";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import { buildMobileBindInvalidCodeAudit } from "@api/services/audit/events/self-user.audit";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { InvalidMobileError, MobileAlreadyExistsError } from "@iam/domain/user";

export function createUserMobileBinding(deps: UserMobileBindingDeps) {
  async function assertCanBindMobile(
    userId: number,
    phoneNumber: string,
    code: string,
    options: UserRequestOptions = {},
  ) {
    if (!deps.mobileService.checkValidPhoneNumber(phoneNumber)) {
      throw new InvalidMobileError("无效手机号");
    }
    if (await deps.mobileService.checkExistingPhoneNumber(phoneNumber)) {
      throw new MobileAlreadyExistsError("手机号已存在");
    }
    if (!await deps.mobileService.consumeVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildMobileBindInvalidCodeAudit(userId, phoneNumber),
      ));
      throw new InvalidVerificationCodeError("验证码错误");
    }
  }

  return { assertCanBindMobile };
}

export type UserMobileBinding = ReturnType<typeof createUserMobileBinding>;
