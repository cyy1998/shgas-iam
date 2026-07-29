import type {
  AuthenticationLoginFailureStatus,
  AuthenticationLoginRestrictionStatus,
} from "../login-restriction.type";
import type { LoginWithMobileDeps } from "./login-with-mobile.port";
import type {
  LoginWithMobileInput,
  LoginWithMobileOptions,
  MobileLoginUser,
} from "./login-with-mobile.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import {
  buildMobileLoginFailureAudit,
  buildMobileLoginSuccessAudit,
} from "@api/services/audit/events/auth.audit";
import { createHumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { toSessionOrigin } from "@api/services/session/session-origin";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { UserNotFoundError } from "@iam/domain/user";
import { runLoginProtectionOperation } from "../login-protection.helper";
import {
  formatLoginFailureMessage,
  formatTemporaryLoginRestrictionMessage,
} from "../login-restriction-message";

export function createLoginWithMobileUseCase(deps: LoginWithMobileDeps) {
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
    const runLoginProtection = <T>(
      user: MobileLoginUser,
      operation: () => Promise<T>,
    ) => runLoginProtectionOperation({
      operation,
      auditUnavailable: async () => {
        await deps.auditLogWriter.recordAuditLog({
          ...requestContext,
          ...buildMobileLoginFailureAudit(
            input.phoneNumber,
            "login_protection_unavailable",
            user,
          ),
        });
      },
    });
    if (activeUser !== null) {
      const restriction: AuthenticationLoginRestrictionStatus | null = await runLoginProtection(
        activeUser,
        () => deps.loginRestriction.getRestriction(activeUser.id),
      );
      if (restriction !== null) {
        await deps.auditLogWriter.recordAuditLog({
          ...requestContext,
          ...buildMobileLoginFailureAudit(input.phoneNumber, "too_many_login_failures", activeUser),
        });
        throw new InvalidVerificationCodeError(
          formatTemporaryLoginRestrictionMessage(restriction),
        );
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
      if (activeUser !== null) {
        const failureResult: AuthenticationLoginFailureStatus = await runLoginProtection(
          activeUser,
          () => deps.loginRestriction.recordFailure({
            userId: activeUser.id,
            triggerMethod: "mobile",
          }),
        );
        await deps.auditLogWriter.recordAuditLog({
          ...requestContext,
          ...buildMobileLoginFailureAudit(input.phoneNumber, "invalid_verification_code", activeUser),
        });
        throw new InvalidVerificationCodeError(formatLoginFailureMessage("验证码错误", failureResult));
      }
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildMobileLoginFailureAudit(input.phoneNumber, "invalid_verification_code", null),
      });
      throw new InvalidVerificationCodeError("验证码错误");
    }
    if (activeUser === null) {
      throw new UserNotFoundError("用户不存在");
    }

    const userDetail = await deps.users.getUserDetailById(activeUser.id);
    await runLoginProtection(
      activeUser,
      () => deps.loginRestriction.clearLoginState(userDetail.id),
    );
    const { token } = await deps.principalSessions.createPrincipalSession(userDetail, {
      amr: ["sms"],
      origin: toSessionOrigin(requestContext),
    });
    await deps.auditLogWriter.recordAuditLog({
      ...requestContext,
      ...buildMobileLoginSuccessAudit(userDetail),
    });
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithMobileUseCase = ReturnType<typeof createLoginWithMobileUseCase>;
