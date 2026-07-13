import type { LoginWithMobileDeps } from "./login-with-mobile.port";
import type {
  LoginWithMobileInput,
  LoginWithMobileOptions,
} from "./login-with-mobile.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import {
  buildMobileLoginFailureAudit,
  buildMobileLoginSuccessAudit,
} from "@api/services/audit/events/auth.audit";
import { createHumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { UserNotFoundError } from "@iam/domain/user";

export function createLoginWithMobileUseCase(deps: LoginWithMobileDeps) {
  async function recordFailedLoginAndBlacklistIfNeeded(userId: number) {
    const result = await deps.loginFailure.recordLoginFailure(userId);
    if (result.shouldBlacklist) {
      await deps.loginFailure.blacklistLoginUser(userId, "mobile");
    }
    return result;
  }

  async function execute(
    input: LoginWithMobileInput,
    options: LoginWithMobileOptions = {},
  ) {
    const requestContext = options.requestContext;
    const context = createHumanVerificationContext(requestContext, input.phoneNumber);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.MobileLogin,
      input.capToken,
      context,
    );

    const activeUser = await deps.users.getActiveUserByMobile(input.phoneNumber);
    if (activeUser !== null) {
      try {
        if (await deps.loginFailure.isLoginUserBlacklisted(activeUser.id)) {
          throw new InvalidVerificationCodeError(
            await deps.loginFailure.formatLoginBlacklistMessage(activeUser.id),
          );
        }
      }
      catch (error) {
        await deps.auditLogWriter.recordAuditLog({
          ...requestContext,
          ...buildMobileLoginFailureAudit(input.phoneNumber, "blacklisted", activeUser),
        });
        throw error;
      }
    }

    const verificationCodeValid = input.code === deps.config.magicCode
      || await deps.verificationCodes.consumeVerificationCode(
        VerificationCodeUsage.Login,
        input.phoneNumber,
        input.code,
      );
    if (!verificationCodeValid) {
      await deps.humanRisk.recordLoginFailure(HumanVerificationAction.MobileLogin, context);
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildMobileLoginFailureAudit(input.phoneNumber, "invalid_verification_code", activeUser),
      });
      if (activeUser !== null) {
        const result = await recordFailedLoginAndBlacklistIfNeeded(activeUser.id);
        const message = deps.loginFailure.formatLoginFailureMessage("验证码错误", result);
        throw new InvalidVerificationCodeError(
          result.shouldBlacklist
            ? `${message}，${await deps.loginFailure.formatLoginBlacklistMessage(activeUser.id)}`
            : message,
        );
      }
      throw new InvalidVerificationCodeError("验证码错误");
    }
    if (activeUser === null) {
      throw new UserNotFoundError("用户不存在");
    }

    const userDetail = await deps.users.getUserDetailById(activeUser.id);
    await deps.loginFailure.clearLoginFailures(userDetail.id);
    await deps.loginFailure.clearLoginBlacklist(userDetail.id);
    const { token } = await deps.principalSessions.createPrincipalSession(userDetail, { amr: ["sms"] });
    await deps.auditLogWriter.recordAuditLog({
      ...requestContext,
      ...buildMobileLoginSuccessAudit(userDetail),
    });
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithMobileUseCase = ReturnType<typeof createLoginWithMobileUseCase>;
