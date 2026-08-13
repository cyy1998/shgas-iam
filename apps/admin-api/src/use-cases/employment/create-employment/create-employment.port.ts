import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus } from "@iam/contracts";
import type { Employment } from "@iam/domain/employment";
import type { Organization } from "@iam/domain/organization";
import type { Position } from "@iam/domain/position";
import type { User } from "@iam/domain/user";

export interface CreateEmploymentStorePort {
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
  getOpenEmploymentByUserOrgPosId: (
    userId: number,
    orgId: number,
    posId: number,
  ) => Promise<Employment | null>;
  unsetOpenPrimariesByUserId: (userId: number) => Promise<unknown>;
}

export interface CreateEmploymentTransactionPorts {
  employmentStore: CreateEmploymentStorePort;
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
    getUserByUsernameForAdmin: (username: string) => Promise<User | null>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  userProfileInvalidation: {
    recordChanges: (changes: readonly {
      readonly kind: "employment";
      readonly userId: number;
    }[]) => Promise<void>;
  };
}

export interface CreateEmploymentClockPort {
  nowDate: () => Date;
}

export interface CreateEmploymentUseCaseDeps {
  clock: CreateEmploymentClockPort;
  uow: UnitOfWorkPort<CreateEmploymentTransactionPorts>;
}
