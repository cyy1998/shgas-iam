import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import { buildMobileBindInvalidCodeAudit } from "@api/services/audit/events/self-user.audit";
import { InvalidMobileError, MobileAlreadyExistsError } from "@iam/domain/user";
import { InvalidVerificationCodeError } from "../mobile/mobile.error";
import type { UserMobileBindingDeps, UserRequestOptions } from "./user.port";

export function createUserMobileBinding(deps: UserMobileBindingDeps) {
  async function consumeBindingCode(
    userId: number,
    phoneNumber: string,
    code: string,
    options: UserRequestOptions = {},
  ) {
    if (!deps.mobileService.checkValidPhoneNumber(phoneNumber)) {
      throw new InvalidMobileError("无效手机号");
    }
    if (await deps.userRepository.isMobileRegistered(phoneNumber)) {
      throw new MobileAlreadyExistsError("手机号已存在");
    }
    const codeValid = await deps.mobileService.consumeVerificationCode(
      VerificationCodeUsage.BindPhone,
      phoneNumber,
      code,
    );
    if (!codeValid) {
      await deps.auditLogWriter.recordAuditLog(
        withApiRequestContext(options.requestContext, buildMobileBindInvalidCodeAudit(userId, phoneNumber)),
      );
      throw new InvalidVerificationCodeError("验证码错误");
    }
  }

  return { consumeBindingCode };
}

export type UserMobileBinding = ReturnType<typeof createUserMobileBinding>;
