import type { SubjectAccessBarrier } from "./barrier";
import type {
  SubjectAccessBeginReceipt,
  SubjectAccessMutationReceipt,
  SubjectAccessTransition,
  SubjectAccessTransitionTarget,
} from "./model";
import { consumeTransactionRollbackConfirmation } from "../uow";
import {
  SubjectAccessBeginPendingError,
  SubjectAccessCommitPendingError,
  SubjectAccessRollbackPendingError,
} from "./errors";

export interface SubjectAccessLifecycleLogger {
  warn: (fields: Record<string, unknown>, message: string) => void;
}

export interface CreateSubjectAccessLifecycleOptions {
  readonly barrier: Pick<
    SubjectAccessBarrier,
    "abortBegin" | "beginBlocking" | "finalize" | "prepareRepair" | "rollback"
  >;
  readonly logger: SubjectAccessLifecycleLogger;
  readonly random: {
    readonly uuid: () => string;
  };
  readonly transitionIntent: {
    readonly create: (receipt: SubjectAccessMutationReceipt) => Promise<void>;
    readonly assertCommitted: (
      receipt: SubjectAccessMutationReceipt,
      targetState: SubjectAccessTransitionTarget,
    ) => Promise<void>;
    readonly markRolledBack: (
      receipt: SubjectAccessMutationReceipt,
    ) => Promise<void>;
  };
}

export interface SubjectAccessLifecycleRunInput<T> {
  readonly subjectIdentifier: string;
  readonly disposition:
    | SubjectAccessLifecycleDisposition
    | ((result: T) => SubjectAccessLifecycleDisposition);
  readonly mutate: (receipt: SubjectAccessMutationReceipt) => Promise<T>;
  readonly revokeSessions?: (
    result: T,
    context: {
      readonly invalidatedSubjectAccessTransitionId: string;
    },
  ) => Promise<unknown>;
  readonly observability?: {
    readonly requestId?: string;
    readonly traceId?: string;
  };
}

export type SubjectAccessLifecycleDisposition
  = | "disabled"
    | "awaiting_publication"
    | "restore_previous";

