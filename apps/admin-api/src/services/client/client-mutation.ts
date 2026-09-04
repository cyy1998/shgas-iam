import type {
  TransactionContext,
  UnitOfWorkPort,
  UnitOfWorkTransactionOptions,
} from "@iam/api-core/uow";
import type {
  AdminClientMutationLoggerPort,
  AdminClientRuntimeInvalidationPort,
} from "./client.port";
import {
  AfterCommitRequiredTaskError,
  consumeTransactionRollbackConfirmation,
} from "@iam/api-core/uow";

const CLIENT_RUNTIME_INVALIDATION_TASK
  = "admin.client.runtime_snapshot.invalidate";

export class ClientMutationTargetRequiredError extends Error {
  constructor(message = "Client mutation must bind exactly one target") {
    super(message);
    this.name = "ClientMutationTargetRequiredError";
  }
}

export type BindAdminClientMutationTarget = <T>(
  clientCode: string,
  mutation: () => Promise<T>,
) => Promise<T>;

export interface CreateAdminClientMutationOptions<TxPorts extends object> {
  readonly invalidation: AdminClientRuntimeInvalidationPort;
  readonly logger: AdminClientMutationLoggerPort;
  readonly uow: UnitOfWorkPort<TxPorts>;
}

export function createAdminClientMutation<TxPorts extends object>(
  options: CreateAdminClientMutationOptions<TxPorts>,
) {
  async function transaction<T>(
    callback: (
      tx: TransactionContext<TxPorts>,
      bindTarget: BindAdminClientMutationTarget,
    ) => Promise<T>,
    transactionOptions?: UnitOfWorkTransactionOptions,
  ): Promise<T> {
    let targetClientCode: string | undefined;
    let callbackCompleted = false;

    try {
      return await options.uow.transaction(async (tx) => {
        let targetBound = false;
        const bindTarget: BindAdminClientMutationTarget = async (
          clientCode,
          mutation,
        ) => {
          if (targetBound)
            throw new ClientMutationTargetRequiredError();

          targetBound = true;
          targetClientCode = clientCode;
          tx.afterCommit.required(
            CLIENT_RUNTIME_INVALIDATION_TASK,
            async () => {
              await options.invalidation.invalidateClient(clientCode);
            },
          );
          return await mutation();
        };

        const result = await callback(tx, bindTarget);
        if (!targetBound)
          throw new ClientMutationTargetRequiredError();
        callbackCompleted = true;
        return result;
      }, transactionOptions);
    }
    catch (error) {
      if (consumeTransactionRollbackConfirmation(error)) {
        throw error;
      }

      if (error instanceof AfterCommitRequiredTaskError)
        throw error;

      if (!callbackCompleted || targetClientCode === undefined)
        throw error;

      try {
        await options.invalidation.invalidateClient(targetClientCode);
      }
      catch {
        try {
          options.logger.error({
            clientCode: targetClientCode,
            operation: "client_runtime_snapshot_invalidation",
            outcome: "repair_required",
          }, "Client Runtime Snapshot requires explicit repair");
        }
        catch {
          // Observability cannot replace the original database outcome.
        }
      }
      throw error;
    }
  }

  return { transaction };
}
