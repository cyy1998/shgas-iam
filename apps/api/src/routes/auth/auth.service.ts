import type { ClientDto } from "@api/services/client/client.type";
import type { HumanVerificationContext } from "@api/services/human-verification/human-verification.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import config from "@api/env";
import redis from "@api/lib/clients/redis";
import * as humanVerification from "@api/services/human-verification/cap.service";
import * as humanRiskService from "@api/services/human-verification/human-risk.service";
import { isHumanVerificationRequiredError } from "@api/services/human-verification/human-verification.error";
import * as sessionRepository from "@api/services/session/session.repository";
import * as sessionService from "@api/services/session/session.service";
import { UserDtoSchema } from "@api/services/user/user.schema";
import * as userService from "@api/services/user/user.service";
import { AuthzMaintaincingError } from "@iam/api-core/errors/AuthzMaintaincingError";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { reviveIsoDates } from "@iam/api-core/utils";
import { ClientStatus } from "@iam/contracts";
import {
  clearLoginFailures,
  formatLoginFailureMessage,
  recordLoginFailure,
} from "./login-failure.helper";

type LoginHumanVerificationOptions = {
  capToken?: string;
  context?: HumanVerificationContext;
};

async function recordFailedLoginAndSuspendIfNeeded(userId: number) {
  const result = await recordLoginFailure(userId);
  if (result.shouldSuspend) {
    await userService.pauseEnabledUser(userId);
  }
  return result;
}

export async function loginPassword(username: string, password: string, options: LoginHumanVerificationOptions = {}) {
  const context = { ...options.context, subject: username };
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.PasswordLogin,
    options.capToken,
    context,
  );

  let userDetailDto: Awaited<ReturnType<typeof userService.getUserDetailByUsername>>;
  let isMatch: boolean;
  try {
    userDetailDto = await userService.getUserDetailByUsername(username);
    isMatch = await userService.checkPassword(userDetailDto.username, password);
  }
  catch (error) {
    if (!isHumanVerificationRequiredError(error)) {
      await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.PasswordLogin, context);
    }
    throw error;
  }
  if ((!isMatch) && password !== config.MAGIC_CODE) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.PasswordLogin, context);
    const result = await recordFailedLoginAndSuspendIfNeeded(userDetailDto.id);
    throw new CustomError(formatLoginFailureMessage("密码错误", result));
  }
  await clearLoginFailures(userDetailDto.id);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await sessionRepository.loginLog(userDetailDto, "global", "全局密码登录");
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function loginMobile(phoneNumber: string, code: string, options: LoginHumanVerificationOptions = {}) {
  const context = { ...options.context, subject: phoneNumber };
  await humanVerification.ensureActionAllowed(
    humanVerification.HumanVerificationAction.MobileLogin,
    options.capToken,
    context,
  );

  if (
    !await sessionService.checkVerificationCode(VerificationCodeUsage.Login, phoneNumber, code)
    && code !== config.MAGIC_CODE
  ) {
    await humanRiskService.recordLoginFailure(humanVerification.HumanVerificationAction.MobileLogin, context);
    const user = await userService.getActiveUserByMobile(phoneNumber);
    if (user !== null) {
      const result = await recordFailedLoginAndSuspendIfNeeded(user.id);
      throw new CustomError(formatLoginFailureMessage("验证码错误", result));
    }
    throw new CustomError("验证码错误");
  }
  const userDetailDto = await userService.getUserDetailByMobile(phoneNumber);
  await clearLoginFailures(userDetailDto.id);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await sessionRepository.loginLog(userDetailDto, "global", "全局手机登录");
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
    throw new AuthzMaintaincingError("系统维护中");
  }
  const userAbstract = {
    username: userDto.username,
    id: userDto.id,
  };
  const userAbstractString = Buffer.from(JSON.stringify(userAbstract), "utf8").toString("base64");
  return userAbstractString;
}
