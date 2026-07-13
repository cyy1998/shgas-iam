import type { ResetPasswordUseCaseDeps } from "./reset-password.port";
import type { ResetPasswordInput, ResetPasswordOptions } from "./reset-password.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import {
  buildPasswordResetFailureAudit,
  buildPasswordResetSuccessAudit,
} from "@api/services/audit/events/self-user.audit";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { UserNotFoundError } from "@iam/domain/user";

export function createResetPasswordUseCase(deps: ResetPasswordUseCaseDeps) {
  async function execute(input: ResetPasswordInput, options: ResetPasswordOptions = {}): Promise<boolean> {
    const phoneNumber = await deps.boundMobileResolver.resolveBoundMobile(input.username, input.phoneNumber);
    const user = await deps.userLookup.getActiveUserByUsername(input.username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    if (user.mobile !== phoneNumber) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildPasswordResetFailureAudit(user, phoneNumber, "mobile_mismatch"),
      ));
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    const reservation = await deps.verificationCodes.reserveVerificationCode(
      VerificationCodeUsage.ResetPassword,
      phoneNumber,
      input.code,
    );
    if (reservation === null) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildPasswordResetFailureAudit(user, phoneNumber, "invalid_verification_code"),
      ));
      throw new InvalidVerificationCodeError("验证码错误");
    }

    let transactionSucceeded = false;
    try {
      const newPasswordHash = await deps.passwordHasher.hashUserPassword(input.newPassword);
      const result = await deps.uow.transaction(async (tx) => {
        await tx.userWriter.setPassword(user.id, newPasswordHash);
        await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
          options.requestContext,
          buildPasswordResetSuccessAudit(user, phoneNumber),
        ));
        return true;
      }, { observability: options.requestContext });
      transactionSucceeded = true;
      await deps.verificationCodes.confirmReservedVerificationCode(reservation);
      return result;
    }
    catch (error) {
      if (!transactionSucceeded) {
        await deps.verificationCodes.releaseReservedVerificationCode(reservation);
      }
      throw error;
    }
  }

  return { execute };
}

export type ResetPasswordUseCase = ReturnType<typeof createResetPasswordUseCase>;
