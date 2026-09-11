import type { AdminUserAuthorization } from "@admin-api/services/admin-authorization/admin-user-authorization.type";
import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { SubjectAccessMutationReceipt, SubjectAccessOperation } from "@iam/api-core/subject-access";
import type { AdminUserServiceDeps, AdminUserTransactionStorePort } from "./user.port";
import type { User, UserAdminCreateDto, UserDetailDto, UserPaginationQueryDto, UserUpdateDto } from "./user.type";
import { createAdminMutation, runAdminSubjectAccessMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildAdminUserAudit } from "@admin-api/services/audit/events/user.audit";
import { EmploymentDetailDtoSchema, toEmploymentDto } from "@admin-api/services/employment/employment.schema";
import {
  UserDetailDtoSchema,
  UserDtoSchema,
} from "@admin-api/services/user/user.schema";
import { BadRequestError } from "@iam/api-core/errors";
import { requireSubjectAccessOperation } from "@iam/api-core/subject-access";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import {
  UserHasOpenEmploymentError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from "@iam/domain/user";

export function createUserService(deps: AdminUserServiceDeps) {
  const adminMutation = createAdminMutation(deps.uow);
  const userMutationActions = {
    editProfile: {
      operationId: "admin.user.update",
      auditAction: "admin.user.update",
    },
    resetPassword: {
      operationId: "admin.user.resetPassword",
      auditAction: "admin.user.reset_password",
    },
    changeStatus: {
      operationId: "admin.user.updateStatus",
      auditAction: "admin.user.status_update",
    },
  } as const;

  async function assertUserActionAllowed(
    repository: Pick<AdminUserTransactionStorePort, "getOpenEmploymentOrganizationIdsByUserId">,
    user: User,
    authorization: AdminUserAuthorization | undefined,
    action: keyof typeof userMutationActions,
  ) {
    if (authorization?.kind !== "scoped")
      return;
    const openEmploymentOrganizationIds = await repository
      .getOpenEmploymentOrganizationIdsByUserId(user.id);
    const decision = authorization.getAllowedActions({
      status: user.status,
      isDelete: user.isDelete,
      openEmploymentOrganizationIds,
      endedEmploymentOrganizationIds: [],
    })[action];
    if (!decision.allowed) {
      authorization.denyMutation({
        operationId: userMutationActions[action].operationId,
        resourceIdentifier: user.username,
        reason: decision.reason,
      });
    }
  }

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

  async function getUserDetailForPermittedAdmin(
    operation: SubjectAccessOperation,
    subjectIdentifier: string,
  ): Promise<UserDetailDto> {
    requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier);
    const user = await deps.userRepository.getUserBySubjectIdentifierForPermittedAdmin(subjectIdentifier);
    if (user === null)
      throw new UserNotFoundError("用户不存在");
    const detail = await getUserDetailForAdmin(user);
    requireSubjectAccessOperation(operation).requirePermission(subjectIdentifier);
    return detail;
  }

  async function getUserDetailForAdmin(user: Parameters<typeof UserDetailDtoSchema.parse>[0]) {
    const userDto = UserDetailDtoSchema.parse(user);
    const employments = await deps.employmentRepository.getAllEmploymentsByUserIdForAdmin(userDto.id);
    const rolesByEmployment = await deps.roleAssignmentResolver.resolveEffectiveRoles({
      employmentIds: employments.map(employment => employment.id),
    });
    const employmentDtos = [];
    const roleIds = [...new Set([...rolesByEmployment.values()].flatMap(roles => roles.map(role => role.id)))];
    const roleNames = new Map((await deps.roleRepository.getRoleNamesByIds(roleIds))
      .map(role => [role.roleCode, role.roleName]));
    for (const employment of employments) {
      const roles = rolesByEmployment.get(employment.id) ?? [];
      const privileges = await deps.privilegeRepository.getPrivilegesByRoleIds(roles.map(r => r.id));
      const employmentDto = EmploymentDetailDtoSchema.parse(toEmploymentDto(employment));
      employmentDto.roles = roles.map(r => r.roleCode);
      employmentDto.privileges = privileges.map(p => p.privilegeCode);
      employmentDto.roleNames = Object.fromEntries(roles.flatMap((role) => {
        const name = roleNames.get(role.roleCode);
        return name === undefined ? [] : [[role.roleCode, name]];
      }));
      employmentDto.privilegeNames = Object.fromEntries(privileges.map(p => [p.privilegeCode, p.privilegeName]));
      employmentDtos.push(employmentDto);
    }
    userDto.employments = employmentDtos;
    const currentEmploymentDtos = employmentDtos.filter(e => e.status === EmploymentStatus.Enable);
    userDto.roles = [...new Set(currentEmploymentDtos.flatMap(e => e.roles))];
    userDto.privileges = [...new Set(currentEmploymentDtos.flatMap(e => e.privileges))];
    userDto.roleNames = Object.fromEntries(currentEmploymentDtos.flatMap(e => Object.entries(e.roleNames)));
    userDto.privilegeNames = Object.fromEntries(currentEmploymentDtos.flatMap(e => Object.entries(e.privilegeNames)));
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
  ) {
    const existing = await deps.userRepository.getAnyUserByUsername(dto.username);
    if (existing !== null) {
      throw new UsernameAlreadyExistsError("用户名已存在");
    }
    const subjectIdentifier = deps.random.uuid();
    const disposition = (dto.status ?? UserStatus.Enable) === UserStatus.Enable
      ? "awaiting_publication"
      : "disabled";
    return await runAdminSubjectAccessMutation(deps.subjectAccessLifecycle, {
      subjectIdentifier,
      disposition,
      mutate: async receipt => await adminMutation.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
            const existing = await tx.userRepository.getAnyUserByUsername(dto.username);
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
            if (createdUser === null)
              throw new Error("User insert returned no row");
            await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.create", createdUser, {
              changed: true,
              userType: dto.userType,
              status: dto.status ?? UserStatus.Enable,
              orderNum: dto.orderNum ?? 0,
              passwordProvided: dto.password !== undefined,
            }, auditContext));
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: createdUser.id },
            ]);
            return {
              changed: true,
              result: {
                user: UserDtoSchema.parse(createdUser),
                username: createdUser.username,
                generatedPassword: dto.password ? null : plainPassword,
              },
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
    authorization?: AdminUserAuthorization,
    authorizationAction: "editProfile" | "changeStatus" = "editProfile",
  ) {
    if (!Object.values(data).some(value => value !== undefined))
      throw new BadRequestError("至少提交一个用户更新字段");
    const existing = authorization?.kind === "scoped" && data.status !== undefined
      ? await deps.userRepository.getUserByUsernameIncludingDeletedForAuthorization(username)
      : await deps.userRepository.getUserByUsernameForAdmin(username);
    if (existing === null && authorization?.kind !== "scoped") {
      throw new UserNotFoundError("用户不存在");
    }

    const mutate = async (receipt?: SubjectAccessMutationReceipt) => {
      return await adminMutation.locked(
        tx => tx.userRepository.lockUserByUsername(username, authorization?.kind === "scoped"),
        () => new UserNotFoundError("用户不存在"),
        async (tx, current) => {
          const mutation = async () => {
            await assertUserActionAllowed(
              tx.userRepository,
              current,
              authorization,
              authorizationAction,
            );
            const changed = (data.name !== undefined && data.name !== current.name)
              || (data.mobile !== undefined && data.mobile !== current.mobile)
              || (data.wxId !== undefined && data.wxId !== current.wxId)
              || (data.userType !== undefined && data.userType !== current.userType)
              || (data.status !== undefined && data.status !== current.status)
              || (data.orderNum !== undefined && data.orderNum !== current.orderNum);
            const updatedUser = changed
              ? await tx.userRepository.updateUserByUsername(username, data)
              : current;
            if (updatedUser === null) {
              if (authorization?.kind === "scoped") {
                authorization.denyMutation({
                  operationId: userMutationActions[authorizationAction].operationId,
                  resourceIdentifier: username,
                  reason: "USER_NOT_HR_MANAGED",
                });
              }
              throw new Error("Locked User update returned no row");
            }
            if (changed || data.status !== undefined) {
              await tx.auditService.recordAuditLog(buildAdminUserAudit(
                userMutationActions[authorizationAction].auditAction,
                updatedUser,
                {
                  patch: data,
                  changed,
                },
                auditContext,
              ));
            }
            if (changed) {
              await tx.userProfileInvalidation.recordChanges([
                { kind: "user", userId: current.id },
              ]);
            }
            return {
              changed,
              result: {
                current,
                disposition: current.status === updatedUser.status
                  ? "restore_previous" as const
                  : updatedUser.status === UserStatus.Enable
                    ? "awaiting_publication" as const
                    : "disabled" as const,
              },
            };
          };
          if (receipt === undefined)
            return await mutation();
          return await tx.subjectAccessMutation.runMutation(
            receipt,
            mutation,
            result => result.result.disposition === "restore_previous"
              ? "rollback"
              : result.result.disposition === "disabled"
                ? "disabled"
                : "enabled",
          );
        },
        adminAuditTransactionOptions(auditContext),
      );
    };

    if (data.status !== undefined) {
      if (existing === null)
        throw new UserNotFoundError("用户不存在");
      await assertUserActionAllowed(
        deps.userRepository,
        existing,
        authorization,
        authorizationAction,
      );
      const result = await runAdminSubjectAccessMutation<Awaited<ReturnType<typeof mutate>>>(deps.subjectAccessLifecycle, {
        subjectIdentifier: existing.subjectIdentifier,
        disposition: result => result.result.disposition,
        mutate: async receipt => await mutate(receipt),
        revokeSessions: async (result, context) => {
          await deps.sessionRevocation.revokeUserSessions({
            userId: result.result.current.id,
            subjectIdentifier: result.result.current.subjectIdentifier,
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
      return { changed: result.changed, result: null };
    }

    const result = await mutate();
    return { changed: result.changed, result: null };
  }

  async function updateUserStatus(
    username: string,
    status: UserStatus,
    auditContext?: AdminAuditContext,
    authorization?: AdminUserAuthorization,
  ) {
    return await updateUser(
      username,
      { status },
      auditContext,
      authorization,
      "changeStatus",
    );
  }

  async function deleteUser(username: string, auditContext?: AdminAuditContext) {
    const existing = await deps.userRepository.getUserByUsernameForAdmin(username);
    if (existing === null) {
      throw new UserNotFoundError("用户不存在");
    }
    return await runAdminSubjectAccessMutation(deps.subjectAccessLifecycle, {
      subjectIdentifier: existing.subjectIdentifier,
      disposition: "disabled",
      mutate: async receipt => await adminMutation.locked(
        tx => tx.userRepository.lockUserByUsername(username),
        () => new UserNotFoundError("用户不存在"),
        async (tx, current) => await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
            const openEmployments = await tx.userRepository.countOpenEmploymentsByUsername(username);
            if (openEmployments > 0) {
              throw new UserHasOpenEmploymentError();
            }
            const deletedUser = await tx.userRepository.softDeleteUserByUsername(username);
            if (deletedUser === null)
              throw new Error("Locked User delete returned no row");
            await tx.auditService.recordAuditLog(buildAdminUserAudit("admin.user.delete", deletedUser, {
              changed: true,
              deleted: true,
            }, auditContext));
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: current.id },
            ]);
            return { changed: true, result: null };
          },
          () => "disabled",
        ),
        adminAuditTransactionOptions(auditContext),
      ),
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
  }

  async function resetPasswordByUsername(
    username: string,
    auditContext?: AdminAuditContext,
    authorization?: AdminUserAuthorization,
  ) {
    return await adminMutation.locked(
      tx => tx.userRepository.lockUserByUsername(username, authorization?.kind === "scoped"),
      () => new UserNotFoundError("用户不存在"),
      async (tx, user) => {
        await assertUserActionAllowed(
          tx.userRepository,
          user,
          authorization,
          "resetPassword",
        );
        const newPassword = deps.random.password(8);
        const newPasswordHash = await deps.passwordHasher.hashPassword(newPassword);
        const updatedUser = await tx.userRepository.setPassword(user.id, newPasswordHash);
        if (updatedUser === null)
          throw new UserNotFoundError("用户不存在或状态不可用");
        await tx.auditService.recordAuditLog(buildAdminUserAudit(userMutationActions.resetPassword.auditAction, user, {
          passwordReset: true,
          changed: true,
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
        return { changed: true, result: newPassword };
      },
      adminAuditTransactionOptions(auditContext),
    );
  }

  return {
    deleteUser,
    getUserDetailForPermittedAdmin,
    getUserDetailByUsernameForAdmin,
    resetPasswordByUsername,
    searchUsersFuzzyForAdmin,
    setUserForAdmin,
    updateUser,
    updateUserStatus,
  };
}

export type UserService = ReturnType<typeof createUserService>;
