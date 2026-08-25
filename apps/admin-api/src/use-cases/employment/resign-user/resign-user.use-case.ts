import type {
  ResignUserEligibilityReaderPort,
  ResignUserTarget,
  ResignUserUseCaseDeps,
} from "./resign-user.port";
import type { ResignUserInput, ResignUserOptions } from "./resign-user.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentResignUserAudit } from "@admin-api/services/audit/events/employment.audit";
import { UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";

export function createResignUserUseCase(deps: ResignUserUseCaseDeps) {
  const resignationAction = {
    operationId: "admin.employment.resignUser",
  } as const;

  async function getTarget(
    reader: ResignUserEligibilityReaderPort,
    username: string,
    options: ResignUserOptions,
  ) {
    return options.authorization?.kind === "scoped"
      ? await reader.getUserByUsernameIncludingDeletedForAuthorization(username)
      : await reader.getUserByUsernameForAdmin(username);
  }

  async function authorizeAndClassifyResignation(
    reader: ResignUserEligibilityReaderPort,
    user: ResignUserTarget,
    options: ResignUserOptions,
  ): Promise<"completed-retry" | "first-execution"> {
    const { authorization } = options;
    if (authorization?.kind !== "scoped")
      return "first-execution";
    const [openEmploymentOrganizationIds, endedEmploymentOrganizationIds]
      = await Promise.all([
        reader.getOpenEmploymentOrganizationIdsByUserId(user.id),
        reader.getEndedEmploymentOrganizationIdsByUserId(user.id),
      ]);
    const decision = authorization.getAllowedActions({
      status: user.status,
      isDelete: user.isDelete,
      openEmploymentOrganizationIds,
      endedEmploymentOrganizationIds,
    }).resign;
    if (!decision.allowed) {
      authorization.denyMutation({
        operationId: resignationAction.operationId,
        resourceIdentifier: user.username,
        reason: decision.reason,
      });
    }
    return openEmploymentOrganizationIds.length === 0
      ? "completed-retry"
      : "first-execution";
  }

  async function execute(
    input: ResignUserInput,
    options: ResignUserOptions = {},
  ): Promise<true> {
    const { auditContext } = options;
    const user = await getTarget(deps.userReader, input.username, options);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    await authorizeAndClassifyResignation(deps.userReader, user, options);

    return await deps.subjectAccessLifecycle.run({
      subjectIdentifier: user.subjectIdentifier,
      disposition: "disabled",
      mutate: async receipt => await deps.uow.transaction(async tx =>
        await tx.subjectAccessMutation.runMutation(
          receipt,
          async () => {
            const current = await getTarget(tx.userStore, input.username, options);
            if (current === null) {
              throw new UserNotFoundError("用户不存在");
            }
            const executionKind = await authorizeAndClassifyResignation(
              tx.userStore,
              current,
              options,
            );
            if (executionKind === "completed-retry")
              return true as const;

            const transactionTime = deps.clock.nowDate();
            await tx.employmentStore.endOpenEmploymentsByUserId(current.id, transactionTime);
            const assignmentChanged
              = await tx.responsibilityParentLifecycle.endOpenAssignmentsForUserResignation({
                auditContext,
                endTime: transactionTime,
                userId: current.id,
              });
            const updatedUser = await tx.userStore.updateUserByUsername(input.username, {
              status: UserStatus.Disable,
            });
            if (updatedUser === null) {
              if (options.authorization?.kind === "scoped") {
                options.authorization.denyMutation({
                  operationId: resignationAction.operationId,
                  resourceIdentifier: input.username,
                  reason: "USER_NOT_HR_MANAGED",
                });
              }
              throw new UserNotFoundError("用户不存在");
            }
            await tx.auditLogWriter.recordAuditLog(buildEmploymentResignUserAudit(current, auditContext));
            await tx.userProfileInvalidation.recordChanges([
              { kind: "user", userId: current.id },
              { kind: "employment", userId: current.id },
              ...(assignmentChanged
                ? [{
                    kind: "organization-responsibility-assignment" as const,
                    userId: current.id,
                  }]
                : []),
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
