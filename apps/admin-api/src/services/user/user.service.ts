import type { AuditLogInput } from "@admin-api/services/audit/audit.service";
import type { UserAdminCreateDto, UserDetailDto, UserPaginationQueryDto, UserUpdateDto } from "./user.type";
import config from "@admin-api/env";
import * as auditService from "@admin-api/services/audit/audit.service";
import * as employmentRepository from "@admin-api/services/employment/employment.repository";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import * as privilegeRepository from "@admin-api/services/privilege/privilege.repository";
import * as roleRepository from "@admin-api/services/role/role.repository";
import * as userRepository from "@admin-api/services/user/user.repository";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@admin-api/services/user/user.schema";
import { UserHasActiveEmploymentError } from "@iam/api-core/errors/UserHasActiveEmploymentError";
import { UsernameAlreadyExistsError } from "@iam/api-core/errors/UsernameAlreadyExistsError";
import { UserNotFoundError } from "@iam/api-core/errors/UserNotFoundError";
import { generateRandomPassword } from "@iam/api-core/utils";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import db from "@iam/db";
import { hash } from "bcrypt-ts";

type AdminAuditContext = Pick<AuditLogInput, "actorType"> & Partial<AuditLogInput>;
type UserAuditTarget = {
  id: number;
  username: string;
  name?: string | null;
  mobile?: string | null;
  status?: UserStatus;
};

function maskMobileForAudit(phoneNumber: string | null | undefined) {
  return phoneNumber?.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") ?? null;
}

function resolveAuditContext(auditContext?: AdminAuditContext): AdminAuditContext {
  return auditContext ?? {
    actorType: "system",
    actorSystemKey: "admin-api",
  };
}

async function recordAdminUserAudit(
  action: string,
  user: UserAuditTarget,
  details: Record<string, unknown>,
  tx: Parameters<typeof auditService.recordAuditLog>[1],
  auditContext?: AdminAuditContext,
) {
  await auditService.recordAuditLog({
    ...resolveAuditContext(auditContext),
    action,
    outcome: "success",
    targetType: "user",
    targetId: user.id,
    targetCode: user.username,
    targetName: user.name,
    details: {
      targetUsername: user.username,
      targetName: user.name,
      targetMobile: maskMobileForAudit(user.mobile),
      ...details,
    },
  }, tx);
}

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
  auditContext?: AdminAuditContext,
): Promise<{ username: string; generatedPassword: string | null }> {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(dto.username, tx);
    if (existing !== null) {
      throw new UsernameAlreadyExistsError("用户名已存在");
    }
    const plainPassword = dto.password ?? generateRandomPassword(8);
    const passwordHash = await hash(plainPassword, config.PASSWORD_HASH_ROUNDS);
    const createdUser = await userRepository.setUserForAdmin(
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
    await recordAdminUserAudit("admin.user.create", createdUser, {
      userType: dto.userType,
      status: dto.status ?? UserStatus.Enable,
      orderNum: dto.orderNum ?? 0,
      passwordProvided: dto.password !== undefined,
    }, tx, auditContext);
    return {
      username: dto.username,
      generatedPassword: dto.password ? null : plainPassword,
    };
  });
}

export async function updateUser(
  username: string,
  data: UserUpdateDto,
  auditContext?: AdminAuditContext,
  action = "admin.user.update",
) {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const updatedUser = await userRepository.updateUserByUsername(username, data, tx);
    const patch: Record<string, unknown> = { ...data };
    if ("mobile" in data) {
      patch.mobile = maskMobileForAudit(data.mobile);
    }
    await recordAdminUserAudit(action, updatedUser, {
      patch,
    }, tx, auditContext);
    return true;
  });
}

export async function updateUserStatus(username: string, status: UserStatus, auditContext?: AdminAuditContext) {
  return await updateUser(username, { status }, auditContext, "admin.user.status_update");
}

export async function deleteUser(username: string, auditContext?: AdminAuditContext) {
  return await db.transaction(async (tx) => {
    const existing = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const activeEmps = await userRepository.countActiveEmploymentsByUsername(username, tx);
    if (activeEmps > 0) {
      throw new UserHasActiveEmploymentError();
    }
    const deletedUser = await userRepository.softDeleteUserByUsername(username, tx);
    await recordAdminUserAudit("admin.user.delete", deletedUser, {
      deleted: true,
    }, tx, auditContext);
    return true;
  });
}

export async function resetPasswordByUsername(username: string, auditContext?: AdminAuditContext): Promise<string> {
  return await db.transaction(async (tx) => {
    const user = await userRepository.getUserByUsernameForAdmin(username, tx);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const newPassword = generateRandomPassword(8);
    const newPasswordHash = await hash(newPassword, config.PASSWORD_HASH_ROUNDS);
    await userRepository.setPassword(user.id, newPasswordHash, tx);
    await recordAdminUserAudit("admin.user.reset_password", user, {
      passwordReset: true,
    }, tx, auditContext);
    return newPassword;
  });
}
