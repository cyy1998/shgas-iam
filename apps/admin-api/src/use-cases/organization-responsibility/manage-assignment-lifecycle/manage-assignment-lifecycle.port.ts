import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  EmploymentStatus,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";

export interface OrganizationResponsibilityAssignmentLifecycleContext {
  assignment: {
    id: number;
    employmentId: number;
    targetOrganizationId: number;
    typeCode: OrganizationResponsibilityTypeCode;
    status: OrganizationResponsibilityAssignmentStatus;
    startTime: Date;
    endTime: Date | null;
  };
  employment: {
    userId: number;
    status: EmploymentStatus;
    isDelete: boolean;
  } | null;
  targetOrganization: {
    status: OrganizationStatus;
    isDelete: boolean;
  } | null;
}

export interface ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts {
  assignmentStore: {
    findOpenAssignmentForSlot: (input: {
      employmentId: number;
      targetOrganizationId: number;
      typeCode: OrganizationResponsibilityTypeCode;
      excludeAssignmentId?: number;
    }) => Promise<{ id: number; employmentId: number } | null>;
    getAssignmentLifecycleContextById: (
      id: number,
    ) => Promise<OrganizationResponsibilityAssignmentLifecycleContext | null>;
    updateAssignmentLifecycle: (input: {
      id: number;
      expectedStatus: OrganizationResponsibilityAssignmentStatus;
      status: OrganizationResponsibilityAssignmentStatus;
      endTime: Date | null;
    }) => Promise<boolean>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  userProfileInvalidation: {
    recordChanges: (
      changes: readonly {
        readonly kind: "organization-responsibility-assignment";
        readonly userId: number;
      }[],
    ) => Promise<void>;
  };
}

export interface ManageOrganizationResponsibilityAssignmentLifecycleUseCaseDeps {
  clock: { nowDate: () => Date };
  uow: UnitOfWorkPort<ManageOrganizationResponsibilityAssignmentLifecycleTransactionPorts>;
}
