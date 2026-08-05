import type {
  SubjectAccessTransitionRecoveryLease,
  SubjectAccessTransitionResolution,
} from "../../src/subject-access";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectAccessTransitionRecovery } from "../../src/subject-access";

const lease: SubjectAccessTransitionRecoveryLease = {
  subjectIdentifier: "00000000-0000-4000-8000-000000000001",
  transitionId: "10000000-0000-4000-8000-000000000001",
  leaseToken: "worker-a",
  fence: 1,
  leaseUntil: 200,
};

describe("Subject Access transition recovery", () => {
  test("uses the durable committed target instead of inferring a mutating outcome", async () => {
    const committed = {
      status: "committed",
      targetState: "disabled",
    } satisfies SubjectAccessTransitionResolution;
    const claimTransitionRecovery = mock(async () => lease);
    const resolve = mock(async () => committed);
    const reconcileTransitionRecovery = mock(async () => "prepared" as const);
    const recovery = createSubjectAccessTransitionRecovery({
      authority: { resolve },
      backlog: {
        claimTransitionRecovery,
        reconcileTransitionRecovery,
        rescheduleTransitionRecovery: mock(async () => "rescheduled" as const),
      },
      logger: { warn: mock(() => undefined) },
      random: { uuid: () => "worker-a" },
      leaseDurationMs: 100,
    });

    await expect(recovery.recoverPending({ limit: 1 })).resolves.toEqual({
      deferred: 0,
      failed: 0,
      prepared: 1,
      rolledBack: 0,
    });
    expect(resolve).toHaveBeenCalledWith({
      subjectIdentifier: lease.subjectIdentifier,
      transitionId: lease.transitionId,
    });
    expect(reconcileTransitionRecovery).toHaveBeenCalledWith({
      lease,
      resolution: committed,
    });
  });

  test("keeps an authority failure fenced and rescheduled without leaking details", async () => {
    const rescheduleTransitionRecovery = mock(async () => "rescheduled" as const);
    const warn = mock(() => undefined);
    const recovery = createSubjectAccessTransitionRecovery({
      authority: {
        resolve: mock(async () => {
          throw new Error("postgresql://secret@db/transition");
        }),
      },
      backlog: {
        claimTransitionRecovery: mock(async () => lease),
        reconcileTransitionRecovery: mock(async () => "prepared" as const),
        rescheduleTransitionRecovery,
      },
      logger: { warn },
      random: { uuid: () => "worker-a" },
      leaseDurationMs: 100,
    });

    await expect(recovery.recoverPending({ limit: 1 })).resolves.toEqual({
      deferred: 0,
      failed: 1,
      prepared: 0,
      rolledBack: 0,
    });
    expect(rescheduleTransitionRecovery).toHaveBeenCalledWith({
      lease,
      retryDelayMs: 5_000,
    });
    expect(warn).toHaveBeenCalledWith({
      errorType: "Error",
      operation: "resolve",
      subjectIdentifier: lease.subjectIdentifier,
      transitionId: lease.transitionId,
    }, "Subject Access transition recovery failed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("postgresql://");
  });
});
