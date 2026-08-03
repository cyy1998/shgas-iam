import type {
  AuthenticationLoginFailureStatus,
  AuthenticationLoginRestrictionStatus,
} from "../login-restriction.type";
import type { LoginWithPasswordDeps } from "./login-with-password.port";
import type {
  LoginWithPasswordInput,
  LoginWithPasswordOptions,
} from "./login-with-password.type";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import {
  buildPasswordLoginFailureAudit,
  buildPasswordLoginSuccessAudit,
} from "@api/services/audit/events/auth.audit";
import { isHumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
import { createHumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { toSessionOrigin } from "@api/services/session/session-origin";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { UserNotFoundError } from "@iam/domain/user";
import { runLoginProtectionOperation } from "../login-protection.helper";
import {
  formatLoginFailureMessage,
  formatTemporaryLoginRestrictionMessage,
} from "../login-restriction-message";

export function createLoginWithPasswordUseCase(deps: LoginWithPasswordDeps) {
  async function execute(
    input: LoginWithPasswordInput,
    options: LoginWithPasswordOptions = {},
  ) {
    const requestContext = options.requestContext;
    const context = createHumanVerificationContext(requestContext, input.username);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.PasswordLogin,
      input.capToken,
      context,
    );

    let activeUser = null;
    try {
      activeUser = await deps.users.getActiveUserByUsername(input.username);
      if (activeUser === null) {
        throw new UserNotFoundError("用户不存在");
      }
    }
    catch (error) {
      if (!isHumanVerificationRequiredError(error)) {
        await deps.humanRisk.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
        await deps.auditLogWriter.recordAuditLog({
          ...requestContext,
          ...buildPasswordLoginFailureAudit(input.username, "user_lookup_failed"),
        });
      }
      throw error;
    }
    const runLoginProtection = <T>(operation: () => Promise<T>) =>
      runLoginProtectionOperation({
        operation,
        auditUnavailable: async () => {
          await deps.auditLogWriter.recordAuditLog({
            ...requestContext,
            ...buildPasswordLoginFailureAudit(
              input.username,
              "login_protection_unavailable",
              activeUser,
            ),
          });
        },
      });
    const restriction: AuthenticationLoginRestrictionStatus | null = await runLoginProtection(
      () => deps.loginRestriction.getRestriction(activeUser.id),
    );
    if (restriction !== null) {
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildPasswordLoginFailureAudit(input.username, "too_many_login_failures", activeUser),
      });
      throw new LoginFailedError(formatTemporaryLoginRestrictionMessage(restriction));
    }
    const isMatch = await deps.users.checkPassword(activeUser.username, input.password);
    if (!isMatch && input.password !== deps.config.magicCode) {
      await deps.humanRisk.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
      const failureResult: AuthenticationLoginFailureStatus = await runLoginProtection(
        () => deps.loginRestriction.recordFailure({
          userId: activeUser.id,
          triggerMethod: "password",
        }),
      );
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildPasswordLoginFailureAudit(input.username, "invalid_password", activeUser),
      });
      throw new LoginFailedError(formatLoginFailureMessage("密码错误", failureResult));
    }

    const userDetail = await deps.users.getUserDetailById(activeUser.id);
    await runLoginProtection(
      () => deps.loginRestriction.clearLoginState(userDetail.id),
    );
    const { token } = await deps.principalSessions.createPrincipalSession(activeUser.subjectIdentifier, {
      amr: ["pwd"],
      origin: toSessionOrigin(requestContext),
    });
    await deps.auditLogWriter.recordAuditLog({
      ...requestContext,
      ...buildPasswordLoginSuccessAudit(userDetail),
    });
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithPasswordUseCase = ReturnType<typeof createLoginWithPasswordUseCase>;
