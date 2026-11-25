import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import type { TransactionContext, UnitOfWorkPort, UnitOfWorkTransactionOptions } from "@iam/unit-of-work";
import { AfterCommitRequiredTaskError, consumeTransactionRollbackConfirmation } from "@iam/unit-of-work";
import type { AdminClientMutationLoggerPort, AdminClientRuntimeInvalidationPort } from "./client.port";

const CLIENT_RUNTIME_INVALIDATION_TASK = "admin.client.runtime_snapshot.invalidate";

export class ClientMutationTargetRequiredError extends Error {
  constructor(message = "Client mutation must bind exactly one target") {
    super(message);
    this.name = "ClientMutationTargetRequiredError";
  }
}

type RegisterGenericCacheInvalidation = (invalidate: () => Promise<unknown>) => void;
export type BindAdminClientMutationTarget = <T>(
  clientCode: string,
  mutation: (registerGenericCacheInvalidation: RegisterGenericCacheInvalidation) => Promise<T>,
) => Promise<T>;

export interface CreateAdminClientMutationOptions<TxPorts extends object> {
  readonly invalidation: AdminClientRuntimeInvalidationPort;
  readonly logger: AdminClientMutationLoggerPort;
  readonly uow: UnitOfWorkPort<TxPorts>;
}

export function createAdminClientMutation<TxPorts extends object>(options: CreateAdminClientMutationOptions<TxPorts>) {
  async function transaction<T>(
    callback: (tx: TransactionContext<TxPorts>, bindTarget: BindAdminClientMutationTarget) => Promise<T>,
    transactionOptions?: UnitOfWorkTransactionOptions,
  ): Promise<T> {
    let targetClientCode: string | undefined;
    let callbackCompleted = false;
    const invalidations: { cache: "snapshot" | "generic"; invalidate: () => Promise<unknown> }[] = [];

    try {
      return await options.uow.transaction(async (tx) => {
        let targetBound = false;
        const bindTarget: BindAdminClientMutationTarget = async (clientCode, mutation) => {
          if (targetBound) throw new ClientMutationTargetRequiredError();

          targetBound = true;
          targetClientCode = clientCode;
          function register(cache: "snapshot" | "generic", invalidate: () => Promise<unknown>) {
            invalidations.push({ cache, invalidate });
            tx.afterCommit.required(
              cache === "snapshot" ? CLIENT_RUNTIME_INVALIDATION_TASK : "admin.client.cache.invalidate",
              async () => {
                await invalidate();
              },
            );
          }
          register("snapshot", () => options.invalidation.invalidateClient(clientCode));
          return await mutation((invalidate) => register("generic", invalidate));
        };

        const result = await callback(tx, bindTarget);
        if (!targetBound) throw new ClientMutationTargetRequiredError();
        callbackCompleted = true;
        return result;
      }, transactionOptions);
    } catch (error) {
      if (consumeTransactionRollbackConfirmation(error)) {
        throw error;
      }

      if (error instanceof AfterCommitRequiredTaskError) {
        if (callbackCompleted) throw new AdminMutationCommittedError();
        throw error;
      }

      if (!callbackCompleted || targetClientCode === undefined) throw error;

      await Promise.all(
        invalidations.map(async ({ cache, invalidate }) => {
          try {
            await invalidate();
          } catch {
            try {
              options.logger.error(
                {
                  clientCode: targetClientCode,
                  operation:
                    cache === "snapshot" ? "client_runtime_snapshot_invalidation" : "generic_client_cache_invalidation",
                  outcome: "repair_required",
                },
                cache === "snapshot"
                  ? "Client Runtime Snapshot requires explicit repair"
                  : "Generic Client cache requires explicit repair",
              );
            } catch {
              // Observability cannot replace the original database outcome.
            }
          }
        }),
      );
      throw error;
    }
  }

  return { transaction };
}
