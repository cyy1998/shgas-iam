import type { AfterCommitLoggerPort, AfterCommitTask } from "./after-commit";
import type { UnitOfWorkPort } from "./unit-of-work";
import { createAfterCommitPort, runAfterCommitTasks } from "./after-commit";
import { markTransactionRollbackConfirmed } from "./unit-of-work";

const noopAfterCommitLogger: AfterCommitLoggerPort = {
  warn: () => undefined,
  error: () => undefined,
};

export interface CreateImmediateUnitOfWorkOptions {
  logger?: AfterCommitLoggerPort;
}

export function createImmediateUnitOfWork<TxPorts extends object>(
  txPorts: TxPorts,
  options: CreateImmediateUnitOfWorkOptions = {},
): UnitOfWorkPort<TxPorts> {
  return {
    async transaction(callback, transactionOptions) {
      const afterCommitTasks: AfterCommitTask[] = [];
      let result: Awaited<ReturnType<typeof callback>>;
      try {
        result = await callback({
          ...txPorts,
          ...createAfterCommitPort(afterCommitTasks),
        });
      }
      catch (error) {
        markTransactionRollbackConfirmed(error);
        throw error;
      }

      await runAfterCommitTasks(
        afterCommitTasks,
        options.logger ?? noopAfterCommitLogger,
        transactionOptions?.observability,
      );

      return result;
    },
  };
}
