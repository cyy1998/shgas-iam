import type { VerifyPasswordResetCodeUseCaseDeps } from "./verify-password-reset-code.port";
import type {
  VerifyPasswordResetCodeInput,
  VerifyPasswordResetCodeOptions,
} from "./verify-password-reset-code.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import { buildSmsCodeVerifyAudit } from "@api/services/audit/events/auth.audit";

export function createVerifyPasswordResetCodeUseCase(deps: VerifyPasswordResetCodeUseCaseDeps) {
  async function execute(
    input: VerifyPasswordResetCodeInput,
    options: VerifyPasswordResetCodeOptions = {},
  ): Promise<boolean> {
    const phoneNumber = await deps.boundMobileResolver.resolveBoundMobile(input.username, input.phoneNumber);
    const verified = await deps.mobileCodeVerifier.checkVerificationCode(
      VerificationCodeUsage.ResetPassword,
      phoneNumber,
      input.code,
    );
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(options.requestContext, buildSmsCodeVerifyAudit({
      phoneNumber,
      usage: VerificationCodeUsage.ResetPassword,
      username: input.username,
      verified,
    })));
    return verified;
  }

  return { execute };
}

export type VerifyPasswordResetCodeUseCase = ReturnType<typeof createVerifyPasswordResetCodeUseCase>;
