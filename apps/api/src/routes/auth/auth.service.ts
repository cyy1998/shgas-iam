import type { ClientDto } from "@api/services/client/client.type";
import type { AuthServiceDeps, LoginErrorClass, LoginHumanVerificationOptions } from "./auth.port";
import { HumanVerificationAction } from "@api/enums/humanVerification.action";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import {
  buildMobileLoginFailureAudit,
  buildMobileLoginSuccessAudit,
  buildPasswordLoginFailureAudit,
  buildPasswordLoginSuccessAudit,
} from "@api/services/audit/events/auth.audit";
import { isHumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
import { createHumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";

export function createAuthService(deps: AuthServiceDeps) {
  async function recordFailedLoginAndBlacklistIfNeeded(userId: number, reason: "password" | "mobile") {
    const result = await deps.loginFailure.recordLoginFailure(userId);
    if (result.shouldBlacklist) {
      await deps.loginFailure.blacklistLoginUser(userId, reason);
    }
    return result;
  }

  async function throwIfLoginBlacklisted(userId: number, ErrorClass: LoginErrorClass) {
    if (await deps.loginFailure.isLoginUserBlacklisted(userId)) {
      throw new ErrorClass(await deps.loginFailure.formatLoginBlacklistMessage(userId));
    }
  }

  async function formatFailedLoginMessage(prefix: string, userId: number) {
    const result = await recordFailedLoginAndBlacklistIfNeeded(userId, "password");
    const message = deps.loginFailure.formatLoginFailureMessage(prefix, result);
    return result.shouldBlacklist
      ? `${message}，${await deps.loginFailure.formatLoginBlacklistMessage(userId)}`
      : message;
  }

  async function loginPassword(username: string, password: string, options: LoginHumanVerificationOptions = {}) {
    const requestContext = options.requestContext;
    const context = createHumanVerificationContext(requestContext, username);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.PasswordLogin,
      options.capToken,
      context,
    );

    let userDetailDto: Awaited<ReturnType<AuthServiceDeps["userService"]["getUserDetailByUsername"]>>;
    try {
      userDetailDto = await deps.userService.getUserDetailByUsername(username);
    }
    catch (error) {
      if (!isHumanVerificationRequiredError(error)) {
        await deps.humanRiskService.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
        await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
          requestContext,
          buildPasswordLoginFailureAudit(username, "user_lookup_failed"),
        ));
      }
      throw error;
    }
    try {
      await throwIfLoginBlacklisted(userDetailDto.id, LoginFailedError);
    }
    catch (error) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        requestContext,
        buildPasswordLoginFailureAudit(username, "blacklisted", userDetailDto),
      ));
      throw error;
    }
    const isMatch = await deps.userService.checkPassword(userDetailDto.username, password);
    if ((!isMatch) && password !== deps.config.magicCode) {
      await deps.humanRiskService.recordLoginFailure(HumanVerificationAction.PasswordLogin, context);
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        requestContext,
        buildPasswordLoginFailureAudit(username, "invalid_password", userDetailDto),
      ));
      throw new LoginFailedError(await formatFailedLoginMessage("密码错误", userDetailDto.id));
    }
    await deps.loginFailure.clearLoginFailures(userDetailDto.id);
    await deps.loginFailure.clearLoginBlacklist(userDetailDto.id);
    const { token } = await deps.customSsoSession.createPrincipalSession(userDetailDto, { amr: ["pwd"] });
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
      requestContext,
      buildPasswordLoginSuccessAudit(userDetailDto),
    ));
    return { token, isMobileSet: userDetailDto.mobile !== null };
  }

  async function loginMobile(phoneNumber: string, code: string, options: LoginHumanVerificationOptions = {}) {
    const requestContext = options.requestContext;
    const context = createHumanVerificationContext(requestContext, phoneNumber);
    await deps.humanVerification.ensureActionAllowed(
      HumanVerificationAction.MobileLogin,
      options.capToken,
      context,
    );

    const activeUser = await deps.userService.getActiveUserByMobile(phoneNumber);
    if (activeUser !== null) {
      try {
        await throwIfLoginBlacklisted(activeUser.id, InvalidVerificationCodeError);
      }
      catch (error) {
        await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
          requestContext,
          buildMobileLoginFailureAudit(phoneNumber, "blacklisted", activeUser),
        ));
        throw error;
      }
    }

    const verificationCodeValid = code === deps.config.magicCode
      || await deps.mobileService.consumeVerificationCode(VerificationCodeUsage.Login, phoneNumber, code);

    if (!verificationCodeValid) {
      await deps.humanRiskService.recordLoginFailure(HumanVerificationAction.MobileLogin, context);
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        requestContext,
        buildMobileLoginFailureAudit(phoneNumber, "invalid_verification_code", activeUser),
      ));
      if (activeUser !== null) {
        const result = await recordFailedLoginAndBlacklistIfNeeded(activeUser.id, "mobile");
        const message = deps.loginFailure.formatLoginFailureMessage("验证码错误", result);
        throw new InvalidVerificationCodeError(
          result.shouldBlacklist
            ? `${message}，${await deps.loginFailure.formatLoginBlacklistMessage(activeUser.id)}`
            : message,
        );
      }
      throw new InvalidVerificationCodeError("验证码错误");
    }
    const userDetailDto = await deps.userService.getUserDetailByMobile(phoneNumber);
    await deps.loginFailure.clearLoginFailures(userDetailDto.id);
    await deps.loginFailure.clearLoginBlacklist(userDetailDto.id);
    const { token } = await deps.customSsoSession.createPrincipalSession(userDetailDto, { amr: ["sms"] });
    await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
      requestContext,
      buildMobileLoginSuccessAudit(userDetailDto),
    ));
    return { token, isMobileSet: userDetailDto.mobile !== null };
  }

  async function authz(sessionId: string, client: ClientDto) {
    return await deps.customSsoSession.authorizeLocalSession(sessionId, client);
  }

  return {
    loginPassword,
    loginMobile,
    authz,
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
