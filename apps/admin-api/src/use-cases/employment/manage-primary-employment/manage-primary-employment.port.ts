import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { Employment } from "@iam/domain/employment";

export interface ManagePrimaryEmploymentTransactionPorts {
  employmentStore: {
    getEmploymentLifecycleContextById: (
      id: number,
    ) => Promise<{ employment: Employment } | null>;
    unsetOpenPrimariesByUserId: (userId: number) => Promise<unknown>;
    updateEmploymentRecord: (
      id: number,
      patch: { isPrimary: boolean },
    ) => Promise<unknown>;
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

export interface ManagePrimaryEmploymentUseCaseDeps {
  uow: UnitOfWorkPort<ManagePrimaryEmploymentTransactionPorts>;
}
