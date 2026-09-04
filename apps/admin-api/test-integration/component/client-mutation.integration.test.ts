import {
  ClientMutationTargetRequiredError,
  createAdminClientMutation,
} from "@admin-api/services/client/client-mutation";
import {
  AfterCommitRequiredTaskError,
  createImmediateUnitOfWork,
} from "@iam/api-core/uow";
import { describe, expect, mock, test } from "bun:test";

function createLogger() {
  return {
    error: mock((_fields: Record<string, unknown>, _message: string) => undefined),
  };
}

function transactionPorts() {
  return { marker: "tx" };
}

describe("Admin Client target-bound mutation", () => {
  test("binds a canonical target before the mutation and invalidates it once after commit", async () => {
    const events: string[] = [];
    const invalidateClient = mock(async (clientCode: string) => {
      events.push(`invalidate:${clientCode}`);
    });
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: createImmediateUnitOfWork(transactionPorts()),
    });

    const result = await mutation.transaction(async (tx, bindTarget) => {
      expect(tx.marker).toBe("tx");
      return await bindTarget("portal", async () => {
        events.push("mutate");
        expect(invalidateClient).not.toHaveBeenCalled();
        return "done";
      });
    });

    expect(result).toBe("done");
    expect(events).toEqual(["mutate", "invalidate:portal"]);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("rejects a successful transaction callback that never binds a Client target", async () => {
    const invalidateClient = mock(async () => undefined);
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: createImmediateUnitOfWork(transactionPorts()),
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async () => "unbound");
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(ClientMutationTargetRequiredError);
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("does not invalidate after a confirmed rollback", async () => {
    const invalidateClient = mock(async () => undefined);
    const mutationFailure = new Error("mutation rejected");
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: createImmediateUnitOfWork(transactionPorts()),
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async (_tx, bindTarget) =>
        await bindTarget("portal", async () => {
          throw mutationFailure;
        }));
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBe(mutationFailure);
    expect(invalidateClient).not.toHaveBeenCalled();
  });

  test("preserves an unknown COMMIT error and attempts one conservative invalidation", async () => {
    const invalidateClient = mock(async () => undefined);
    const databaseFailure = new Error("commit outcome unknown");
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: {
        async transaction(callback) {
          await callback({
            ...transactionPorts(),
            afterCommit: {
              bestEffort: () => undefined,
              required: () => undefined,
            },
          });
          throw databaseFailure;
        },
      },
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async (_tx, bindTarget) =>
        await bindTarget("portal", async () => "updated"));
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBe(databaseFailure);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
    expect(invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("logs a safe repair requirement when conservative invalidation also fails", async () => {
    const databaseFailure = new Error("commit outcome unknown");
    const logger = createLogger();
    logger.error.mockImplementationOnce(() => {
      throw new Error("logger unavailable");
    });
    const mutation = createAdminClientMutation({
      invalidation: {
        invalidateClient: mock(async () => {
          throw new Error("redis://secret@cache.internal/runtime payload");
        }),
      },
      logger,
      uow: {
        async transaction(callback) {
          await callback({
            ...transactionPorts(),
            afterCommit: {
              bestEffort: () => undefined,
              required: () => undefined,
            },
          });
          throw databaseFailure;
        },
      },
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async (_tx, bindTarget) =>
        await bindTarget("canary-client", async () => "updated"));
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBe(databaseFailure);
    expect(logger.error).toHaveBeenCalledWith({
      clientCode: "canary-client",
      operation: "client_runtime_snapshot_invalidation",
      outcome: "repair_required",
    }, "Client Runtime Snapshot requires explicit repair");
  });

  test("reports committed required invalidation failure without retrying it as unknown COMMIT", async () => {
    const invalidateClient = mock(async () => {
      throw new Error("snapshot invalidation unavailable");
    });
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: createImmediateUnitOfWork(transactionPorts(), {
        logger: { error: () => undefined, warn: () => undefined },
      }),
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async (_tx, bindTarget) =>
        await bindTarget("portal", async () => "updated"));
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("keeps committed facts while an old Snapshot remains serviceable until explicit repair", async () => {
    let persistedName = "old-name";
    let runtimeSnapshot: string | undefined = "old-name";
    const invalidationFailure = new Error("snapshot invalidation unavailable");
    const invalidateClient = mock(async (_clientCode: string): Promise<void> => {
      throw invalidationFailure;
    });
    const mutation = createAdminClientMutation({
      invalidation: { invalidateClient },
      logger: createLogger(),
      uow: createImmediateUnitOfWork(transactionPorts(), {
        logger: { error: () => undefined, warn: () => undefined },
      }),
    });
    let rejected: unknown;

    try {
      await mutation.transaction(async (_tx, bindTarget) =>
        await bindTarget("portal", async () => {
          persistedName = "new-name";
        }));
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(persistedName).toBe("new-name");
    expect(runtimeSnapshot).toBe("old-name");

    invalidateClient.mockImplementationOnce(async () => {
      runtimeSnapshot = undefined;
    });
    await invalidateClient("portal");
    expect(runtimeSnapshot).toBeUndefined();
  });
});
