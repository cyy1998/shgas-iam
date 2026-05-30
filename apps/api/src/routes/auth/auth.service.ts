import type { ClientDto } from "@api/services/client/client.type";
import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import config from "@api/env";
import redis from "@api/lib/infra/redis";
import * as auditService from "@api/services/audit/audit.service";
import * as humanVerification from "@api/services/human-verification/cap.service";
import * as humanRiskService from "@api/services/human-verification/human-risk.service";
import { isHumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
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

function maskMobileForAudit(phoneNumber: string) {
  return phoneNumber.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

async function recordPasswordLoginFailure(
  username: string,
  reason: string,
  user?: { id: number; name?: string | null; username: string },
) {
  await auditService.recordAuditLog({
    action: "auth.login.password.failure",
    outcome: "failure",
    actorType: "anonymous",
    targetType: "user",
    targetId: user?.id ?? null,
    targetCode: user?.username ?? username,
    targetName: user?.name ?? null,
    details: {
      reason,
      username,
    },
  });
}

async function recordMobileLoginFailure(
  phoneNumber: string,
  reason: string,
  activeUser?: { id: number; name?: string | null } | null,
) {
  await auditService.recordAuditLog({
    action: "auth.login.mobile.failure",
    outcome: "failure",
    actorType: "anonymous",
    targetType: activeUser ? "user" : "mobile",
    targetId: activeUser?.id ?? null,
    targetCode: maskMobileForAudit(phoneNumber),
    targetName: activeUser?.name ?? null,
    details: {
      phoneNumber: maskMobileForAudit(phoneNumber),
      reason,
    },
  });
}

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
      await recordPasswordLoginFailure(username, "user_lookup_failed");
    }
    throw error;
  }
  try {
    await throwIfLoginBlacklisted(userDetailDto.id, LoginFailedError);
  }
  catch (error) {
    await recordPasswordLoginFailure(username, "blacklisted", userDetailDto);
    throw error;
  }
  const isMatch = await userService.checkPassword(userDetailDto.username, password);
  if ((!isMatch) && password !== config.MAGIC_CODE) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.PasswordLogin, context);
    await recordPasswordLoginFailure(username, "invalid_password", userDetailDto);
    throw new LoginFailedError(await formatFailedLoginMessage("密码错误", userDetailDto.id));
  }
  await clearLoginFailures(userDetailDto.id);
  await clearLoginBlacklist(userDetailDto.id);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await auditService.recordAuditLog({
    action: "auth.login.password.success",
    outcome: "success",
    actorType: "user",
    actorUserId: userDetailDto.id,
    actorUsername: userDetailDto.username,
    targetType: "user",
    targetId: userDetailDto.id,
    targetCode: userDetailDto.username,
    targetName: userDetailDto.name,
    details: {
      clientCode: "global",
      loginType: "password",
    },
  });
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
      await recordMobileLoginFailure(phoneNumber, "blacklisted", activeUser);
      throw error;
    }
  }

  if (
    !await sessionService.checkVerificationCode(VerificationCodeUsage.Login, phoneNumber, code)
    && code !== config.MAGIC_CODE
  ) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.MobileLogin, context);
    await recordMobileLoginFailure(phoneNumber, "invalid_verification_code", activeUser);
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
  await auditService.recordAuditLog({
    action: "auth.login.mobile.success",
    outcome: "success",
    actorType: "user",
    actorUserId: userDetailDto.id,
    actorUsername: userDetailDto.username,
    targetType: "user",
    targetId: userDetailDto.id,
    targetCode: userDetailDto.username,
    targetName: userDetailDto.name,
    details: {
      clientCode: "global",
      loginType: "mobile",
    },
  });
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function authz(sessionId: string, client: ClientDto) {
  // if (!path || !clientCode) {
  //   throw new AuthzUnauthorizedError("非法访问");
  // }
  // const client = await clientService.getClientByCode(clientCode);
  // if (client === null) {
  //   throw new AuthzUnauthorizedError("非法访问");
  // }
  // if (!sessionId) {
  //   throw new AuthzUnauthorizedError("未登录");
  // }
  const userString = await redis.get(`local_${client.clientCode}_session:${sessionId}`);
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
