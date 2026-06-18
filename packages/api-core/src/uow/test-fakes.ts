import type { AfterCommitLoggerPort, AfterCommitTask } from "./after-commit";
import type { UnitOfWorkPort } from "./unit-of-work";
import { createAfterCommitPort, runAfterCommitTasks } from "./after-commit";

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
    async transaction(callback) {
      const afterCommitTasks: AfterCommitTask[] = [];
      const result = await callback({
        ...txPorts,
        ...createAfterCommitPort(afterCommitTasks),
      });

      await runAfterCommitTasks(afterCommitTasks, options.logger ?? noopAfterCommitLogger);

      return result;
    },
  };
}
