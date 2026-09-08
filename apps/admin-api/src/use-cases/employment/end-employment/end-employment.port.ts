import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus } from "@iam/contracts";
import type { Employment } from "@iam/domain/employment";

export interface EndEmploymentClockPort {
  nowDate: () => Date;
}

export interface EndEmploymentTransactionPorts {
  employmentStore: {
    lockEmploymentLifecycleContextById: (
      id: number,
    ) => Promise<{ employment: Employment } | null>;
    updateEmploymentRecord: (
      id: number,
      patch: {
        status: EmploymentStatus.Disable;
        endTime: Date;
        isPrimary: false;
      },
    ) => Promise<Employment>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  responsibilityParentLifecycle: {
    lockAssignmentsForEmployment: (input: {
      employmentId: number;
      command: "pause" | "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    endOpenAssignmentsForEmployment: (input: {
      action: "end";
      employmentId: number;
      endTime: Date;
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

export interface EndEmploymentUseCaseDeps {
  clock: EndEmploymentClockPort;
  uow: UnitOfWorkPort<EndEmploymentTransactionPorts>;
}
