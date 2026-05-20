import type { UserAdminCreateDto, UserDetailDto, UserPaginationQueryDto, UserUpdateDto } from "./user.type";
import config from "@admin-api/env";
import * as employmentRepository from "@admin-api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import * as privilegeRepository from "@admin-api/services/privilege/privilege.repository";
import * as roleRepository from "@admin-api/services/role/role.repository";
import * as userRepository from "@admin-api/services/user/user.repository";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@admin-api/services/user/user.schema";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { UserHasActiveEmploymentError } from "@iam/api-core/errors/UserHasActiveEmploymentError";
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import { generateRandomPassword } from "@iam/api-core/utils";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import db from "@iam/db";
import { hash } from "bcrypt-ts";

export async function getUserDetailByUsernameForAdmin(username: string): Promise<UserDetailDto> {
  const user = await userRepository.getUserByUsernameForAdmin(username);
  if (user === null) {
    throw new UserNotFoundError("用户不存在");
  }
  const userDto = UserDetailDtoSchema.parse(user);
  const employments = await employmentRepository.getAllEmploymentsByUserIdForAdmin(userDto.id);
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
  const currentEmploymentDtos = employmentDtos.filter(e => e.status === EmploymentStatus.Enable);
  userDto.roles = [...new Set(currentEmploymentDtos.flatMap(e => e.roles))];
  userDto.privileges = [...new Set(currentEmploymentDtos.flatMap(e => e.privileges))];
  return userDto;
}

export async function searchUsersFuzzyForAdmin(userPageQuery: UserPaginationQueryDto) {
  const { rows, total } = await userRepository.searchUsersFuzzyPaged(userPageQuery);
  const result = rows.map(u => UserDtoSchema.parse(u));
  const pages = total === 0 ? 0 : Math.ceil(total / userPageQuery.pageSize);
  return {
    result,
    total,
    pageNum: userPageQuery.pageNum,
    pageSize: userPageQuery.pageSize,
    pages,
  };
}

export async function setUserForAdmin(
  dto: UserAdminCreateDto,
): Promise<{ username: string; generatedPassword: string | null }> {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(dto.username, tx);
    if (existing !== null) {
      throw new CustomError("用户名已存在");
    }
    const plainPassword = dto.password ?? generateRandomPassword(8);
    const passwordHash = await hash(plainPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setUserForAdmin(
      {
        username: dto.username,
        name: dto.name,
        userType: dto.userType,
        password: passwordHash,
        mobile: dto.mobile ?? null,
        wxId: dto.wxId ?? null,
        status: dto.status ?? UserStatus.Enable,
        orderNum: dto.orderNum ?? 0,
      },
      tx,
    );
    return {
      username: dto.username,
      generatedPassword: dto.password ? null : plainPassword,
    };
  });
}

export async function updateUser(
  username: string,
  data: UserUpdateDto,
) {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    await userRepository.updateUserByUsername(username, data, tx);
    return true;
  });
}

export async function updateUserStatus(username: string, status: UserStatus) {
  return await updateUser(username, { status });
}

export async function deleteUser(username: string) {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const activeEmps = await userRepository.countActiveEmploymentsByUsername(username, tx);
    if (activeEmps > 0) {
      throw new UserHasActiveEmploymentError();
    }
    await userRepository.softDeleteUserByUsername(username, tx);
    return true;
  });
}

export async function resetPasswordByUsername(username: string): Promise<string> {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const newPassword = generateRandomPassword(8);
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    return newPassword;
  });
}
