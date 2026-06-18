import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { AdminUserServiceDeps } from "./user.port";
import type { UserAdminCreateDto, UserDetailDto, UserPaginationQueryDto, UserUpdateDto } from "./user.type";
import { buildAdminUserAudit } from "@admin-api/services/audit/events/user.audit";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@admin-api/services/user/user.schema";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import {
  UserHasActiveEmploymentError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from "@iam/domain/user";

export function createUserService(deps: AdminUserServiceDeps) {
  async function getUserDetailByUsernameForAdmin(username: string): Promise<UserDetailDto> {
    const user = await deps.userRepository.getUserByUsernameForAdmin(username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    const userDto = UserDetailDtoSchema.parse(user);
    const employments = await deps.employmentRepository.getAllEmploymentsByUserIdForAdmin(userDto.id);
    const employmentDtos = [];
    for (const employment of employments) {
      const roles = await deps.roleRepository.getRolesByEmploymentId(employment.id);
      const privileges = await deps.privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
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

  async function searchUsersFuzzyForAdmin(userPageQuery: UserPaginationQueryDto) {
    const { rows, total } = await deps.userRepository.searchUsersFuzzyPaged(userPageQuery);
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

  async function setUserForAdmin(
    dto: UserAdminCreateDto,
    auditContext?: AdminAuditContext,
  ): Promise<{ username: string; generatedPassword: string | null }> {
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.userRepository.getUserByUsernameForAdmin(dto.username);
      if (existing !== null) {
        throw new UsernameAlreadyExistsError("用户名已存在");
      }
      const plainPassword = dto.password ?? deps.random.password(8);
      const passwordHash = await deps.passwordHasher.hashPassword(plainPassword);
      const createdUser = await tx.userRepository.setUserForAdmin({
        username: dto.username,
        name: dto.name,
        userType: dto.userType,
        password: passwordHash,
        mobile: dto.mobile ?? null,
        wxId: dto.wxId ?? null,
        status: dto.status ?? UserStatus.Enable,
        orderNum: dto.orderNum ?? 0,
      });
      await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.create", createdUser, {
        userType: dto.userType,
        status: dto.status ?? UserStatus.Enable,
        orderNum: dto.orderNum ?? 0,
        passwordProvided: dto.password !== undefined,
      }, auditContext));
      return {
        username: dto.username,
        generatedPassword: dto.password ? null : plainPassword,
      };
    });
  }

  async function updateUser(
    username: string,
    data: UserUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.user.update",
  ) {
    const userId = await deps.uow.transaction(async (tx) => {
      const existing = await tx.userRepository.getUserByUsernameForAdmin(username);
      if (existing === null) {
        throw new UserNotFoundError("用户不存在");
      }
      const updatedUser = await tx.userRepository.updateUserByUsername(username, data);
      await tx.auditService.recordAuditLog(buildAdminUserAudit(action, updatedUser, {
        patch: data,
      }, auditContext));
      return existing.id;
    });
    if (data.status !== undefined && data.status !== UserStatus.Enable)
      await deps.tokenRevocation.revokeUserTokens(userId);
    return true;
  }

  async function updateUserStatus(username: string, status: UserStatus, auditContext?: AdminAuditContext) {
    return await updateUser(username, { status }, auditContext, "admin.user.status_update");
  }

  async function deleteUser(username: string, auditContext?: AdminAuditContext) {
    const userId = await deps.uow.transaction(async (tx) => {
      const existing = await tx.userRepository.getUserByUsernameForAdmin(username);
      if (existing === null) {
        throw new UserNotFoundError("用户不存在");
      }
      const activeEmps = await tx.userRepository.countActiveEmploymentsByUsername(username);
      if (activeEmps > 0) {
        throw new UserHasActiveEmploymentError();
      }
      const deletedUser = await tx.userRepository.softDeleteUserByUsername(username);
      await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.delete", deletedUser, {
        deleted: true,
      }, auditContext));
      return existing.id;
    });
    await deps.tokenRevocation.revokeUserTokens(userId);
    return true;
  }

  async function resetPasswordByUsername(username: string, auditContext?: AdminAuditContext): Promise<string> {
    return await deps.uow.transaction(async (tx) => {
      const user = await tx.userRepository.getUserByUsernameForAdmin(username);
      if (user === null) {
        throw new UserNotFoundError("用户不存在");
      }
      const newPassword = deps.random.password(8);
      const newPasswordHash = await deps.passwordHasher.hashPassword(newPassword);
      await tx.userRepository.setPassword(user.id, newPasswordHash);
      await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.reset_password", user, {
        passwordReset: true,
      }, auditContext));
      return newPassword;
    });
  }

  return {
    deleteUser,
    getUserDetailByUsernameForAdmin,
    resetPasswordByUsername,
    searchUsersFuzzyForAdmin,
    setUserForAdmin,
    updateUser,
    updateUserStatus,
  };
}

export type UserService = ReturnType<typeof createUserService>;