export function createSubjectAccessLifecycle(options: CreateSubjectAccessLifecycleOptions) {
  async function run<T>(input: SubjectAccessLifecycleRunInput<T>): Promise<T> {
    const mutationReceipt = {
      subjectIdentifier: input.subjectIdentifier,
      transitionId: options.random.uuid(),
      ownerToken: options.random.uuid(),
    } satisfies SubjectAccessMutationReceipt;
    await options.transitionIntent.create(mutationReceipt);

    let transition: SubjectAccessTransition;
    try {
      transition = await options.barrier.beginBlocking(input.subjectIdentifier, {
        transitionId: mutationReceipt.transitionId,
      });
    }
    catch (beginError) {
      try {
        await options.transitionIntent.markRolledBack(mutationReceipt);
      }
      catch (intentError) {
        logPostCommitFailure(
          options.logger,
          input,
          "mark_intent_rolled_back",
          intentError,
          mutationReceipt,
        );
      }
      if (beginError instanceof SubjectAccessBeginPendingError) {
        try {
          await options.barrier.abortBegin(beginError.receipt);
        }
        catch (abortError) {
          logPostCommitFailure(
            options.logger,
            input,
            "abort_begin",
            abortError,
            beginError.receipt,
          );
        }
      }
      throw beginError;
    }
    let result: T;
    try {
      result = await input.mutate(mutationReceipt);
    }
    catch (mutationError) {
      if (!consumeTransactionRollbackConfirmation(mutationError)) {
        logPostCommitFailure(
          options.logger,
          input,
          "mutation_outcome_unknown",
          mutationError,
          transition,
        );
        throw mutationError;
      }
      try {
        await options.transitionIntent.markRolledBack(mutationReceipt);
        await options.barrier.rollback(transition);
      }
      catch (rollbackError) {
        logPostCommitFailure(
          options.logger,
          input,
          "rollback",
          rollbackError,
          transition,
        );
        throw new SubjectAccessRollbackPendingError(transition);
      }
      throw mutationError;
    }

    const disposition = typeof input.disposition === "function"
      ? input.disposition(result)
      : input.disposition;
    const targetState = dispositionToTarget(disposition);
    try {
      await options.transitionIntent.assertCommitted(
        mutationReceipt,
        targetState,
      );
    }
    catch (intentError) {
      logPostCommitFailure(
        options.logger,
        input,
        "confirm_commit_intent",
        intentError,
        transition,
      );
      throw new SubjectAccessCommitPendingError(transition, targetState);
    }
    if (disposition === "restore_previous") {
      try {
        await options.barrier.rollback(transition);
      }
      catch (rollbackError) {
        logPostCommitFailure(
          options.logger,
          input,
          "restore_previous",
          rollbackError,
          transition,
        );
        throw new SubjectAccessRollbackPendingError(transition);
      }
    }
    if (disposition === "disabled") {
      try {
        await options.barrier.prepareRepair(transition, "disabled");
      }
      catch (prepareError) {
        logPostCommitFailure(
          options.logger,
          input,
          "prepare_repair",
          prepareError,
          transition,
        );
        throw new SubjectAccessCommitPendingError(transition, "disabled");
      }
      try {
        await options.barrier.finalize(transition, "disabled");
      }
      catch (finalizeError) {
        logPostCommitFailure(
          options.logger,
          input,
          "finalize",
          finalizeError,
          transition,
        );
      }
    }
    if (disposition === "awaiting_publication") {
      try {
        await options.barrier.prepareRepair(transition, "enabled");
      }
      catch (prepareError) {
        logPostCommitFailure(
          options.logger,
          input,
          "prepare_repair",
          prepareError,
          transition,
        );
        throw new SubjectAccessCommitPendingError(transition, "enabled");
      }
    }

    if (
      disposition === "disabled"
      && input.revokeSessions !== undefined
      && transition.previousCommittedTransitionId !== null
    ) {
      try {
        await input.revokeSessions(result, {
          invalidatedSubjectAccessTransitionId:
            transition.previousCommittedTransitionId,
        });
      }
      catch (revocationError) {
        logPostCommitFailure(
          options.logger,
          input,
          "revoke_sessions",
          revocationError,
          transition,
        );
      }
    }
    return result;
  }

  async function confirmRollback(receipt: SubjectAccessTransition) {
    await options.barrier.rollback(receipt);
  }

  async function confirmBeginAborted(receipt: SubjectAccessBeginReceipt) {
    await options.barrier.abortBegin(receipt);
  }

  async function confirmCommit(
    receipt: SubjectAccessTransition,
    targetState: "enabled" | "disabled",
  ) {
    await options.barrier.prepareRepair(receipt, targetState);
    if (targetState === "disabled")
      await options.barrier.finalize(receipt, targetState);
  }

  return { confirmBeginAborted, confirmCommit, confirmRollback, run };
}

export type SubjectAccessLifecycle = ReturnType<typeof createSubjectAccessLifecycle>;

function logPostCommitFailure<T>(
  logger: SubjectAccessLifecycleLogger,
  input: SubjectAccessLifecycleRunInput<T>,
  operation:
    | "finalize"
    | "abort_begin"
    | "confirm_commit_intent"
    | "mark_intent_rolled_back"
    | "mutation_outcome_unknown"
    | "prepare_repair"
    | "restore_previous"
    | "revoke_sessions"
    | "rollback",
  error: unknown,
  transition?: SubjectAccessBeginReceipt,
) {
  logger.warn({
    operation,
    subjectIdentifier: input.subjectIdentifier,
    requestId: input.observability?.requestId,
    traceId: input.observability?.traceId,
    ...(transition === undefined ? {} : { transitionId: transition.transitionId }),
    ...safeErrorSummary(error),
  }, "Subject Access post-commit action failed");
}

function dispositionToTarget(
  disposition: SubjectAccessLifecycleDisposition,
): SubjectAccessTransitionTarget {
  if (disposition === "restore_previous")
    return "rollback";
  return disposition === "disabled" ? "disabled" : "enabled";
}

function safeErrorSummary(error: unknown) {
  if (typeof error !== "object" || error === null)
    return { errorType: "UnknownError" };

  return {
    errorType: safeToken(error, "name") ?? "UnknownError",
    errorCode: safeToken(error, "code"),
  };
}

function safeToken(error: object, key: "code" | "name") {
  try {
    const value = (error as Record<string, unknown>)[key];
    return typeof value === "string" && /^[A-Za-z][\w.-]{0,63}$/u.test(value)
      ? value
      : undefined;
  }
  catch {
    return undefined;
  }
}
