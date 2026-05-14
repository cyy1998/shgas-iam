import type { User } from "@iam/db/schema";

import type { UserDetailDto, UserDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import config from "@api/env";
import * as employmentRepository from "@api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, EmploymentDtoConverterSchema } from "@api/services/employment/employment.schema";
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
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import db from "@iam/db";
import { compare, hash } from "bcrypt-ts";
import { PrivilegeDelegationDtoConverterSchema } from "../privilege/privilegeDelegation.schema";

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
    const employmentDto = EmploymentDetailDtoSchema.parse(EmploymentDtoConverterSchema.parse(employment));
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
      throw new CustomError("旧密码错误");
    }
    if (!_validatePasswordStrength(newPassword)) {
      throw new CustomError("新密码强度过低");
    }
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
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
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    if (!await mobileService.checkVerificationCode("resetPassword", phone, code)) {
      throw new UserNotFoundError("验证码错误");
    }
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
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

export async function setMobile(userId: number, phoneNumber: string, code: string) {
  await db.transaction(async (tx) => {
    if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
      throw new CustomError("无效手机号");
    }
    if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
      throw new CustomError("手机号已存在");
    }
    if (!await mobileService.checkVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
      throw new CustomError("验证码错误");
    }
    await userRepository.setMobile(userId, phoneNumber, tx);
  });
  return await getUserDetailById(userId);
}
export async function searchUsers(userQueryDto: UserQueryDto): Promise<UserDto[]> {
  const users = await userRepository.searchUsers(userQueryDto);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  return userDtos;
}

export async function searchUsersWithPrivilegeDelegation(query: UserQueryWithPrivilegeDelegationDto) {
  if (query.ancestorOrgCodes.length !== 1) {
    throw new CustomError("该接口ancestorOrgCodes元素数量只支持为1");
  }
  const users = await userRepository.searchUsers(query);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  const orgCode = query.ancestorOrgCodes[0] as string;
  const privCode = query.privilegeCode;
  const delegations = (await privilegeDelegationRepository.getDelegationsByUserAndOrganizationScopeAndPrivilege(
    userDtos.map(u => u.username),
    orgCode,
    privCode,
  )).map(pd => PrivilegeDelegationDtoConverterSchema.parse(pd));
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
