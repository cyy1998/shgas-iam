import type { UserRequestOptions, UserServiceDeps } from "./user.port";
import type { UserDetailDto } from "./user.type";
import { withApiRequestContext } from "@api/services/audit/audit.context";
import {
  buildMobileBindSuccessAudit,
  buildSelfPasswordChangeFailureAudit,
  buildSelfPasswordChangeSuccessAudit,
} from "@api/services/audit/events/self-user.audit";
import { UserStatus } from "@iam/contracts";
import { InvalidOldPasswordError, UserNotFoundError, UserPasswordUnchangedError } from "@iam/domain/user";

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
        throw new UserPasswordUnchangedError("旧密码与新密码相同");
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

  async function getActiveUserBySubjectIdentifier(subjectIdentifier: string) {
    return await deps.userRepository.getUserBySubjectIdentifier(subjectIdentifier);
  }

  async function findOrcasUserBySubjectIdentifier(subjectIdentifier: string): Promise<{
    id: number;
    username: string;
    name: string;
    mobile?: string;
  } | null> {
    const identity = await deps.userRepository.findUserIdentityBySubjectIdentifier(subjectIdentifier);
    if (identity === null)
      return null;

    let profile;
    try {
      profile = await deps.profileQuery.getDetailByUserId(identity.id);
    }
    catch {
      // ORCAS has always treated unavailable Profile details as an absent login identity.
      return null;
    }
    return {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      ...(profile.mobile ? { mobile: profile.mobile } : {}),
    };
  }

  async function getActiveUserByUsername(username: string) {
    return await deps.userRepository.getUserByUsername(username);
  }

  async function getActiveUserByWxId(wxId: string) {
    return await deps.userRepository.getUserByWxId(wxId);
  }

  async function pauseEnabledUser(userId: number, options: UserRequestOptions = {}) {
    const existing = await deps.userRepository.getUserById(userId);
    if (existing === null)
      return null;

    return await deps.subjectAccessLifecycle.run({
      subjectIdentifier: existing.subjectIdentifier,
      disposition: "disabled",
      mutate: async receipt => await deps.uow.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
            const updatedUser = await tx.userRepository.updateEnabledUserStatus(userId, UserStatus.Pause);
            if (updatedUser === null)
              return null;

            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId },
            ]);
            return updatedUser;
          },
          () => "disabled",
        ), { observability: options.requestContext }),
      revokeSessions: async (_result, context) => {
        await deps.sessionRevocation.revokeUserSessions({
          subjectIdentifier: existing.subjectIdentifier,
          reason: "user_disabled",
          onlySubjectAccessTransitionId:
            context.invalidatedSubjectAccessTransitionId,
        });
      },
      observability: {
        requestId: options.requestContext?.requestId ?? undefined,
        traceId: options.requestContext?.traceId ?? undefined,
      },
    });
  }

  async function setMobile(userId: number, phoneNumber: string, code: string, options: UserRequestOptions = {}) {
    const reservation = await deps.mobileBinding.assertCanBindMobile(userId, phoneNumber, code, options);
    let transactionSucceeded = false;
    try {
      await deps.uow.transaction(async (tx) => {
        await tx.userRepository.setMobile(userId, phoneNumber);
        await tx.auditLogWriter.recordAuditLog(withApiRequestContext(
          options.requestContext,
          buildMobileBindSuccessAudit(userId, phoneNumber),
        ));
        await tx.userProfileInvalidation.recordChanges([
          { kind: "user", userId },
        ]);
      }, { observability: options.requestContext });
      transactionSucceeded = true;
      await deps.mobileService.confirmReservedVerificationCode(reservation);
      return true;
    }
    catch (error) {
      if (!transactionSucceeded)
        await deps.mobileService.releaseReservedVerificationCode(reservation);
      throw error;
    }
  }

  async function getUserDetailById(userId: number): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByUserId(userId);
  }

  async function getUserDetailByUsername(username: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByUsername(username);
  }

  async function getUserMobileByUsername(username: string): Promise<string | null> {
    try {
      const profile = await deps.profileQuery.getDetailByUsername(username);
      return profile.mobile;
    }
    catch (error) {
      // A missing published Profile does not prove the account is absent.
      if (error instanceof UserNotFoundError && await deps.userRepository.findUserIdentityByUsername(username) === null)
        return null;
      throw error;
    }
  }

  async function getUserDetailByMobile(mobile: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByMobile(mobile);
  }

  async function getUserDetailByWxId(wxId: string): Promise<UserDetailDto> {
    return await deps.profileQuery.getDetailByWxId(wxId);
  }

  return {
    setPassword,
    checkPassword,
    getActiveUserById,
    getActiveUserBySubjectIdentifier,
    findOrcasUserBySubjectIdentifier,
    getActiveUserByMobile,
    getActiveUserByUsername,
    getActiveUserByWxId,
    pauseEnabledUser,
    setMobile,
    getUserDetailById,
    getUserDetailByUsername,
    getUserMobileByUsername,
    getUserDetailByMobile,
    getUserDetailByWxId,
  };
}

export type UserService = ReturnType<typeof createUserService>;
