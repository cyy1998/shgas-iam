import type { SubjectAccessMutationReceipt } from "@iam/api-core/subject-access";
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  createSubjectAccessTransitionRecoveryAuthority,
  createSubjectAccessTransitionRepository,
  SubjectAccessTransitionOwnershipError,
} from "../../src/subject-access-transition.repository";
import { createPostgresTestHarness } from "./postgres-test-harness";

const SUBJECT_IDENTIFIER = "11111111-1111-4111-8111-111111111111";

describe("Subject Access transition PostgreSQL contract", () => {
  let harness: Awaited<ReturnType<typeof createPostgresTestHarness>>;

  beforeAll(async () => {
    harness = await createPostgresTestHarness();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    if (harness)
      await harness.close();
  });

  test("persists only recovery intent metadata before the domain mutation starts", async () => {
    const currentReceipt = receipt(1);
    const repository = createSubjectAccessTransitionRepository(harness.db);

    await repository.create(currentReceipt);

    const transitions = await harness.sql<{
      owner_token: string;
      status: string;
      subject_identifier: string;
      target_state: string | null;
    }[]>`
      SELECT owner_token, status, subject_identifier, target_state
      FROM subject_access_transition
      WHERE id = ${currentReceipt.transitionId}
    `;
    const users = await harness.sql<{ count: number }[]>`
      SELECT COUNT(*)::int AS count
      FROM "user"
    `;
    expect([...transitions]).toEqual([{
      owner_token: currentReceipt.ownerToken,
      status: "pending",
      subject_identifier: currentReceipt.subjectIdentifier,
      target_state: null,
    }]);
    expect(users[0]?.count).toBe(0);
  });

  test("retains committed history while allowing a later pending transition for the same subject", async () => {
    const firstReceipt = receipt(1);
    const secondReceipt = receipt(2);
    const repository = createSubjectAccessTransitionRepository(harness.db);
    await repository.create(firstReceipt);
    await harness.db.transaction(async (tx) => {
      await createSubjectAccessTransitionRepository(tx).runMutation(
        firstReceipt,
        async () => true,
        () => "disabled",
      );
    });

    expect(await repository.create(secondReceipt)).toBeUndefined();

    const rows = await harness.sql<{
      id: string;
      status: string;
      target_state: string | null;
    }[]>`
      SELECT id, status, target_state
      FROM subject_access_transition
      ORDER BY create_time, id
    `;
    expect([...rows]).toEqual([
      {
        id: firstReceipt.transitionId,
        status: "committed",
        target_state: "disabled",
      },
      {
        id: secondReceipt.transitionId,
        status: "pending",
        target_state: null,
      },
    ]);
  });

  test("allows only one concurrent pending transition per subject", async () => {
    const repository = createSubjectAccessTransitionRepository(harness.db);

    const outcomes = await Promise.allSettled([
      repository.create(receipt(1)),
      repository.create(receipt(2)),
    ]);

    expect(outcomes.filter(outcome => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find(outcome => outcome.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected")
      expect(postgresErrorCode(rejected.reason)).toBe("23505");
  });

  test("reaps a crashed pre-begin intent and idempotently releases its subject fence", async () => {
    const crashedReceipt = receipt(1);
    const replacementReceipt = receipt(2);
    const repository = createSubjectAccessTransitionRepository(harness.db);
    await repository.create(crashedReceipt);
    await harness.sql`
      UPDATE subject_access_transition
      SET update_time = statement_timestamp() - interval '10 minutes'
      WHERE id = ${crashedReceipt.transitionId}
    `;

    expect(await repository.reapStalePending({
      staleAfterSeconds: 300,
      limit: 10,
    })).toEqual({ rolledBack: 1 });
    expect(await repository.reapStalePending({
      staleAfterSeconds: 300,
      limit: 10,
    })).toEqual({ rolledBack: 0 });
    expect(await repository.create(replacementReceipt)).toBeUndefined();

    const rows = await harness.sql<{
      id: string;
      status: string;
      target_state: string | null;
    }[]>`
      SELECT id, status, target_state
      FROM subject_access_transition
      ORDER BY create_time, id
    `;
    expect([...rows]).toEqual([
      {
        id: crashedReceipt.transitionId,
        status: "rolled_back",
        target_state: "rollback",
      },
      {
        id: replacementReceipt.transitionId,
        status: "pending",
        target_state: null,
      },
    ]);
  });

  test("does not reap a fresh pending intent", async () => {
    const currentReceipt = receipt(1);
    const repository = createSubjectAccessTransitionRepository(harness.db);
    await repository.create(currentReceipt);

    expect(await repository.reapStalePending({
      staleAfterSeconds: 300,
      limit: 10,
    })).toEqual({ rolledBack: 0 });

    const rows = await harness.sql<{ status: string }[]>`
      SELECT status
      FROM subject_access_transition
      WHERE id = ${currentReceipt.transitionId}
    `;
    expect([...rows]).toEqual([{ status: "pending" }]);
  });

  test("skips a stale intent while its mutation transaction holds the row lock", async () => {
    const currentReceipt = receipt(1);
    const repository = createSubjectAccessTransitionRepository(harness.db);
    await repository.create(currentReceipt);
    await harness.sql`
      UPDATE subject_access_transition
      SET update_time = statement_timestamp() - interval '10 minutes'
      WHERE id = ${currentReceipt.transitionId}
    `;
    const mutationEntered = deferred<void>();
    const releaseMutation = deferred<void>();
    const mutation = harness.db.transaction(async tx =>
      await createSubjectAccessTransitionRepository(tx).runMutation(
        currentReceipt,
        async () => {
          mutationEntered.resolve();
          await releaseMutation.promise;
          return true;
        },
        () => "disabled",
      ));
    await mutationEntered.promise;

    try {
      expect(await repository.reapStalePending({
        staleAfterSeconds: 300,
        limit: 10,
      })).toEqual({ rolledBack: 0 });
      releaseMutation.resolve();
      expect(await mutation).toBe(true);
      expect(await repository.assertCommitted(
        currentReceipt,
        "disabled",
      )).toBeUndefined();
    }
    finally {
      releaseMutation.resolve();
      await Promise.allSettled([mutation]);
    }
  });

  test.each([
    ["unknown status", "unknown", null],
    ["pending with a target", "pending", "enabled"],
    ["committed without a target", "committed", null],
    ["rolled back toward an enabled target", "rolled_back", "enabled"],
  ])("rejects %s through database CHECK constraints", async (_, status, targetState) => {
    const currentReceipt = receipt(1);

    const insert = harness.sql`
      INSERT INTO subject_access_transition (
        id,
        subject_identifier,
        owner_token,
        status,
        target_state
      )
      VALUES (
        ${currentReceipt.transitionId},
        ${currentReceipt.subjectIdentifier},
        ${currentReceipt.ownerToken},
        ${status},
        ${targetState}
      )
    `;

    expect(postgresErrorCode(await captureRejection(insert))).toBe("23514");
  });

  test("waits for an active mutation lock and then returns its exact committed target", async () => {
    const currentReceipt = receipt(1);
    await createSubjectAccessTransitionRepository(harness.db).create(currentReceipt);
    const mutationEntered = deferred<void>();
    const releaseMutation = deferred<void>();
    const mutation = harness.db.transaction(async tx =>
      await createSubjectAccessTransitionRepository(tx).runMutation(
        currentReceipt,
        async () => {
          mutationEntered.resolve();
          await releaseMutation.promise;
          return true;
        },
        () => "disabled",
      ));
    await mutationEntered.promise;
    const authority = createRecoveryAuthority(harness);
    let recoverySettled = false;
    const recovery = authority.resolve({
      subjectIdentifier: currentReceipt.subjectIdentifier,
      transitionId: currentReceipt.transitionId,
    }).then((resolution) => {
      recoverySettled = true;
      return resolution;
    });

    try {
      await harness.waitForScopedClientLock();
      expect(recoverySettled).toBe(false);
      releaseMutation.resolve();
      expect(await mutation).toBe(true);
      expect(await recovery).toEqual({
        status: "committed",
        targetState: "disabled",
      });
    }
    finally {
      releaseMutation.resolve();
      await Promise.allSettled([mutation, recovery]);
    }
  });

  test("rolls back an abandoned pending intent and fences a late mutation before domain writes", async () => {
    const currentReceipt = receipt(1);
    await createSubjectAccessTransitionRepository(harness.db).create(currentReceipt);
    const authority = createRecoveryAuthority(harness);

    expect(await authority.resolve({
      subjectIdentifier: currentReceipt.subjectIdentifier,
      transitionId: currentReceipt.transitionId,
    })).toEqual({ status: "rolled_back" });

    const domainMutation = mock(async () => true);
    const error = await captureRejection(harness.db.transaction(async tx =>
      await createSubjectAccessTransitionRepository(tx).runMutation(
        currentReceipt,
        domainMutation,
        () => "enabled",
      )));
    expect(error).toBeInstanceOf(SubjectAccessTransitionOwnershipError);
    expect(domainMutation).not.toHaveBeenCalled();
  });

  test("defers recovery when the exact durable receipt is absent", async () => {
    const currentReceipt = receipt(1);

    expect(await createRecoveryAuthority(harness).resolve({
      subjectIdentifier: currentReceipt.subjectIdentifier,
      transitionId: currentReceipt.transitionId,
    })).toEqual({ status: "unresolved" });
  });
});

function createRecoveryAuthority(
  harness: Awaited<ReturnType<typeof createPostgresTestHarness>>,
) {
  return createSubjectAccessTransitionRecoveryAuthority({
    transaction: async callback =>
      await harness.db.transaction(async tx => await callback(tx)),
  });
}

function receipt(sequence: number): SubjectAccessMutationReceipt {
  const suffix = sequence.toString().padStart(12, "0");
  return {
    subjectIdentifier: SUBJECT_IDENTIFIER,
    transitionId: `22222222-2222-4222-8222-${suffix}`,
    ownerToken: `33333333-3333-4333-8333-${suffix}`,
  };
}

function postgresErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null)
    return undefined;
  if ("code" in error && typeof (error as { code?: unknown }).code === "string")
    return (error as { code: string }).code;
  return "cause" in error
    ? postgresErrorCode((error as { cause?: unknown }).cause)
    : undefined;
}

async function captureRejection(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  }
  catch (error) {
    return error;
  }
  throw new Error("expected PostgreSQL operation to reject");
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}
