import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { describe, expect, mock, test } from "bun:test";
import { createSubjectAccessTransitionRepository } from "../../src/subject-access-transition.repository";

const receipt: SubjectAccessMutationReceipt = {
  subjectIdentifier: "00000000-0000-4000-8000-000000000001",
  transitionId: "10000000-0000-4000-8000-000000000001",
  ownerToken: "20000000-0000-4000-8000-000000000001",
};

describe("Subject Access transition repository", () => {
  test("reports the stale pending intents released by one bounded reap", async () => {
    const { db, execute } = createDb({
      lockedRows: [],
      executedRows: [
        { id: "10000000-0000-4000-8000-000000000001" },
        { id: "10000000-0000-4000-8000-000000000002" },
      ],
    });
    const repository = createSubjectAccessTransitionRepository(db);

    await expect(repository.reapStalePending({
      limit: 2,
      staleAfterSeconds: 300,
    })).resolves.toEqual({ rolledBack: 2 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  test("fences a late writer before any domain mutation can run", async () => {
    const domainMutation = mock(async () => "must not run");
    const repository = createSubjectAccessTransitionRepository(
      createDb({
        lockedRows: [{
          id: receipt.transitionId,
          subjectIdentifier: receipt.subjectIdentifier,
          ownerToken: receipt.ownerToken,
          status: "rolled_back",
          targetState: "rollback",
        }],
      }).db,
    );

    await expect(repository.runMutation(
      receipt,
      domainMutation,
      () => "disabled",
    )).rejects.toThrow("Subject Access transition mutation owner is no longer pending");
    expect(domainMutation).not.toHaveBeenCalled();
  });

  test("records the exact committed target in the same transaction as the mutation", async () => {
    const events: string[] = [];
    const { db, updatedValues } = createDb({
      lockedRows: [{
        id: receipt.transitionId,
        subjectIdentifier: receipt.subjectIdentifier,
        ownerToken: receipt.ownerToken,
        status: "pending",
        targetState: null,
      }],
      onLock: () => events.push("intent:locked"),
      onUpdate: () => events.push("intent:committed"),
    });
    const repository = createSubjectAccessTransitionRepository(db);

    await expect(repository.runMutation(
      receipt,
      async () => {
        events.push("domain:mutated");
        return { disposition: "awaiting_publication" as const };
      },
      () => "enabled",
    )).resolves.toEqual({ disposition: "awaiting_publication" });

    expect(events).toEqual([
      "intent:locked",
      "domain:mutated",
      "intent:committed",
    ]);
    expect(updatedValues).toMatchObject({
      status: "committed",
      targetState: "enabled",
    });
  });

  test("turns an unlocked pending intent into an authoritative rollback outcome", async () => {
    const { db, updatedValues } = createDb({
      lockedRows: [{
        id: receipt.transitionId,
        subjectIdentifier: receipt.subjectIdentifier,
        ownerToken: receipt.ownerToken,
        status: "pending",
        targetState: null,
      }],
    });
    const repository = createSubjectAccessTransitionRepository(db);

    await expect(repository.resolveRecovery({
      subjectIdentifier: receipt.subjectIdentifier,
      transitionId: receipt.transitionId,
    })).resolves.toEqual({ status: "rolled_back" });
    expect(updatedValues).toMatchObject({
      status: "rolled_back",
      targetState: "rollback",
    });
  });

  test("keeps a missing intent unresolved instead of guessing from account state", async () => {
    const { db, update } = createDb({ lockedRows: [] });
    const repository = createSubjectAccessTransitionRepository(db);

    await expect(repository.resolveRecovery({
      subjectIdentifier: receipt.subjectIdentifier,
      transitionId: receipt.transitionId,
    })).resolves.toEqual({ status: "unresolved" });
    expect(update).not.toHaveBeenCalled();
  });
});

function createDb(options: {
  lockedRows: unknown[];
  executedRows?: unknown[];
  onLock?: () => void;
  onUpdate?: () => void;
}) {
  const lock = mock(async () => {
    options.onLock?.();
    return options.lockedRows;
  });
  const selectWhere = mock(() => ({ for: lock }));
  const selectFrom = mock(() => ({ where: selectWhere }));
  const select = mock(() => ({ from: selectFrom }));
  const updatedValues: Record<string, unknown> = {};
  const returning = mock(async () => [{
    ...options.lockedRows[0] as object,
    ...updatedValues,
  }]);
  const updateWhere = mock(() => ({ returning }));
  const set = mock((values: Record<string, unknown>) => {
    Object.assign(updatedValues, values);
    options.onUpdate?.();
    return { where: updateWhere };
  });
  const update = mock(() => ({ set }));
  const execute = mock(async () => options.executedRows ?? []);

  return {
    db: { execute, select, update } as never,
    execute,
    update,
    updatedValues,
  };
}
