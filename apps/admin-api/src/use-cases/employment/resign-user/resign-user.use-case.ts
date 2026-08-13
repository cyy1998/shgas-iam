import type { ResignUserUseCaseDeps } from "./resign-user.port";
import type { ResignUserInput, ResignUserOptions } from "./resign-user.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentResignUserAudit } from "@admin-api/services/audit/events/employment.audit";
import { UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";

export function createResignUserUseCase(deps: ResignUserUseCaseDeps) {
  async function execute(
    input: ResignUserInput,
    options: ResignUserOptions = {},
  ): Promise<true> {
    const { auditContext } = options;
    const user = await deps.userReader.getUserByUsernameForAdmin(input.username);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }

    return await deps.subjectAccessLifecycle.run({
      subjectIdentifier: user.subjectIdentifier,
      disposition: "disabled",
      mutate: async receipt => await deps.uow.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
            const current = await tx.userStore.getUserByUsernameForAdmin(input.username);
            if (current === null) {
              throw new UserNotFoundError("用户不存在");
            }

            const transactionTime = deps.clock.nowDate();
            await tx.employmentStore.endOpenEmploymentsByUserId(current.id, transactionTime);
            await tx.userStore.updateUserByUsername(input.username, {
              status: UserStatus.Disable,
            });
            await tx.auditLogWriter.recordAuditLog(buildEmploymentResignUserAudit(current, auditContext));
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: current.id },
              { kind: "employment", userId: current.id },
            ]);
            return true as const;
          },
          () => "disabled",
        ), adminAuditTransactionOptions(auditContext)),
      revokeSessions: async (_result, context) => {
        await deps.sessionRevocation.revokeUserSessions({
          userId: user.id,
          subjectIdentifier: user.subjectIdentifier,
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
  }

  return { execute };
}

export type ResignUserUseCase = ReturnType<typeof createResignUserUseCase>;
