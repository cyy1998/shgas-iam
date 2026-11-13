import type {
  EmploymentLifecycleDocumentChange,
  LockedEmploymentEndStorePort,
  LockedOpenEmploymentStorePort,
} from "@iam/assignment-resolution/employment-lifecycle";
import type {
  LockedAssignmentEndStorePort,
  OrganizationResponsibilityAssignmentWriteTarget,
} from "@iam/assignment-resolution/organization-responsibility/assignment-lifecycle";
import type { CanonicalAuditAction, EmploymentStatus } from "@iam/contracts";
import type { EmploymentPeriod } from "@iam/domain/employment/employment-date";
import type { UnitOfWorkPort } from "@iam/unit-of-work";

export type EmploymentSweepPhase = "end" | "enable";

export interface EmploymentSweepAuditEvent {
  eventTime: Date;
  action: CanonicalAuditAction;
  targetType: "employment" | "organization_responsibility_assignment";
  targetId: number;
  details: Record<string, unknown>;
}

interface EmploymentSweepTransaction {
  selectCandidates: (date: string, phase: EmploymentSweepPhase, afterId?: number) => Promise<{ id: number }[]>;
  lockEmployment: (
    id: number,
  ) => Promise<(EmploymentPeriod & { id: number; userId: number; status: EmploymentStatus; isDelete: boolean }) | null>;
  employmentStore: LockedEmploymentEndStorePort & LockedOpenEmploymentStorePort;
  assignments: LockedAssignmentEndStorePort & {
    lockAssignmentsForEmployment: (input: {
      employmentId: number;
      command: "end";
    }) => Promise<OrganizationResponsibilityAssignmentWriteTarget[]>;
  };
  recordAudit: (event: EmploymentSweepAuditEvent) => Promise<void>;
  invalidateDocuments: (changes: readonly EmploymentLifecycleDocumentChange[]) => Promise<void>;
}

export interface SweepEmploymentsUseCaseDeps {
  uow: UnitOfWorkPort<EmploymentSweepTransaction>;
  clock: { nowDate: () => Date };
  reportTransitionFailure: (
    candidate: { date: string; employmentId: number; phase: EmploymentSweepPhase },
    error: unknown,
  ) => void;
}
