import type { RequestPasswordResetCodeUseCaseDeps } from "./request-password-reset-code.port";
import type {
  RequestPasswordResetCodeInput,
  RequestPasswordResetCodeOptions,
} from "./request-password-reset-code.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import { buildSmsCodeSendAudit } from "@api/services/audit/events/auth.audit";

export function createRequestPasswordResetCodeUseCase(deps: RequestPasswordResetCodeUseCaseDeps) {
  async function execute(
    input: RequestPasswordResetCodeInput,
    options: RequestPasswordResetCodeOptions = {},
  ): Promise<boolean> {
    const phoneNumber = await deps.boundMobileResolver.resolveBoundMobile(input.username, input.phoneNumber);
    const result = await deps.mobileCodeSender.sendCode(phoneNumber, VerificationCodeUsage.ResetPassword);
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(options.requestContext, buildSmsCodeSendAudit({
      phoneNumber,
      usage: VerificationCodeUsage.ResetPassword,
      username: input.username,
    })));
    return result;
  }

  return { execute };
}

export type RequestPasswordResetCodeUseCase = ReturnType<typeof createRequestPasswordResetCodeUseCase>;
