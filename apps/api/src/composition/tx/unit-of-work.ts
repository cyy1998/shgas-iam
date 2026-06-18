import type { DbClient } from "@iam/db";
import type { AfterCommitLoggerPort } from "../runtime";

export interface TransactionalDbPort {
  transaction: <T>(callback: (tx: DbClient) => Promise<T>) => Promise<T>;
}

export type AfterCommitCallback<RootPorts> = (rootPorts: RootPorts) => Promise<void> | void;

export interface AfterCommitPort<RootPorts> {
  afterCommit: (name: string, callback: AfterCommitCallback<RootPorts>) => void;
}

export type UnitOfWorkContext<TxPorts extends object, RootPorts> = TxPorts & AfterCommitPort<RootPorts>;

export interface UnitOfWork<TxPorts extends object, RootPorts> {
  transaction: <T>(callback: (tx: UnitOfWorkContext<TxPorts, RootPorts>) => Promise<T>) => Promise<T>;
}

export interface CreateUnitOfWorkOptions<TxPorts extends object, RootPorts> {
  db: TransactionalDbPort;
  logger: AfterCommitLoggerPort;
  rootPorts: RootPorts;
  createTxPorts: (tx: DbClient) => TxPorts;
}

export function createUnitOfWork<TxPorts extends object, RootPorts = undefined>(
  options: CreateUnitOfWorkOptions<TxPorts, RootPorts>,
): UnitOfWork<TxPorts, RootPorts> {
  return {
    async transaction(callback) {
      const afterCommitTasks: Array<{ name: string; callback: AfterCommitCallback<RootPorts> }> = [];

      const result = await options.db.transaction(async (tx) => {
        const txPorts = options.createTxPorts(tx);
        const context = {
          ...txPorts,
          afterCommit(name, afterCommitCallback) {
            afterCommitTasks.push({ name, callback: afterCommitCallback });
          },
        } satisfies UnitOfWorkContext<TxPorts, RootPorts>;

        return await callback(context);
      });

      for (const task of afterCommitTasks) {
        try {
          await task.callback(options.rootPorts);
        }
        catch (err) {
          options.logger.warn({ afterCommit: task.name, err }, "afterCommit callback failed");
        }
      }

      return result;
    },
  };
}
