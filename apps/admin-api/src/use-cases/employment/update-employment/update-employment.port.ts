import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { AdminEmploymentRecordUpdate } from "@admin-api/services/employment/employment.type";
import type { EmploymentLifecycleDocumentChange } from "@iam/assignment-resolution/employment-lifecycle";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import type { EmploymentDetail } from "@iam/domain/employment";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

export interface UpdateEmploymentTransactionPorts {
  employmentStore: {
    lockEmploymentByIdForAdmin: (id: number) => Promise<EmploymentDetail | null>;
    updateEmploymentRecord: (id: number, patch: AdminEmploymentRecordUpdate) => Promise<{ id: number } | null>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  responsibilityParentLifecycle: {
    lockAssignmentsForEmployment: (input: {
      employmentId: number;
      command: "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
    pauseEnabledAssignmentsForEmployment: (input: {
      action: "editPeriod";
      employmentId: number;
      eventTime: Date;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
      auditContext?: AdminAuditContext;
    }) => Promise<boolean>;
    endOpenAssignmentsForEmployment: (input: {
      action: "editPeriod";
      employmentId: number;
      endTime: Date;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
      auditContext?: AdminAuditContext;
    }) => Promise<boolean>;
  };
  userDocumentInvalidation: {
    recordChanges: (changes: readonly EmploymentLifecycleDocumentChange[]) => Promise<void>;
  };
}

export interface UpdateEmploymentUseCaseDeps {
  clock: { nowDate: () => Date };
  uow: UnitOfWorkPort<UpdateEmploymentTransactionPorts>;
}
