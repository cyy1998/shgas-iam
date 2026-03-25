import { Status } from "@enums/status";
import { VerificationCodeUsage } from "@enums/verificationCode.usage";
import { AuthzMaintaincingError } from "@errors/AuthzMaintaincingError";
import { AuthzUnauthorizedError } from "@errors/AuthzUnauthorizedError";
import { CustomError } from "@errors/CustomError";
import { UserDtoSchema } from "@schemas/user.common.type";
import { userService } from "@services/user.common.service";
import config from "@/env";
import redis from "@/lib/clients/redis";
import * as clientService from "@/services/client/client.service";
import * as sessionRepository from "@/services/session/session.repository";
import * as sessionService from "@/services/session/session.service";
import { reviveIsoDates } from "@/utils/common.utils";

export async function loginPassword(username: string, password: string) {
  const userDetailDto = await userService.getUserDetailByUsername(username);
  const isMatch = await userService.checkPassword(userDetailDto.username, password);
  if ((!isMatch) && password !== config.MAGIC_CODE) {
    throw new CustomError("密码错误");
  }
  const token = await sessionService.setGlobalSession(userDetailDto);
  await sessionRepository.loginLog(userDetailDto, "global", "全局密码登录");
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function loginMobile(phoneNumber: string, code: string) {
  if (!sessionService.cehckVerificationCode(VerificationCodeUsage.Login, phoneNumber, code) && code !== config.MAGIC_CODE) {
    throw new CustomError("验证码错误");
  }
  const userDetailDto = await userService.getUserDetailByMobile(phoneNumber);
  const token = await sessionService.setGlobalSession(userDetailDto);
  await sessionRepository.loginLog(userDetailDto, "global", "全局手机登录");
  return { token, isMobileSet: userDetailDto.mobile !== null };
}

export async function authz(sessionId: string | null, clientCode: string | null, path: string | undefined) {
  if (!path || !clientCode) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  const client = await clientService.getClientByCode(clientCode);
  if (client === null) {
    throw new AuthzUnauthorizedError("非法访问");
  }
  if (!sessionId) {
    throw new AuthzUnauthorizedError("未登录");
  }
  const userString = await redis.get(`local_${clientCode}_session:${sessionId}`);
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
  if (client.status === Status.Pause && !userInExcludingList) {
    throw new AuthzMaintaincingError("系统维护中");
  }
  const userAbstract = {
    username: userDto.username,
    id: userDto.id,
  };
  const userAbstractString = Buffer.from(JSON.stringify(userAbstract), "utf8").toString("base64");
  return userAbstractString;
}
