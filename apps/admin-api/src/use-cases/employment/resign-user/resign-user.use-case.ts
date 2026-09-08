import type {
  ResignUserEligibilityReaderPort,
  ResignUserTarget,
  ResignUserUseCaseDeps,
} from "./resign-user.port";
import type { ResignUserInput, ResignUserOptions } from "./resign-user.type";
import { createAdminMutation, runAdminSubjectAccessMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentResignUserAudit } from "@admin-api/services/audit/events/employment.audit";
import { EmploymentStatus, UserStatus } from "@iam/contracts";
import { UserNotFoundError } from "@iam/domain/user";

export function createResignUserUseCase(deps: ResignUserUseCaseDeps) {
  const mutation = createAdminMutation(deps.uow);
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

  async function assertResignationAllowed(
    reader: ResignUserEligibilityReaderPort,
    user: ResignUserTarget,
    options: ResignUserOptions,
  ) {
    const { authorization } = options;
    if (authorization?.kind !== "scoped")
      return;
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
  }

  async function execute(
    input: ResignUserInput,
    options: ResignUserOptions = {},
  ) {
    const { auditContext } = options;
    const user = await getTarget(deps.userReader, input.username, options);
    if (user === null) {
      throw new UserNotFoundError("用户不存在");
    }
    await assertResignationAllowed(deps.userReader, user, options);

    let revocationPlan: Awaited<ReturnType<ResignUserUseCaseDeps["sessionRevocation"]["prepareUserSessionRevocation"]>>;
    return await runAdminSubjectAccessMutation(deps.subjectAccessLifecycle, {
      subjectIdentifier: user.subjectIdentifier,
      disposition: "disabled",
      mutate: async (receipt) => {
        revocationPlan = await deps.sessionRevocation.prepareUserSessionRevocation({
          userId: user.id,
          subjectIdentifier: user.subjectIdentifier,
          reason: "user_disabled",
          auditContext,
        });
        return await mutation.locked(
          tx => tx.userStore.lockUserByUsername(input.username, options.authorization?.kind === "scoped"),
          () => new UserNotFoundError("用户不存在"),
          async (tx, current) => await tx.subjectAccessMutation.runMutation(
            receipt,
            async () => {
              await assertResignationAllowed(tx.userStore, current, options);
              const selectedIds = await tx.employmentStore.getOpenEmploymentIdsByUserId(current.id);
              const selectedEmployments = await tx.employmentStore.lockEmploymentsByIds(selectedIds);
              const selectedAssignments = await tx.responsibilityParentLifecycle.lockAssignmentsForEmployments({
                employmentIds: selectedIds,
                command: "end",
              });
              // HR eligibility is based on current request-time facts, including changes observed after lock waits.
              await assertResignationAllowed(tx.userStore, current, options);
              const transactionTime = deps.clock.nowDate();
              let employmentChanged = false;
              for (const employment of selectedEmployments) {
                if (employment.userId !== current.id || employment.isDelete)
                  throw new Error("Locked Employment does not belong to the resignation target");
                if (employment.status === EmploymentStatus.Disable)
                  continue;
                if (employment.status !== EmploymentStatus.Enable && employment.status !== EmploymentStatus.Pause)
                  throw new Error("Locked Employment has an invalid resignation state");
                const updated = await tx.employmentStore.updateEmploymentRecord(employment.id, {
                  status: EmploymentStatus.Disable,
                  endTime: transactionTime,
                  isPrimary: false,
                });
                if (updated == null)
                  throw new Error("Locked Employment resignation returned no row");
                employmentChanged = true;
              }
              const assignmentChanged = await tx.responsibilityParentLifecycle.endOpenAssignmentsForUserResignation({
                auditContext,
                selectedAssignments,
                endTime: transactionTime,
                userId: current.id,
              });
              const userChanged = current.status !== UserStatus.Disable;
              if (userChanged) {
                const updatedUser = await tx.userStore.updateUserByUsername(input.username, {
                  status: UserStatus.Disable,
                });
                if (updatedUser === null)
                  throw new Error("Locked User resignation returned no row");
              }
              const changed = userChanged || employmentChanged || assignmentChanged;
              await tx.auditLogWriter.recordAuditLog(buildEmploymentResignUserAudit(current, auditContext, changed));
              if (changed) {
                await tx.userProfileInvalidation.recordChanges([
                  ...(userChanged ? [{ kind: "user" as const, userId: current.id }] : []),
                  ...(employmentChanged ? [{ kind: "employment" as const, userId: current.id }] : []),
                  ...(assignmentChanged ? [{ kind: "organization-responsibility-assignment" as const, userId: current.id }] : []),
                ]);
              }
              return { changed, result: null };
            },
            () => "disabled",
          ),
          adminAuditTransactionOptions(auditContext),
        );
      },
      revokeSessions: async (_result, context) => {
        await revocationPlan.revoke({
          onlySubjectAccessTransitionId: context.invalidatedSubjectAccessTransitionId,
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
