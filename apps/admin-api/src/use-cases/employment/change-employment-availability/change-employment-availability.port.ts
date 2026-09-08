import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus } from "@iam/contracts";
import type { Employment } from "@iam/domain/employment";
import type { Organization } from "@iam/domain/organization";
import type { Position } from "@iam/domain/position";

export interface EmploymentLifecycleContext {
  employment: Employment;
  organization: Organization | null;
  position: Position | null;
}

export interface ChangeEmploymentAvailabilityTransactionPorts {
  employmentStore: {
    lockEmploymentLifecycleContextById: (id: number) => Promise<EmploymentLifecycleContext | null>;
    getOpenEmploymentByUserOrgPosId: (
      userId: number,
      orgId: number,
      posId: number,
      exceptEmploymentId: number,
    ) => Promise<Employment | null>;
    updateEmploymentRecord: (
      id: number,
      patch: { status: EmploymentStatus.Enable | EmploymentStatus.Pause },
    ) => Promise<Employment>;
  };
  organizationReader: {
    isOrganizationDescendantOf: (
      descendantOrgCode: string,
      ancestorOrgCode: string,
    ) => Promise<boolean>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  responsibilityParentLifecycle: {
    lockAssignmentsForEmployment: (input: {
      employmentId: number;
      command: "pause" | "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    pauseEnabledAssignmentsForEmployment: (input: {
      employmentId: number;
      auditContext?: AdminAuditContext;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    }) => Promise<boolean>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly (
      | {
        readonly kind: "employment";
        readonly userId: number;
      }
      | {
        readonly kind: "organization-responsibility-assignment";
        readonly userId: number;
      }
    )[]) => Promise<void>;
  };
}

export interface ChangeEmploymentAvailabilityUseCaseDeps {
  uow: UnitOfWorkPort<ChangeEmploymentAvailabilityTransactionPorts>;
}
