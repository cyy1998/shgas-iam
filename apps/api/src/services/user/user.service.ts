import type { UserRequestOptions, UserServiceDeps } from "./user.port";
import type { UserDetailDto, UserDto, UserQueryDto, UserQueryWithPrivilegeDelegationDto } from "./user.type";
import { VerificationCodeUsage } from "@api/enums/verificationCode.usage";
import { withApiRequestContext } from "@api/services/audit/audit.service";
import {
  buildMobileBindSuccessAudit,
  buildPasswordResetFailureAudit,
  buildPasswordResetSuccessAudit,
  buildSelfPasswordChangeFailureAudit,
  buildSelfPasswordChangeSuccessAudit,
} from "@api/services/audit/events/self-user.audit";
import { CustomError } from "@iam/api-core/errors/CustomError";
import { InvalidVerificationCodeError } from "@iam/api-core/errors/InvalidVerificationCodeError";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { InvalidOldPasswordError, UserNotFoundError } from "@iam/domain/user";

export function createUserService(deps: UserServiceDeps) {
  async function setPassword(
    username: string,
    oldPassword: string,
    newPassword: string,
    options: UserRequestOptions = {},
  ) {
    return await deps.uow.transaction(async (tx) => {
      const user = await tx.userRepository.getUserByUsername(username);
      if (user === null) {
        throw new UserNotFoundError("用户名不存在");
      }
      if (oldPassword === newPassword) {
        throw new CustomError("旧密码与新密码相同");
      }
      const isMatch = await deps.passwordHelper.verifyUserPassword(user, oldPassword);
      if (!isMatch) {
        await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
          options.requestContext,
          buildSelfPasswordChangeFailureAudit(user),
        ));
        throw new InvalidOldPasswordError("旧密码错误");
      }
      deps.passwordHelper.assertStrongPassword(newPassword);
      const newPasswordHash = await deps.passwordHelper.hashUserPassword(newPassword);
      await tx.userRepository.setPassword(user.id, newPasswordHash);
      await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildSelfPasswordChangeSuccessAudit(user),
      ));
      return true;
    }, { observability: options.requestContext });
  }

  async function resetPassword(
    username: string,
    phone: string,
    code: string,
    newPassword: string,
    options: UserRequestOptions = {},
  ) {
    const user = await deps.userRepository.getUserByUsername(username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    if (user.mobile !== phone) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildPasswordResetFailureAudit(user, phone, "mobile_mismatch"),
      ));
      throw new UserNotFoundError("用户名与手机号不匹配");
    }
    if (!await deps.mobileService.consumeVerificationCode(VerificationCodeUsage.ResetPassword, phone, code)) {
      await deps.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildPasswordResetFailureAudit(user, phone, "invalid_verification_code"),
      ));
      throw new InvalidVerificationCodeError("验证码错误");
    }
    const newPasswordHash = await deps.passwordHelper.hashUserPassword(newPassword);
    return await deps.uow.transaction(async (tx) => {
      await tx.userRepository.setPassword(user.id, newPasswordHash);
      await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildPasswordResetSuccessAudit(user, phone),
      ));
      return true;
    }, { observability: options.requestContext });
  }

  async function checkPassword(username: string, inputPassword: string) {
    const user = await deps.userRepository.getUserByUsername(username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    return await deps.passwordHelper.verifyUserPassword(user, inputPassword);
  }

  async function getActiveUserByMobile(mobile: string) {
    return await deps.userRepository.getUserByMobile(mobile);
  }

  async function getActiveUserById(userId: number) {
    return await deps.userRepository.getUserById(userId);
  }

  async function getActiveUserByUsername(username: string) {
    return await deps.userRepository.getUserByUsername(username);
  }

  async function getActiveUserByWxId(wxId: string) {
    return await deps.userRepository.getUserByWxId(wxId);
  }

  async function pauseEnabledUser(userId: number) {
    return await deps.userRepository.updateEnabledUserStatus(userId, UserStatus.Pause);
  }

  async function setMobile(userId: number, phoneNumber: string, code: string, options: UserRequestOptions = {}) {
    await deps.mobileBinding.assertCanBindMobile(userId, phoneNumber, code, options);
    await deps.uow.transaction(async (tx) => {
      await tx.userRepository.setMobile(userId, phoneNumber);
      await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
        options.requestContext,
        buildMobileBindSuccessAudit(userId, phoneNumber),
      ));
      await tx.profileDirtyMarker.markUsersDirty({
        userIds: [userId],
        reasonCodes: [UserProfileDirtyReason.UserUpdated],
        afterCommit: tx.afterCommit,
        requestId: options.requestContext?.requestId ?? undefined,
        traceId: options.requestContext?.traceId ?? undefined,
      });
    }, { observability: options.requestContext });
    return true;
  }

  async function searchUsers(userQueryDto: UserQueryDto): Promise<UserDto[]> {
    return await deps.profileQuery.searchLegacyUsers(userQueryDto);
  }

  async function searchUsersWithPrivilegeDelegation(query: UserQueryWithPrivilegeDelegationDto) {
    return await deps.userDelegationQuery.searchUsersWithDelegations(query);
  }

  async function getUserDetailById(userId: number): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByUserId(userId);
  }

  async function getUserDetailByUsername(username: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByUsername(username);
  }

  async function getUserDetailByMobile(mobile: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByMobile(mobile);
  }

  async function getUserDetailByWxId(wxId: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByWxId(wxId);
  }

  return {
    setPassword,
    resetPassword,
    checkPassword,
    getActiveUserById,
    getActiveUserByMobile,
    getActiveUserByUsername,
    getActiveUserByWxId,
    pauseEnabledUser,
    setMobile,
    searchUsers,
    searchUsersWithPrivilegeDelegation,
    getUserDetailById,
    getUserDetailByUsername,
    getUserDetailByMobile,
    getUserDetailByWxId,
  };
}

export type UserService = ReturnType<typeof createUserService>;
