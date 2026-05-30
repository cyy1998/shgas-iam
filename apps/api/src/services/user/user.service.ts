import type { UserDetailDto, UserDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import * as selfUserAudit from "@api/services/audit/events/self-user.audit";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as userRepository from "@api/services/user/user.repository";
import { UserDtoSchema } from "@api/services/user/user.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidOldPasswordError } from "@iam/api-core/errors/InvalidOldPasswordError";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import { UserStatus } from "@iam/contracts";
import db from "@iam/db";
import { searchUsersWithDelegations } from "./user-delegation-query.helper";
import { buildUserDetail } from "./user-detail.helper";
import { assertCanBindMobile } from "./user-mobile-binding.helper";
import { assertStrongPassword, hashUserPassword, verifyUserPassword } from "./user-password.helper";

export async function setPassword(username: string, oldPassword: string, newPassword: string) {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsername(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户名不存在");
    }
    if (oldPassword === newPassword) {
      throw new CustomError("旧密码与新密码相同");
    }
    const isMatch = await verifyUserPassword(user, oldPassword);
    if (!isMatch) {
      await selfUserAudit.recordSelfPasswordChangeFailure(user, tx);
      throw new InvalidOldPasswordError("旧密码错误");
    }
    assertStrongPassword(newPassword);
    const newPasswordHash = await hashUserPassword(newPassword);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    await selfUserAudit.recordSelfPasswordChangeSuccess(user, tx);
    return true;
  });
}

export async function resetPassword(username: string, phone: string, code: string, newPassword: string) {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsername(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    if (user.mobile !== phone) {
      await selfUserAudit.recordPasswordResetFailure(user, phone, "mobile_mismatch", tx);
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    if (!await mobileService.consumeVerificationCode(VerificationCodeUsage.ResetPassword, phone, code)) {
      await selfUserAudit.recordPasswordResetFailure(user, phone, "invalid_verification_code", tx);
      throw new InvalidVerificationCodeError("验证码错误");
    }
    const newPasswordHash = await hashUserPassword(newPassword);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    await selfUserAudit.recordPasswordResetSuccess(user, phone, tx);
    return true;
  });
}

export async function checkPassword(username: string, inputPassword: string) {
  const user = await userRepository.getUserByUsername(username);
  if (user === null) {
    throw new UserNotFoundError("用户不存在");
  }
  return await verifyUserPassword(user, inputPassword);
}

export async function getActiveUserByMobile(mobile: string) {
  return await userRepository.getUserByMobile(mobile);
}

export async function pauseEnabledUser(userId: number) {
  return await userRepository.updateEnabledUserStatus(userId, UserStatus.Pause);
}

export async function setMobile(userId: number, phoneNumber: string, code: string) {
  await db.transaction(async (tx) => {
    await assertCanBindMobile(userId, phoneNumber, code, tx);
    await userRepository.setMobile(userId, phoneNumber, tx);
    await selfUserAudit.recordMobileBindSuccess(userId, phoneNumber, tx);
  });
  return await getUserDetailById(userId);
}
export async function searchUsers(userQueryDto: UserQueryDto): Promise<UserDto[]> {
  const users = await userRepository.searchUsers(userQueryDto);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  return userDtos;
}

export async function searchUsersWithPrivilegeDelegation(query: UserQueryWithPrivilegeDelegationDto) {
  return await searchUsersWithDelegations(query);
}

export async function getUserDetailById(userId: number): Promise<UserDetailDto> {
  const user = await userRepository.getUserById(userId);
  const userDetail = await buildUserDetail(user);
  return userDetail;
}

export async function getUserDetailByUsername(username: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByUsername(username);
  const userDetail = await buildUserDetail(user);
  return userDetail;
}

export async function getUserDetailByMobile(mobile: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByMobile(mobile);
  const userDetail = await buildUserDetail(user);
  return userDetail;
}

export async function getUserDetailByWxId(wxId: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByWxId(wxId);
  const userDetail = await buildUserDetail(user);
  return userDetail;
}
