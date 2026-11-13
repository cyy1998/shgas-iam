import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type {
  EmploymentLifecycleDocumentChange,
  LockedEmploymentEndStorePort,
  OpenEmploymentPatch,
} from "@iam/assignment-resolution/employment-lifecycle";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import type { Employment } from "@iam/domain/employment";
import type { Organization } from "@iam/domain/organization";
import type { Position } from "@iam/domain/position";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

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
      patch: OpenEmploymentPatch | Parameters<LockedEmploymentEndStorePort["updateEmploymentRecord"]>[1],
    ) => Promise<Employment>;
  };
  organizationReader: {
    isOrganizationDescendantOf: (descendantOrgCode: string, ancestorOrgCode: string) => Promise<boolean>;
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
      action: "resume";
      employmentId: number;
      endTime: Date;
      auditContext?: AdminAuditContext;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    }) => Promise<boolean>;
    pauseEnabledAssignmentsForEmployment: (input: {
      employmentId: number;
      auditContext?: AdminAuditContext;
      selectedAssignments: readonly OrganizationResponsibilityAssignmentWriteTarget[];
    }) => Promise<boolean>;
  };
  userDocumentInvalidation: {
    recordChanges: (changes: readonly EmploymentLifecycleDocumentChange[]) => Promise<void>;
  };
}

export interface ChangeEmploymentAvailabilityUseCaseDeps {
  clock: { nowDate: () => Date };
  uow: UnitOfWorkPort<ChangeEmploymentAvailabilityTransactionPorts>;
}
