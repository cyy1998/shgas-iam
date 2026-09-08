import type { AdminAuditContext, AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { OrganizationResponsibilityAssignmentWriteTarget } from "@admin-api/services/organization-responsibility/organization-responsibility-parent-lifecycle.type";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus } from "@iam/contracts";
import type { Employment } from "@iam/domain/employment";
import type { Organization } from "@iam/domain/organization";
import type { Position } from "@iam/domain/position";
import type { User } from "@iam/domain/user";

export interface TransferEmploymentStorePort {
  createEmploymentRecord: (input: {
    userId: number;
    posId: number;
    orgId: number;
    isPrimary: boolean;
    startTime: Date;
    endTime: Date | null;
    description: string | null;
    status: EmploymentStatus;
  }) => Promise<Employment>;
  getEmploymentLifecycleContextById: (
    id: number,
  ) => Promise<{
    employment: Employment;
    organization: Organization | null;
    position: Position | null;
  } | null>;
  getOpenEmploymentByUserOrgPosId: (
    userId: number,
    orgId: number,
    posId: number,
    exceptEmploymentId?: number,
  ) => Promise<Employment | null>;
  getOpenPrimaryEmploymentIdsByUserId: (userId: number) => Promise<number[]>;
  lockEmploymentsByIds: (ids: readonly number[]) => Promise<Employment[]>;
  updateEmploymentRecord: (
    id: number,
    patch: {
      status?: EmploymentStatus.Disable;
      endTime?: Date;
      isPrimary: false;
    },
  ) => Promise<Employment>;
}

export interface TransferEmploymentTransactionPorts {
  employmentStore: TransferEmploymentStorePort;
  organizationReader: {
    getOrganizationByCode: (orgCode: string) => Promise<Organization | null>;
    isOrganizationDescendantOf: (
      descendantOrgCode: string,
      ancestorOrgCode: string,
    ) => Promise<boolean>;
  };
  positionReader: {
    getPositionByCode: (posCode: string) => Promise<Position | null>;
  };
  userReader: {
    getUserByIdForAdmin: (id: number) => Promise<User | null>;
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
      action: "transfer";
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

export interface TransferEmploymentClockPort {
  nowDate: () => Date;
}

export interface TransferEmploymentUseCaseDeps {
  clock: TransferEmploymentClockPort;
  uow: UnitOfWorkPort<TransferEmploymentTransactionPorts>;
}
