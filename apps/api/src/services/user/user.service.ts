import type { User } from "@iam/db/schema";

import type { UserDetailDto, UserDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import config from "@api/env";
import * as auditService from "@api/services/audit/audit.service";
import * as employmentRepository from "@api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@api/services/employment/employment.schema";
import * as mobileService from "@api/services/mobile/mobile.service";
import * as privilegeRepository from "@api/services/privilege/privilege.repository";
import * as privilegeDelegationRepository from "@api/services/privilege/privilegeDelegation.repository";
import * as roleRepository from "@api/services/role/role.repository";
import * as userRepository from "@api/services/user/user.repository";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@api/services/user/user.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidMobileError } from "@iam/api-core/errors/InvalidMobileError";
import { InvalidOldPasswordError } from "@iam/api-core/errors/InvalidOldPasswordError";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { MobileAlreadyExistsError } from "@iam/api-core/errors/MobileAlreadyExistsError";
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import { WeakPasswordError } from "@iam/api-core/errors/WeakPasswordError";
import { UserStatus } from "@iam/contracts";
import db from "@iam/db";
import { compare, hash } from "bcrypt-ts";
import { toPrivilegeDelegationDto } from "../privilege/privilegeDelegation.schema";

async function _getUserDetail(user: User | null): Promise<UserDetailDto> {
  if (user === null) {
    throw new UserNotFoundError("该用户不存在");
  }
  const userDto = UserDetailDtoSchema.parse(user);
  const employments = await employmentRepository.getEmploymentsByUserId(userDto.id);
  const employmentDtos = [];
  for (const employment of employments) {
    const roles = await roleRepository.getRolesByEmploymentId(employment.id);
    const privileges = await privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
    const employmentDto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
    employmentDto.roles = roles.map(r => r.roleCode);
    employmentDto.privileges = privileges.map(p => p.privilegeCode);
    employmentDtos.push(employmentDto);
  }
  userDto.employments = employmentDtos;
  userDto.roles = [...new Set(employmentDtos.flatMap(e => e.roles))];
  userDto.privileges = [...new Set(employmentDtos.flatMap(e => e.privileges))];

  return userDto;
}

const LETTER_CHECK_REGEX = /[a-z]/i;
const DIGIT_CHECK_REGEX = /\d/;

function maskMobileForAudit(phoneNumber: string) {
  return phoneNumber.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

function _validatePasswordStrength(password: string): boolean {
  // 检查长度是否至少为8
  if (password.length < 8) {
    return false;
  }
  // 检查是否包含至少一个字母
  const hasLetter = LETTER_CHECK_REGEX.test(password);
  // 检查是否包含至少一个数字
  const hasDigit = DIGIT_CHECK_REGEX.test(password);
  return hasLetter && hasDigit;
}

export async function setPassword(username: string, oldPassword: string, newPassword: string) {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsername(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户名不存在");
    }
    if (oldPassword === newPassword) {
      throw new CustomError("旧密码与新密码相同");
    }
    const isMatch = await checkPassword(user.username, oldPassword);
    if (!isMatch) {
      await auditService.recordAuditLog({
        action: "self.password.change",
        outcome: "failure",
        actorType: "user",
        actorUserId: user.id,
        actorUsername: user.username,
        targetType: "user",
        targetId: user.id,
        targetCode: user.username,
        targetName: user.name,
        details: {
          reason: "invalid_old_password",
        },
      }, tx);
      throw new InvalidOldPasswordError("旧密码错误");
    }
    if (!_validatePasswordStrength(newPassword)) {
      throw new WeakPasswordError("新密码强度过低");
    }
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    await auditService.recordAuditLog({
      action: "self.password.change",
      outcome: "success",
      actorType: "user",
      actorUserId: user.id,
      actorUsername: user.username,
      targetType: "user",
      targetId: user.id,
      targetCode: user.username,
      targetName: user.name,
      details: {
        passwordChanged: true,
      },
    }, tx);
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
      await auditService.recordAuditLog({
        action: "auth.password.reset",
        outcome: "failure",
        actorType: "anonymous",
        targetType: "user",
        targetId: user.id,
        targetCode: user.username,
        targetName: user.name,
        details: {
          phoneNumber: maskMobileForAudit(phone),
          reason: "mobile_mismatch",
        },
      }, tx);
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    if (!await mobileService.checkVerificationCode("resetPassword", phone, code)) {
      await auditService.recordAuditLog({
        action: "auth.password.reset",
        outcome: "failure",
        actorType: "anonymous",
        targetType: "user",
        targetId: user.id,
        targetCode: user.username,
        targetName: user.name,
        details: {
          phoneNumber: maskMobileForAudit(phone),
          reason: "invalid_verification_code",
        },
      }, tx);
      throw new InvalidVerificationCodeError("验证码错误");
    }
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    await auditService.recordAuditLog({
      action: "auth.password.reset",
      outcome: "success",
      actorType: "anonymous",
      targetType: "user",
      targetId: user.id,
      targetCode: user.username,
      targetName: user.name,
      details: {
        phoneNumber: maskMobileForAudit(phone),
        passwordReset: true,
      },
    }, tx);
    return true;
  });
}

