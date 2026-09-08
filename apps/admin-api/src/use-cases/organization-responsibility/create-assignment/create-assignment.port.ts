import type { OrganizationResponsibilityReadScope } from "@admin-api/services/admin-authorization/admin-organization-responsibility-authorization.type";
import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type {
  EmploymentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from "@iam/contracts";
import type { OrganizationResponsibilityAssignmentRecordCreate } from "@iam/domain/organization-responsibility";

export interface CreateOrganizationResponsibilityAssignmentTransactionPorts {
  assignmentStore: {
    findOpenAssignmentForSlot: (input: {
      employmentId: number;
      targetOrganizationId: number;
      typeCode: OrganizationResponsibilityTypeCode;
      readScope: OrganizationResponsibilityReadScope;
    }) => Promise<{
      id: number;
      employmentId: number;
      isManageable: boolean;
    } | null>;
    createAssignmentRecord: (
      input: OrganizationResponsibilityAssignmentRecordCreate,
      readScope: OrganizationResponsibilityReadScope,
    ) => Promise<{ id: number }>;
    isEndpointPairWithinReadScope: (input: {
      readScope: OrganizationResponsibilityReadScope;
      holderOrganizationId: number;
      targetOrganizationId: number;
    }) => boolean;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  employmentReader: {
    getEmploymentForResponsibilityById: (id: number) => Promise<{
      id: number;
      userId: number;
      organizationId: number;
      status: EmploymentStatus;
      isDelete: boolean;
    } | null>;
  };
  organizationReader: {
    getOrganizationForResponsibilityByCode: (orgCode: string) => Promise<{
      id: number;
      orgCode: string;
      status: OrganizationStatus;
      isDelete: boolean;
    } | null>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly {
      readonly kind: "organization-responsibility-assignment";
      readonly userId: number;
    }[]) => Promise<void>;
  };
}

export interface CreateOrganizationResponsibilityAssignmentUseCaseDeps {
  clock: { nowDate: () => Date };
  uow: UnitOfWorkPort<CreateOrganizationResponsibilityAssignmentTransactionPorts>;
}
