import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { Employment } from "@iam/domain/employment";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

export interface ManagePrimaryEmploymentTransactionPorts {
  employmentStore: {
    getEmploymentLifecycleContextById: (id: number) => Promise<{ employment: Employment } | null>;
    getOpenPrimaryEmploymentIdsByUserId: (userId: number) => Promise<number[]>;
    lockEmploymentsByIds: (ids: readonly number[]) => Promise<Employment[]>;
    updateEmploymentRecord: (id: number, patch: { isPrimary: boolean }) => Promise<Employment>;
  };
  auditLogWriter: {
    recordAuditLog: (input: AuditLogInput) => Promise<void>;
  };
  userDocumentInvalidation: {
    recordChanges: (
      changes: readonly {
        readonly kind: "employment";
        readonly userId: number;
      }[],
    ) => Promise<void>;
  };
}

export interface ManagePrimaryEmploymentUseCaseDeps {
  uow: UnitOfWorkPort<ManagePrimaryEmploymentTransactionPorts>;
}