export async function checkPassword(username: string, inputPassword: string) {
  const user = await userRepository.getUserByUsername(username);
  if (user === null) {
    throw new UserNotFoundError("用户不存在");
  }
  if (user.password === null && config.NODE_ENV === "production") {
    return false;
  }
  return user.password ? await compare(inputPassword, user.password ?? "") : inputPassword === config.DEFAULT_USER_PASSWORD;
}

export async function getActiveUserByMobile(mobile: string) {
  return await userRepository.getUserByMobile(mobile);
}

export async function pauseEnabledUser(userId: number) {
  return await userRepository.updateEnabledUserStatus(userId, UserStatus.Pause);
}

export async function setMobile(userId: number, phoneNumber: string, code: string) {
  await db.transaction(async (tx) => {
    if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
      throw new InvalidMobileError("无效手机号");
    }
    if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
      throw new MobileAlreadyExistsError("手机号已存在");
    }
    if (!await mobileService.checkVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
      await auditService.recordAuditLog({
        action: "self.mobile.bind",
        outcome: "failure",
        actorType: "user",
        actorUserId: userId,
        targetType: "user",
        targetId: userId,
        targetCode: maskMobileForAudit(phoneNumber),
        details: {
          phoneNumber: maskMobileForAudit(phoneNumber),
          reason: "invalid_verification_code",
        },
      }, tx);
      throw new InvalidVerificationCodeError("验证码错误");
    }
    await userRepository.setMobile(userId, phoneNumber, tx);
    await auditService.recordAuditLog({
      action: "self.mobile.bind",
      outcome: "success",
      actorType: "user",
      actorUserId: userId,
      targetType: "user",
      targetId: userId,
      targetCode: maskMobileForAudit(phoneNumber),
      details: {
        phoneNumber: maskMobileForAudit(phoneNumber),
      },
    }, tx);
  });
  return await getUserDetailById(userId);
}
export async function searchUsers(userQueryDto: UserQueryDto): Promise<UserDto[]> {
  const users = await userRepository.searchUsers(userQueryDto);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  return userDtos;
}

export async function searchUsersWithPrivilegeDelegation(query: UserQueryWithPrivilegeDelegationDto) {
  const [orgCode] = query.ancestorOrgCodes;
  if (query.ancestorOrgCodes.length !== 1 || orgCode === undefined) {
    throw new CustomError("该接口ancestorOrgCodes元素数量只支持为1");
  }
  const users = await userRepository.searchUsers(query);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  const privCode = query.privilegeCode;
  const delegations = (await privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(
    userDtos.map(u => u.username),
    orgCode,
    privCode,
  )).map(pd => toPrivilegeDelegationDto(pd));
  return {
    users: userDtos,
    delegations,
  };
}

export async function getUserDetailById(userId: number): Promise<UserDetailDto> {
  const user = await userRepository.getUserById(userId);
  const userDetail = await _getUserDetail(user);
  return userDetail;
}

export async function getUserDetailByUsername(username: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByUsername(username);
  const userDetail = await _getUserDetail(user);
  return userDetail;
}

export async function getUserDetailByMobile(mobile: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByMobile(mobile);
  const userDetail = await _getUserDetail(user);
  return userDetail;
}

export async function getUserDetailByWxId(wxId: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByWxId(wxId);
  const userDetail = await _getUserDetail(user);
  return userDetail;
}
