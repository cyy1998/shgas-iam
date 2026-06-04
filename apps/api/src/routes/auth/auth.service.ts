import type { ClientDto } from "@api/services/client/client.type";
import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import config from "@api/env";
import * as authAudit from "@api/services/audit/events/auth.audit";
import * as humanVerification from "@api/services/human-verification/cap.service";
import * as humanRiskService from "@api/services/human-verification/human-risk.service";
import { isHumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as sessionService from "@api/services/session/session.service";
import { UserDtoSchema } from "@api/services/user/user.schema";
import * as userService from "@api/services/user/user.service";
import { AuthzMaintenanceError } from "@iam/api-core/errors/AuthzMaintenanceError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { LoginFailedError } from "@iam/api-core/errors/LoginFailedError";
import { reviveIsoDates } from "@iam/api-core/utils";
import { ClientStatus } from "@iam/contracts";
import {
  blacklistLoginUser,
  clearLoginBlacklist,
  clearLoginFailures,
  formatLoginBlacklistMessage,
  formatLoginFailureMessage,
  isLoginUserBlacklisted,
  recordLoginFailure,
} from "./login-failure.helper";

type LoginHumanVerificationOptions = {
  capToken?: string;
  context?: HumanVerificationContext;
};

async function recordFailedLoginAndBlacklistIfNeeded(userId: number, reason: "password" | "mobile") {
  const result = await recordLoginFailure(userId);
  if (result.shouldBlacklist) {
    await blacklistLoginUser(userId, reason);
  }
  return result;
}

async function throwIfLoginBlacklisted(
  userId: number,
  ErrorClass: typeof LoginFailedError | typeof InvalidVerificationCodeError,
) {
  if (await isLoginUserBlacklisted(userId)) {
    throw new ErrorClass(await formatLoginBlacklistMessage(userId));
  }
}

async function formatFailedLoginMessage(prefix: string, userId: number) {
  const result = await recordFailedLoginAndBlacklistIfNeeded(userId, "password");
  const message = formatLoginFailureMessage(prefix, result);
  return result.shouldBlacklist
    ? `${message}，${await formatLoginBlacklistMessage(userId)}`
    : message;
}

export async function loginPassword(username: string, password: string, options: LoginHumanVerificationOptions = {}) {
  const context = { ...options.context, subject: username };
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.PasswordLogin,
    options.capToken,
    context,
  );

  let userDetailDto: Awaited<ReturnType<typeof userService.getUserDetailByUsername>>;
  try {
    userDetailDto = await userService.getUserDetailByUsername(username);
  }
  catch (error) {
    if (!isHumanVerificationRequiredError(error)) {
      await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.PasswordLogin, context);
      await authAudit.recordPasswordLoginFailure(username, "user_lookup_failed");
    }
    throw error;
  }
  try {
    await throwIfLoginBlacklisted(userDetailDto.id, LoginFailedError);
  }
  catch (error) {
    await authAudit.recordPasswordLoginFailure(username, "blacklisted", userDetailDto);
    throw error;
  }
  const isMatch = await userService.checkPassword(userDetailDto.username, password);
  if ((!isMatch) && password !== config.MAGIC_CODE) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.PasswordLogin, context);
    await authAudit.recordPasswordLoginFailure(username, "invalid_password", userDetailDto);
    throw new LoginFailedError(await formatFailedLoginMessage("密码错误", userDetailDto.id));
  }
  await clearLoginFailures(userDetailDto.id);
  await clearLoginBlacklist(userDetailDto.id);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await authAudit.recordPasswordLoginSuccess(userDetailDto);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function loginMobile(phoneNumber: string, code: string, options: LoginHumanVerificationOptions = {}) {
  const context = { ...options.context, subject: phoneNumber };
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.MobileLogin,
    options.capToken,
    context,
  );

  const activeUser = await userService.getActiveUserByMobile(phoneNumber);
  if (activeUser !== null) {
    try {
      await throwIfLoginBlacklisted(activeUser.id, InvalidVerificationCodeError);
    }
    catch (error) {
      await authAudit.recordMobileLoginFailure(phoneNumber, "blacklisted", activeUser);
      throw error;
    }
  }

  const verificationCodeValid = code === config.MAGIC_CODE
    || await mobileService.consumeVerificationCode(VerificationCodeUsage.Login, phoneNumber, code);

  if (!verificationCodeValid) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.MobileLogin, context);
    await authAudit.recordMobileLoginFailure(phoneNumber, "invalid_verification_code", activeUser);
    if (activeUser !== null) {
      const result = await recordFailedLoginAndBlacklistIfNeeded(activeUser.id, "mobile");
      const message = formatLoginFailureMessage("验证码错误", result);
      throw new InvalidVerificationCodeError(
        result.shouldBlacklist
          ? `${message}，${await formatLoginBlacklistMessage(activeUser.id)}`
          : message,
      );
    }
    throw new InvalidVerificationCodeError("验证码错误");
  }
  const userDetailDto = await userService.getUserDetailByMobile(phoneNumber);
  await clearLoginFailures(userDetailDto.id);
  await clearLoginBlacklist(userDetailDto.id);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await authAudit.recordMobileLoginSuccess(userDetailDto);
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function authz(sessionId: string, client: ClientDto) {
  const userString = await sessionService.getValidatedLocalSessionUserString(client.clientCode, sessionId);
  if (!userString) {
    throw new AuthzUnauthorizedError("未登录");
  }
  const userDto = UserDtoSchema.parse(JSON.parse(userString, reviveIsoDates));
  let userInExcludingList = false;
  if (client.extAttributes.userExcluding !== undefined
    && client.extAttributes.userExcluding !== null
    && client.extAttributes.userExcluding.includes(userDto.username)) {
    userInExcludingList = true;
  }
  if (client.status === ClientStatus.Maintance && !userInExcludingList) {
    throw new AuthzMaintenanceError("系统维护中");
  }
  const userAbstract = {
    username: userDto.username,
    id: userDto.id,
  };
  const userAbstractString = Buffer.from(JSON.stringify(userAbstract), "utf8").toString("base64");
  return userAbstractString;
}
