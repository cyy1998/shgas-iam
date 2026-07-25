import type { ObservabilityContext } from "../observability";
import type {
  AfterCommitLoggerPort,
  AfterCommitPort,
  AfterCommitRegistrationPort,
  AfterCommitTask,
} from "./after-commit";
import { createAfterCommitPort, runAfterCommitTasks } from "./after-commit";

export interface TransactionalDbPort<Tx> {
  transaction: <T>(callback: (tx: Tx) => Promise<T>) => Promise<T>;
}

export type TransactionContext<TxPorts extends object> = TxPorts & AfterCommitPort;

export interface UnitOfWorkTransactionOptions {
  observability?: ObservabilityContext | null;
}

export interface UnitOfWorkTransactionLifecycle {
  afterCommit: AfterCommitRegistrationPort;
  observability: ObservabilityContext | null;
}

export interface UnitOfWorkPort<TxPorts extends object> {
  transaction: <T>(
    callback: (tx: TransactionContext<TxPorts>) => Promise<T>,
    options?: UnitOfWorkTransactionOptions,
  ) => Promise<T>;
}

export interface CreateUnitOfWorkOptions<Tx, TxPorts extends object> {
  db: TransactionalDbPort<Tx>;
  logger: AfterCommitLoggerPort;
  createTxPorts: (tx: Tx, lifecycle: UnitOfWorkTransactionLifecycle) => TxPorts;
}

/**
 * Own a single transaction boundary. Nested UnitOfWork ownership is unsupported because an inner commit could
 * execute after-commit tasks before an outer transaction rolls back.
 */
export function createUnitOfWork<Tx, TxPorts extends object>(
  options: CreateUnitOfWorkOptions<Tx, TxPorts>,
): UnitOfWorkPort<TxPorts> {
  return {
    async transaction(callback, transactionOptions) {
      const afterCommitTasks: AfterCommitTask[] = [];
      const afterCommit = createAfterCommitPort(afterCommitTasks).afterCommit;
      const observability = transactionOptions?.observability ?? null;

      const result = await options.db.transaction(async (tx) => {
        const txPorts = options.createTxPorts(tx, { afterCommit, observability });
        return await callback({
          ...txPorts,
          afterCommit,
        });
      });

      await runAfterCommitTasks(afterCommitTasks, options.logger, observability);

      return result;
    },
  };
}

export function mapUnitOfWork<SourceTxPorts extends object, MappedTxPorts extends object>(
  unitOfWork: UnitOfWorkPort<SourceTxPorts>,
  map: (tx: TransactionContext<SourceTxPorts>) => MappedTxPorts,
): UnitOfWorkPort<MappedTxPorts> {
  return {
    async transaction(callback, options) {
      return await unitOfWork.transaction(async (tx) => {
        const mappedTxPorts = map(tx);
        return await callback({
          ...mappedTxPorts,
          afterCommit: tx.afterCommit,
        });
      }, options);
    },
  };
}
