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
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { UserNotFoundError } from "@iam/domain/user";

export function createLoginWithPasswordUseCase(deps: LoginWithPasswordDeps) {
  async function recordFailedLoginAndBlacklistIfNeeded(userId: number) {
    const result = await deps.loginFailure.recordLoginFailure(userId);
    if (result.shouldBlacklist) {
      await deps.loginFailure.blacklistLoginUser(userId, "password");
    }
    return result;
  }

  async function formatFailedLoginMessage(userId: number) {
    const result = await recordFailedLoginAndBlacklistIfNeeded(userId);
    const message = deps.loginFailure.formatLoginFailureMessage("密码错误", result);
    return result.shouldBlacklist
      ? `${message}，${await deps.loginFailure.formatLoginBlacklistMessage(userId)}`
      : message;
  }

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
    try {
      if (await deps.loginFailure.isLoginUserBlacklisted(activeUser.id)) {
        throw new LoginFailedError(await deps.loginFailure.formatLoginBlacklistMessage(activeUser.id));
      }
    }
    catch (error) {
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildPasswordLoginFailureAudit(input.username, "blacklisted", activeUser),
      });
      throw error;
    }
    const isMatch = await deps.users.checkPassword(activeUser.username, input.password);
    if (!isMatch && input.password !== deps.config.magicCode) {
      await deps.humanRisk.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
      await deps.auditLogWriter.recordAuditLog({
        ...requestContext,
        ...buildPasswordLoginFailureAudit(input.username, "invalid_password", activeUser),
      });
      throw new LoginFailedError(await formatFailedLoginMessage(activeUser.id));
    }

    const userDetail = await deps.users.getUserDetailById(activeUser.id);
    await deps.loginFailure.clearLoginFailures(userDetail.id);
    await deps.loginFailure.clearLoginBlacklist(userDetail.id);
    const { token } = await deps.principalSessions.createPrincipalSession(userDetail, { amr: ["pwd"] });
    await deps.auditLogWriter.recordAuditLog({
      ...requestContext,
      ...buildPasswordLoginSuccessAudit(userDetail),
    });
    return { token, isMobileSet: userDetail.mobile !== null };
  }

  return { execute };
}

export type LoginWithPasswordUseCase = ReturnType<typeof createLoginWithPasswordUseCase>;
