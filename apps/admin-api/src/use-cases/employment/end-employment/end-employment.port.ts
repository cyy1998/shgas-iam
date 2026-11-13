import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type {
  EmploymentLifecycleDocumentChange,
  LockedEmploymentEndStorePort,
} from "@iam/assignment-resolution/employment-lifecycle";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import type { Employment } from "@iam/domain/employment";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

export interface EndEmploymentClockPort {
  nowDate: () => Date;
}

export interface EndEmploymentTransactionPorts {
  employmentStore: LockedEmploymentEndStorePort & {
    lockEmploymentLifecycleContextById: (id: number) => Promise<{ employment: Employment } | null>;
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
  userDocumentInvalidation: {
    recordChanges: (changes: readonly EmploymentLifecycleDocumentChange[]) => Promise<void>;
  };
}

export interface EndEmploymentUseCaseDeps {
  clock: EndEmploymentClockPort;
  uow: UnitOfWorkPort<EndEmploymentTransactionPorts>;
}
