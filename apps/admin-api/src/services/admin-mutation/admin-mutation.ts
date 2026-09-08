import type { SubjectAccessLifecycleRunInput } from "@iam/api-core/subject-access";
import type { TransactionContext, UnitOfWorkPort, UnitOfWorkTransactionOptions } from "@iam/api-core/uow";
import type { AdminMutationResult } from "@iam/contracts";
import { INTERNAL_SERVER_ERROR } from "@iam/api-core/core/http-status-codes";
import { CustomError } from "@iam/api-core/errors";
import { AfterCommitRequiredTaskError } from "@iam/api-core/uow";
import { ApiErrorCode } from "@iam/contracts";

export class AdminMutationCommittedError extends CustomError {
  constructor() {
    super("业务已提交，但后续处理失败；请刷新确认并修复，不要自动重试", {
      code: ApiErrorCode.AdminMutationCommitted,
      httpStatus: INTERNAL_SERVER_ERROR,
    });
    this.name = "AdminMutationCommittedError";
  }
}

/** One UoW owns locking and commit; domains retain all comparisons and side-effect decisions. */
export function createAdminMutation<Ports extends object>(uow: UnitOfWorkPort<Ports>) {
  async function transaction<Result>(
    command: (tx: TransactionContext<Ports>) => Promise<AdminMutationResult<Result>>,
    options?: UnitOfWorkTransactionOptions,
  ): Promise<AdminMutationResult<Result>> {
    let commandCompleted = false;
    try {
      return await uow.transaction(async (tx) => {
        const result = await command(tx);
        commandCompleted = true;
        return result;
      }, options);
    }
    catch (error) {
      if (commandCompleted && error instanceof AfterCommitRequiredTaskError)
        throw new AdminMutationCommittedError();
      throw error;
    }
  }

  return {
    transaction,
    async locked<Target, Result>(
      lock: (tx: TransactionContext<Ports>) => Promise<Target | null>,
      notFound: () => Error,
      command: (tx: TransactionContext<Ports>, target: Target) => Promise<AdminMutationResult<Result>>,
      options?: UnitOfWorkTransactionOptions,
    ) {
      return transaction(async (tx) => {
        const target = await lock(tx);
        if (target === null)
          throw notFound();
        return command(tx, target);
      }, options);
    },
  };
}

/** Preserve rollback error identity until the source UoW confirms commit. */
export async function runAdminSubjectAccessMutation<T>(
  lifecycle: { run: <Result>(input: SubjectAccessLifecycleRunInput<Result>) => Promise<Result> },
  input: SubjectAccessLifecycleRunInput<T>,
): Promise<T> {
  let committed = false;
  try {
    return await lifecycle.run({
      ...input,
      mutate: async (receipt) => {
        const result = await input.mutate(receipt);
        committed = true;
        return result;
      },
    });
  }
  catch (error) {
    if (committed)
      throw new AdminMutationCommittedError();
    throw error;
  }
}
