import type {
  SubjectAccessMutationReceipt,
  SubjectAccessTransitionRecoveryAuthority,
  SubjectAccessTransitionResolution,
  SubjectAccessTransitionTarget,
} from "@iam/api-core/subject-access";
import type { DbClient } from "@iam/db";
import { firstRow } from "@iam/db/query-utils";
import { subjectAccessTransitions } from "@iam/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export function createSubjectAccessTransitionRepository(db: DbClient) {
  async function create(receipt: SubjectAccessMutationReceipt) {
    await db.insert(subjectAccessTransitions).values({
      id: receipt.transitionId,
      subjectIdentifier: receipt.subjectIdentifier,
      ownerToken: receipt.ownerToken,
      status: "pending",
      targetState: null,
    });
  }

  async function markRolledBack(receipt: SubjectAccessMutationReceipt) {
    const updated = firstRow(await db
      .update(subjectAccessTransitions)
      .set({
        status: "rolled_back",
        targetState: "rollback",
        updateTime: new Date(),
      })
      .where(and(
        eq(subjectAccessTransitions.id, receipt.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, receipt.subjectIdentifier),
        eq(subjectAccessTransitions.ownerToken, receipt.ownerToken),
        eq(subjectAccessTransitions.status, "pending"),
        isNull(subjectAccessTransitions.targetState),
      ))
      .returning({ id: subjectAccessTransitions.id }));
    if (updated !== null)
      return;

    const existing = await readExact(receipt);
    if (
      existing?.status === "rolled_back"
      && existing.targetState === "rollback"
    ) {
      return;
    }
    throw new SubjectAccessTransitionOwnershipError(
      "Subject Access transition rollback owner is no longer pending",
    );
  }

  async function assertCommitted(
    receipt: SubjectAccessMutationReceipt,
    targetState: SubjectAccessTransitionTarget,
  ) {
    const existing = await readExact(receipt);
    if (
      existing?.status === "committed"
      && existing.targetState === targetState
    ) {
      return;
    }
    throw new SubjectAccessTransitionOwnershipError(
      "Subject Access transition outcome was not committed",
    );
  }

  async function runMutation<T>(
    receipt: SubjectAccessMutationReceipt,
    mutation: () => Promise<T>,
    resolveTarget: (
      result: T,
    ) => SubjectAccessTransitionTarget,
  ): Promise<T> {
    const locked = firstRow(await db
      .select()
      .from(subjectAccessTransitions)
      .where(and(
        eq(subjectAccessTransitions.id, receipt.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, receipt.subjectIdentifier),
        eq(subjectAccessTransitions.ownerToken, receipt.ownerToken),
      ))
      .for("update"));
    if (
      locked?.status !== "pending"
      || locked.targetState !== null
    ) {
      throw new SubjectAccessTransitionOwnershipError(
        "Subject Access transition mutation owner is no longer pending",
      );
    }

    const result = await mutation();
    const targetState = resolveTarget(result);
    const committed = firstRow(await db
      .update(subjectAccessTransitions)
      .set({
        status: "committed",
        targetState,
        updateTime: new Date(),
      })
      .where(and(
        eq(subjectAccessTransitions.id, receipt.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, receipt.subjectIdentifier),
        eq(subjectAccessTransitions.ownerToken, receipt.ownerToken),
        eq(subjectAccessTransitions.status, "pending"),
        isNull(subjectAccessTransitions.targetState),
      ))
      .returning({ id: subjectAccessTransitions.id }));
    if (committed === null) {
      throw new SubjectAccessTransitionOwnershipError(
        "Subject Access transition mutation owner lost its fence",
      );
    }
    return result;
  }

  async function reapStalePending(input: {
    readonly staleAfterSeconds: number;
    readonly limit: number;
  }) {
    const rolledBack = await db.execute<{ id: string }>(sql`
      WITH stale_pending AS (
        SELECT id
        FROM ${subjectAccessTransitions}
        WHERE status = 'pending'
          AND target_state IS NULL
          AND update_time <= statement_timestamp() - make_interval(secs => ${input.staleAfterSeconds})
        ORDER BY update_time, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.limit}
      )
      UPDATE ${subjectAccessTransitions}
      SET status = 'rolled_back',
          target_state = 'rollback',
          update_time = statement_timestamp()
      WHERE id IN (SELECT id FROM stale_pending)
        AND status = 'pending'
        AND target_state IS NULL
      RETURNING id
    `);
    return { rolledBack: rolledBack.length };
  }

  async function resolveRecovery(input: {
    readonly subjectIdentifier: string;
    readonly transitionId: string;
  }): Promise<SubjectAccessTransitionResolution> {
    const locked = firstRow(await db
      .select()
      .from(subjectAccessTransitions)
      .where(and(
        eq(subjectAccessTransitions.id, input.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, input.subjectIdentifier),
      ))
      .for("update"));
    if (locked === null)
      return { status: "unresolved" };
    if (locked.status === "rolled_back" && locked.targetState === "rollback")
      return { status: "rolled_back" };
    if (locked.status === "committed") {
      if (locked.targetState === "rollback")
        return { status: "rolled_back" };
      if (
        locked.targetState === "enabled"
        || locked.targetState === "disabled"
      ) {
        return {
          status: "committed",
          targetState: locked.targetState,
        };
      }
      return { status: "unresolved" };
    }
    if (locked.status !== "pending" || locked.targetState !== null)
      return { status: "unresolved" };

    const rolledBack = firstRow(await db
      .update(subjectAccessTransitions)
      .set({
        status: "rolled_back",
        targetState: "rollback",
        updateTime: new Date(),
      })
      .where(and(
        eq(subjectAccessTransitions.id, input.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, input.subjectIdentifier),
        eq(subjectAccessTransitions.status, "pending"),
        isNull(subjectAccessTransitions.targetState),
      ))
      .returning({ id: subjectAccessTransitions.id }));
    if (rolledBack === null) {
      throw new SubjectAccessTransitionOwnershipError(
        "Subject Access transition recovery lost its PostgreSQL fence",
      );
    }
    return { status: "rolled_back" };
  }

  async function readExact(receipt: SubjectAccessMutationReceipt) {
    return firstRow(await db
      .select()
      .from(subjectAccessTransitions)
      .where(and(
        eq(subjectAccessTransitions.id, receipt.transitionId),
        eq(subjectAccessTransitions.subjectIdentifier, receipt.subjectIdentifier),
        eq(subjectAccessTransitions.ownerToken, receipt.ownerToken),
      ))
      .limit(1));
  }

  return {
    assertCommitted,
    create,
    markRolledBack,
    reapStalePending,
    resolveRecovery,
    runMutation,
  };
}

export type SubjectAccessTransitionRepository = ReturnType<
  typeof createSubjectAccessTransitionRepository
>;

export function createSubjectAccessTransitionRecoveryAuthority(options: {
  readonly transaction: <T>(
    callback: (db: DbClient) => Promise<T>,
  ) => Promise<T>;
}): SubjectAccessTransitionRecoveryAuthority {
  return {
    async resolve(input) {
      return await options.transaction(async tx =>
        await createSubjectAccessTransitionRepository(tx)
          .resolveRecovery(input));
    },
  };
}

export class SubjectAccessTransitionOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubjectAccessTransitionOwnershipError";
  }
}
