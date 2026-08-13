import type {
  ChangeEmploymentAvailabilityTransactionPorts,
  ChangeEmploymentAvailabilityUseCaseDeps,
  EmploymentLifecycleContext,
} from "./change-employment-availability.port";
import type {
  ChangeEmploymentAvailabilityInput,
  ChangeEmploymentAvailabilityOptions,
} from "./change-employment-availability.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildEmploymentAudit } from "@admin-api/services/audit/events/employment.audit";
import { assertEmploymentOrganizationScope } from "@admin-api/services/employment/employment-organization-scope";
import {
  EmploymentStatus,
  OrganizationStatus,
  PositionStatus,
} from "@iam/contracts";
import {
  EmploymentAlreadyExistsError,
  EmploymentNotEditableError,
  EmploymentNotFoundError,
} from "@iam/domain/employment";
import { OrganizationNotFoundError } from "@iam/domain/organization";
import { PositionNotFoundError } from "@iam/domain/position";

export function createChangeEmploymentAvailabilityUseCase(
  deps: ChangeEmploymentAvailabilityUseCaseDeps,
) {
  async function execute(
    input: ChangeEmploymentAvailabilityInput,
    options: ChangeEmploymentAvailabilityOptions = {},
  ) {
    const { auditContext } = options;
    return await deps.uow.transaction(async (tx) => {
      const context = await tx.employmentStore.getEmploymentLifecycleContextById(input.employmentId);
      if (context === null) {
        throw new EmploymentNotFoundError();
      }

      const { employment } = context;
      if (input.command === "pause") {
        if (employment.status === EmploymentStatus.Pause) {
          return true;
        }
        if (employment.status !== EmploymentStatus.Enable) {
          throw new EmploymentNotEditableError("当前任职状态不允许暂停");
        }

        await persistAvailabilityChange(
          tx,
          employment,
          EmploymentStatus.Enable,
          EmploymentStatus.Pause,
          "admin.employment.pause",
          auditContext,
        );
        return true;
      }

      if (employment.status === EmploymentStatus.Enable) {
        return true;
      }
      if (employment.status !== EmploymentStatus.Pause) {
        throw new EmploymentNotEditableError("当前任职状态不允许恢复");
      }
      if (
        context.organization === null
        || context.organization.status !== OrganizationStatus.Enable
        || context.organization.isDelete
      ) {
        throw new OrganizationNotFoundError("组织未启用或不存在");
      }
      if (
        context.position === null
        || context.position.status !== PositionStatus.Enable
        || context.position.isDelete
      ) {
        throw new PositionNotFoundError("岗位未启用或不存在");
      }
      await assertEmploymentOrganizationScope(
        tx.organizationReader,
        context.organization.orgCode,
        input.expectedAncestorOrgCode,
        "任职组织不属于期望组织范围",
      );

      const conflict = await tx.employmentStore.getOpenEmploymentByUserOrgPosId(
        employment.userId,
        employment.orgId,
        employment.posId,
        employment.id,
      );
      if (conflict !== null) {
        throw new EmploymentAlreadyExistsError();
      }

      await persistAvailabilityChange(
        tx,
        employment,
        EmploymentStatus.Pause,
        EmploymentStatus.Enable,
        "admin.employment.resume",
        auditContext,
      );
      return true;
    }, adminAuditTransactionOptions(auditContext));
  }

  return { execute };
}

export type ChangeEmploymentAvailabilityUseCase = ReturnType<
  typeof createChangeEmploymentAvailabilityUseCase
>;

async function persistAvailabilityChange(
  tx: ChangeEmploymentAvailabilityTransactionPorts,
  employment: EmploymentLifecycleContext["employment"],
  fromStatus: EmploymentStatus.Enable | EmploymentStatus.Pause,
  toStatus: EmploymentStatus.Enable | EmploymentStatus.Pause,
  action: "admin.employment.pause" | "admin.employment.resume",
  auditContext: ChangeEmploymentAvailabilityOptions["auditContext"],
) {
  await tx.employmentStore.updateEmploymentRecord(employment.id, { status: toStatus });
  await tx.auditLogWriter.recordAuditLog(buildEmploymentAudit(
    action,
    employment,
    { fromStatus, toStatus },
    auditContext,
  ));
  await tx.userProfileInvalidation.recordChanges([
    { kind: "employment", userId: employment.userId },
  ]);
}
