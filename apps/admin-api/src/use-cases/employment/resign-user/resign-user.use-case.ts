import type { ResignUserUseCaseDeps } from "./resign-user.port";
import type { ResignUserInput, ResignUserOptions } from "./resign-user.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.service";
import { buildEmploymentResignUserAudit } from "@admin-api/services/audit/events/employment.audit";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";

export function createResignUserUseCase(deps: ResignUserUseCaseDeps) {
  async function execute(
    input: ResignUserInput,
    options: ResignUserOptions = {},
  ): Promise<true> {
    const { auditContext } = options;
    return await deps.uow.transaction(async (tx) => {
      const user = await tx.userStore.getUserByUsernameForAdmin(input.username);
      if (user === null) {
        throw new UserNotFoundError("用户不存在");
      }

      await tx.employmentStore.endActiveEmploymentsByUserId(user.id);
      await tx.userStore.updateUserByUsername(input.username, {
        status: UserStatus.Disable,
      });
      await tx.auditLogWriter.recordAuditLog(buildEmploymentResignUserAudit(user, auditContext));
      await tx.profileDirtyMarker.markUsersDirty({
        userIds: [user.id],
        reasonCodes: [UserProfileDirtyReason.EmploymentUpdated, UserProfileDirtyReason.UserUpdated],
        afterCommit: tx.afterCommit,
        requestId: auditContext?.requestId ?? undefined,
        traceId: auditContext?.traceId ?? undefined,
      });
      tx.afterCommit.bestEffort("admin.session_revoke.user", async () => {
        await deps.sessionRevocation.revokeUserSessions({
          userId: user.id,
          reason: "user_disabled",
          auditContext,
        });
      });
      return true as const;
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type ResignUserUseCase = ReturnType<typeof createResignUserUseCase>;
