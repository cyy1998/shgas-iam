import type { AuditLogInput } from "@admin-api/services/audit/audit.context";
import type { UnitOfWorkPort } from "@iam/api-core/uow";
import type { EmploymentStatus } from "@iam/contracts";
import type { Employment } from "@iam/domain/employment";

export interface EndEmploymentClockPort {
  nowDate: () => Date;
}

export interface EndEmploymentTransactionPorts {
  employmentStore: {
    getEmploymentLifecycleContextById: (
      id: number,
    ) => Promise<{ employment: Employment } | null>;
    updateEmploymentRecord: (
      id: number,
      patch: {
        status: EmploymentStatus.Disable;
        endTime: Date;
        isPrimary: false;
      },
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

export interface EndEmploymentUseCaseDeps {
  clock: EndEmploymentClockPort;
  uow: UnitOfWorkPort<EndEmploymentTransactionPorts>;
}
