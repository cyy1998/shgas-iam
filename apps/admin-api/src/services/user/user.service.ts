import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import type { AdminUserServiceDeps } from "./user.port";
import type { UserAdminCreateDto, UserDetailDto, UserPaginationQueryDto, UserUpdateDto } from "./user.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
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
  function currentPrincipalSessionException(userId: number, auditContext?: AdminAuditContext) {
    if (auditContext?.actorType !== "admin" || auditContext.actorUserId !== userId)
      return undefined;
    return auditContext.principalSessionId ?? undefined;
  }

  async function getUserDetailByUsernameForAdmin(username: string): Promise<UserDetailDto> {
    const user = await deps.userRepository.getUserByUsernameForAdmin(username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    return await getUserDetailForAdmin(user);
  }

  async function getUserDetailBySubjectIdentifierForAdmin(
    subjectIdentifier: string,
  ): Promise<UserDetailDto> {
    const user = await deps.userRepository.getUserBySubjectIdentifierForAdmin(subjectIdentifier);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    return await getUserDetailForAdmin(user);
  }

  async function getUserDetailForAdmin(user: Parameters<typeof UserDetailDtoSchema.parse>[0]) {
    const userDto = UserDetailDtoSchema.parse(user);
    const employments = await deps.employmentRepository.getAllEmploymentsByUserIdForAdmin(userDto.id);
    const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
      employmentIds: employments.map(employment => employment.id),
    });
    const employmentDtos = [];
    for (const employment of employments) {
      const roles = rolesByEmployment.get(employment.id) ?? [];
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
    const existing = await deps.userRepository.getUserByUsernameForAdmin(dto.username);
    if (existing !== null) {
      throw new UsernameAlreadyExistsError("用户名已存在");
    }
    const subjectIdentifier = deps.random.uuid();
    const disposition = (dto.status ?? UserStatus.Enable) === UserStatus.Enable
      ? "awaiting_publication"
      : "disabled";
    return await deps.subjectAccessLifecycle.run({
      subjectIdentifier,
      disposition,
      mutate: async receipt => await deps.uow.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
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
              subjectIdentifier,
            });
            await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.create", createdUser, {
              userType: dto.userType,
              status: dto.status ?? UserStatus.Enable,
              orderNum: dto.orderNum ?? 0,
              passwordProvided: dto.password !== undefined,
            }, auditContext));
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: createdUser.id },
            ]);
            return {
              username: dto.username,
              generatedPassword: dto.password ? null : plainPassword,
            };
          },
          () => disposition === "disabled" ? "disabled" : "enabled",
        ), adminAuditTransactionOptions(auditContext)),
      observability: {
        requestId: auditContext?.requestId ?? undefined,
        traceId: auditContext?.traceId ?? undefined,
      },
    });
  }

  async function updateUser(
    username: string,
    data: UserUpdateDto,
    auditContext?: AdminAuditContext,
    action = "admin.user.update",
  ) {
    const existing = await deps.userRepository.getUserByUsernameForAdmin(username);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }

    const mutate = async (receipt?: SubjectAccessMutationReceipt) => {
      return await deps.uow.transaction(async (tx) => {
        const mutation = async () => {
          const current = await tx.userRepository.getUserByUsernameForAdmin(username);
          if (current === null) {
            throw new UserNotFoundError("用户不存在");
          }
          const updatedUser = await tx.userRepository.updateUserByUsername(username, data);
          await tx.auditService.recordAuditLog(buildAdminUserAudit(action, updatedUser, {
            patch: data,
          }, auditContext));
          await tx.userProfileInvalidation.recordChanges([
            { kind: "user", userId: current.id },
          ]);
          return {
            current,
            disposition: current.status === updatedUser.status
              ? "restore_previous" as const
              : updatedUser.status === UserStatus.Enable
                ? "awaiting_publication" as const
                : "disabled" as const,
            value: true as const,
          };
        };
        if (receipt === undefined)
          return await mutation();
        return await tx.subjectAccessMutation.runMutation(
          receipt,
          mutation,
          result => result.disposition === "restore_previous"
            ? "rollback"
            : result.disposition === "disabled"
              ? "disabled"
              : "enabled",
        );
      }, adminAuditTransactionOptions(auditContext));
    };

    if (data.status !== undefined) {
      const result = await deps.subjectAccessLifecycle.run<Awaited<ReturnType<typeof mutate>>>({
        subjectIdentifier: existing.subjectIdentifier,
        disposition: result => result.disposition,
        mutate: async receipt => await mutate(receipt),
        revokeSessions: async (result, context) => {
          await deps.sessionRevocation.revokeUserSessions({
            userId: result.current.id,
            subjectIdentifier: result.current.subjectIdentifier,
            reason: "user_disabled",
            onlySubjectAccessTransitionId:
              context.invalidatedSubjectAccessTransitionId,
            auditContext,
          });
        },
        observability: {
          requestId: auditContext?.requestId ?? undefined,
          traceId: auditContext?.traceId ?? undefined,
        },
      });
      return result.value;
    }

    return (await mutate()).value;
  }

  async function updateUserStatus(username: string, status: UserStatus, auditContext?: AdminAuditContext) {
    return await updateUser(username, { status }, auditContext, "admin.user.status_update");
  }

  async function deleteUser(username: string, auditContext?: AdminAuditContext) {
    const existing = await deps.userRepository.getUserByUsernameForAdmin(username);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    await deps.subjectAccessLifecycle.run({
      subjectIdentifier: existing.subjectIdentifier,
      disposition: "disabled",
      mutate: async receipt => await deps.uow.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
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
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: existing.id },
            ]);
          },
          () => "disabled",
        ), adminAuditTransactionOptions(auditContext)),
      revokeSessions: async (_result, context) => {
        await deps.sessionRevocation.revokeUserSessions({
          userId: existing.id,
          subjectIdentifier: existing.subjectIdentifier,
          reason: "user_deleted",
          onlySubjectAccessTransitionId:
            context.invalidatedSubjectAccessTransitionId,
          auditContext,
        });
      },
      observability: {
        requestId: auditContext?.requestId ?? undefined,
        traceId: auditContext?.traceId ?? undefined,
      },
    });
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
      tx.afterCommit.bestEffort("admin.session_revoke.user", async () => {
        await deps.sessionRevocation.revokeUserSessions({
          userId: user.id,
          subjectIdentifier: user.subjectIdentifier,
          reason: "admin_revoke",
          exceptPrincipalSessionId: currentPrincipalSessionException(user.id, auditContext),
          auditContext,
        });
      });
      return newPassword;
    }, adminAuditTransactionOptions(auditContext));
  }

  return {
    deleteUser,
    getUserDetailBySubjectIdentifierForAdmin,
    getUserDetailByUsernameForAdmin,
    resetPasswordByUsername,
    searchUsersFuzzyForAdmin,
    setUserForAdmin,
    updateUser,
    updateUserStatus,
  };
}

export type UserService = ReturnType<typeof createUserService>;
