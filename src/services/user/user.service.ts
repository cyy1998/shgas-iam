import type { UserCreateDto, UserDetailDto, UserDto, UserPaginationQueryDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";

import type { User } from "@/db/generated/prisma/client";
import type { Prettify } from "@/utils/lint.util";
import { VerificationCodeUsage } from "@enums/verificationCode.usage";
import { CustomError } from "@errors/CustomError";
import { UserNotFoundError } from "@errors/UserNotFoundError";
import { compare, hash } from "bcrypt-ts";
import { prisma } from "@/db";
import config from "@/env";
import * as employmentRepository from "@/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, EmploymentDtoConverterSchema } from "@/services/employment/employment.schema";
import * as mobileService from "@/services/mobile/mobile.service";
import * as privilegeRepository from "@/services/privilege/privilege.repository";
import * as privilegeDelegationRepository from "@/services/privilege/privilegeDelegation.repository";
import * as roleRepository from "@/services/role/role.repository";
import * as userRepository from "@/services/user/user.repository";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@/services/user/user.schema";
import { paginate } from "@/utils/page.util";
import { PrivilegeDelegationDtoConverterSchema } from "../privilege/privilege.schema";

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
  return await prisma.$transaction(async (tx) => {
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
  return await prisma.$transaction(async (tx) => {
    const user = await userRepository.getUserByUsername(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    if (user.mobile !== phone) {
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    if (!mobileService.cehckVerificationCode("resetPassword", phone, code)) {
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
  await prisma.$transaction(async (tx) => {
    if (!mobileService.checkValidPhoneNumber(phoneNumber)) {
      throw new CustomError("无效手机号");
    }
    if (await mobileService.checkExistingPhoneNumber(phoneNumber)) {
      throw new CustomError("手机号已存在");
    }
    if (!await mobileService.cehckVerificationCode(VerificationCodeUsage.BindPhone, phoneNumber, code)) {
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

export async function searchUsersFuzzy(userPageQuery: UserPaginationQueryDto) {
  const users = await userRepository.searchUsersFuzzy(userPageQuery);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  return paginate(userDtos, userPageQuery);
}

export async function searchUsersWithPrivilegeDelegation(
  userQueryWithPrivilegeDelegationDto: UserQueryWithPrivilegeDelegationDto,
) {
  if (userQueryWithPrivilegeDelegationDto.ancestorOrgCodes.length !== 1) {
    throw new CustomError("该接口ancestorOrgCodes元素数量只支持为1");
  }
  const users = await userRepository.searchUsers(userQueryWithPrivilegeDelegationDto);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  const orgCode = userQueryWithPrivilegeDelegationDto.ancestorOrgCodes[0] as string;
  const privCode = userQueryWithPrivilegeDelegationDto.privilegeCode;
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

export async function getOtherUsersByOrg(orgCode: string, userId: number) {
  const users = await userRepository.getOtherUsersByOrgAndAllSub(userId, orgCode);
  const userDtos = users.map(u => UserDtoSchema.parse(u));
  return userDtos;
}

export async function setUsers(userCreateDtos: Prettify<UserCreateDto>[]) {
  return await prisma.$transaction(async (tx) => {
    const existingUsers = await userRepository.searchUsers({ usernames: userCreateDtos.map(u => u.username) }, tx);
    if (existingUsers.length !== 0) {
      throw new CustomError("相同用户名已被注册");
    }
    for (const u of userCreateDtos) {
      if (u.password !== null) {
        u.password = await hash(u.password, config.PASSWORD_HASH_ROUNDS);
      }
    }
    await userRepository.setUsers(userCreateDtos, tx);
    return true;
  });
}
