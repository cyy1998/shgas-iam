import type { OrganizationResponsibilityReadScope } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentLifecycleChange, OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
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
    organizationId: number;
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
    isEndpointPairWithinReadScope: (input: {
      readScope: OrganizationResponsibilityReadScope;
      holderOrganizationId: number;
      targetOrganizationId: number;
    }) => boolean;
    findOpenAssignmentForSlot: (input: {
      employmentId: number;
      targetOrganizationId: number;
      typeCode: OrganizationResponsibilityTypeCode;
      excludeAssignmentId?: number;
      readScope: OrganizationResponsibilityReadScope;
    }) => Promise<{ id: number; employmentId: number; isManageable: boolean } | null>;
    lockAssignmentLifecycleContextById: (
      id: number,
    ) => Promise<OrganizationResponsibilityAssignmentLifecycleContext | null>;
    updateLockedAssignmentLifecycle: (input: {
      assignment: OrganizationResponsibilityAssignmentWriteTarget;
      status: OrganizationResponsibilityAssignmentStatus;
      endTime: Date | null;
    }) => Promise<OrganizationResponsibilityAssignmentLifecycleChange>;
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
