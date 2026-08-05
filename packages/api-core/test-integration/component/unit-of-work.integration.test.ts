import { ApiErrorCode } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { INTERNAL_SERVER_ERROR } from "../../src/core/http-status-codes";
import {
  AfterCommitRequiredTaskError,
  consumeTransactionRollbackConfirmation,
  createImmediateUnitOfWork,
  createUnitOfWork,
  mapUnitOfWork,
} from "../../src/uow";

function createLogger() {
  return {
    warn: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
    error: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
  };
}

function createTransactionalDb<Tx>(tx: Tx) {
  return {
    async transaction<T>(callback: (transaction: Tx) => Promise<T>): Promise<T> {
      return await callback(tx);
    },
  };
}

describe("createUnitOfWork", () => {
  test("marks only the callback error rethrown after rollback as confirmed, once", async () => {
    const failure = new Error("callback failed");
    const uow = createUnitOfWork({
      db: createTransactionalDb({}),
      logger: createLogger(),
      createTxPorts: () => ({}),
    });

    const caught = await uow.transaction(async () => {
      throw failure;
    }).catch(error => error);

    expect(caught).toBe(failure);
    expect(consumeTransactionRollbackConfirmation(caught)).toBe(true);
    expect(consumeTransactionRollbackConfirmation(caught)).toBe(false);
  });

  test("does not confirm rollback when the adapter replaces the callback error", async () => {
    const callbackFailure = new Error("callback failed");
    const rollbackFailure = new Error("rollback transport failed");
    const uow = createUnitOfWork({
      db: {
        async transaction<T>(callback: (tx: object) => Promise<T>) {
          try {
            await callback({});
          }
          catch {
            throw rollbackFailure;
          }
          throw new Error("expected callback failure");
        },
      },
      logger: createLogger(),
      createTxPorts: () => ({}),
    });

    const caught = await uow.transaction(async () => {
      throw callbackFailure;
    }).catch(error => error);

    expect(caught).toBe(rollbackFailure);
    expect(consumeTransactionRollbackConfirmation(caught)).toBe(false);
  });

  test("does not confirm a transport error after the callback resolves", async () => {
    const commitFailure = new Error("commit response lost");
    const uow = createUnitOfWork({
      db: {
        async transaction<T>(callback: (tx: object) => Promise<T>) {
          await callback({});
          throw commitFailure;
        },
      },
      logger: createLogger(),
      createTxPorts: () => ({}),
    });

    const caught = await uow.transaction(async () => "committed")
      .catch(error => error);

    expect(caught).toBe(commitFailure);
    expect(consumeTransactionRollbackConfirmation(caught)).toBe(false);
  });

  test("does not mark a required after-commit failure as rollback confirmed", async () => {
    const uow = createUnitOfWork({
      db: createTransactionalDb({}),
      logger: createLogger(),
      createTxPorts: () => ({}),
    });

    const caught = await uow.transaction(async (tx) => {
      tx.afterCommit.required("required.fail", () => {
        throw new Error("post-commit failed");
      });
      return "committed";
    }).catch(error => error);

    expect(caught).toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(consumeTransactionRollbackConfirmation(caught)).toBe(false);
  });

  test("runs after-commit tasks after a committed transaction in registration order", async () => {
    const events: string[] = [];
    const logger = createLogger();
    const db = createTransactionalDb({ id: 1 });
    const uow = createUnitOfWork({
      db,
      logger,
      createTxPorts: tx => ({ tx }),
    });

    const result = await uow.transaction(async (tx) => {
      events.push(`callback:${tx.tx.id}`);
      tx.afterCommit.required("required.one", async () => {
        events.push("required.one");
      });
      tx.afterCommit.bestEffort("best.two", async () => {
        events.push("best.two");
      });
      tx.afterCommit.required("required.three", () => {
        events.push("required.three");
      });
      return "ok";
    });

    expect(result).toBe("ok");
    expect(events).toEqual(["callback:1", "required.one", "best.two", "required.three"]);
    expect(logger.warn).toHaveBeenCalledTimes(0);
    expect(logger.error).toHaveBeenCalledTimes(0);
  });

  test("shares transaction lifecycle with the port factory", async () => {
    const events: string[] = [];
    const logger = createLogger();
    const observability = {
      requestId: "req-lifecycle",
      traceId: "22222222222222222222222222222222",
    };
    const db = {
      async transaction<T>(callback: (tx: { id: number }) => Promise<T>): Promise<T> {
        const result = await callback({ id: 1 });
        events.push("commit");
        return result;
      },
    };
    const uow = createUnitOfWork({
      db,
      logger,
      createTxPorts: (tx, lifecycle) => {
        lifecycle.afterCommit.required("factory.required", () => {
          events.push("factory.required");
        });
        return {
          tx,
          factoryAfterCommit: lifecycle.afterCommit,
          factoryObservability: lifecycle.observability,
        };
      },
    });

    const result = await uow.transaction(async (tx) => {
      events.push(`callback:${tx.tx.id}`);
      expect(tx.factoryAfterCommit).toBe(tx.afterCommit);
      expect(tx.factoryObservability).toBe(observability);
      tx.afterCommit.bestEffort("callback.best-effort", () => {
        events.push("callback.best-effort");
      });
      return "ok";
    }, { observability });

    expect(result).toBe("ok");
    expect(events).toEqual(["callback:1", "commit", "factory.required", "callback.best-effort"]);
  });

  test("does not run after-commit tasks when the transaction callback fails", async () => {
    const events: string[] = [];
    const logger = createLogger();
    const db = createTransactionalDb({});
    const uow = createUnitOfWork({
      db,
      logger,
      createTxPorts: (_tx, lifecycle) => {
        lifecycle.afterCommit.required("factory.required", () => {
          events.push("factory.required");
        });
        return {};
      },
    });
    const failure = new Error("rollback");

    await expect(uow.transaction(async (tx) => {
      tx.afterCommit.required("callback.required", () => {
        events.push("callback.required");
      });
      throw failure;
    })).rejects.toThrow(failure);

    expect(events).toEqual([]);
    expect(logger.warn).toHaveBeenCalledTimes(0);
    expect(logger.error).toHaveBeenCalledTimes(0);
  });

  test("attempts every task and throws aggregated required failures after commit", async () => {
    const events: string[] = [];
    const logger = createLogger();
    const requiredFailure = new Error("cache failed");
    const bestEffortFailure = new Error("invalidation failed");
    const uow = createUnitOfWork({
      db: createTransactionalDb({}),
      logger,
      createTxPorts: () => ({}),
    });

    try {
      await uow.transaction(async (tx) => {
        tx.afterCommit.required("required.fail", () => {
          events.push("required.fail");
          throw requiredFailure;
        });
        tx.afterCommit.bestEffort("best.fail", () => {
          events.push("best.fail");
          throw bestEffortFailure;
        });
        tx.afterCommit.required("required.ok", () => {
          events.push("required.ok");
        });
        return "ok";
      });
      throw new Error("expected after-commit failure");
    }
    catch (err) {
      expect(err).toBeInstanceOf(AfterCommitRequiredTaskError);
      expect((err as AfterCommitRequiredTaskError).code).toBe(ApiErrorCode.InternalError);
      expect((err as AfterCommitRequiredTaskError).httpStatus).toBe(INTERNAL_SERVER_ERROR);
      expect((err as AfterCommitRequiredTaskError).failures).toEqual([
        { name: "required.fail", mode: "required", error: requiredFailure },
      ]);
    }

    expect(events).toEqual(["required.fail", "best.fail", "required.ok"]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]).toEqual([
      { afterCommit: "required.fail", mode: "required", err: requiredFailure, requestId: null, traceId: null },
      "required afterCommit task failed",
    ]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0]).toEqual([
      { afterCommit: "best.fail", mode: "bestEffort", err: bestEffortFailure, requestId: null, traceId: null },
      "best-effort afterCommit task failed",
    ]);
  });

  test("logs after-commit failures with transaction observability context", async () => {
    const logger = createLogger();
    const failure = new Error("publish failed");
    const uow = createUnitOfWork({
      db: createTransactionalDb({}),
      logger,
      createTxPorts: () => ({}),
    });

    await expect(uow.transaction(async (tx) => {
      tx.afterCommit.required("required.fail", () => {
        throw failure;
      });
      return "ok";
    }, {
      observability: {
        requestId: "req-1",
        traceId: "11111111111111111111111111111111",
      },
    })).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(logger.error.mock.calls[0]).toEqual([
      {
        afterCommit: "required.fail",
        mode: "required",
        err: failure,
        requestId: "req-1",
        traceId: "11111111111111111111111111111111",
      },
      "required afterCommit task failed",
    ]);
  });
});

describe("createImmediateUnitOfWork", () => {
  test("matches after-commit failure modes for service tests", async () => {
    const logger = createLogger();
    const requiredFailure = new Error("required failed");
    const bestEffortFailure = new Error("best failed");
    const events: string[] = [];
    const uow = createImmediateUnitOfWork({ value: 1 }, { logger });

    await expect(uow.transaction(async (tx) => {
      events.push(`callback:${tx.value}`);
      tx.afterCommit.bestEffort("best.fail", () => {
        events.push("best.fail");
        throw bestEffortFailure;
      });
      tx.afterCommit.required("required.fail", () => {
        events.push("required.fail");
        throw requiredFailure;
      });
      tx.afterCommit.bestEffort("best.ok", () => {
        events.push("best.ok");
      });
      return "ok";
    })).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(events).toEqual(["callback:1", "best.fail", "required.fail", "best.ok"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  test("preserves observability context for service-test afterCommit logging", async () => {
    const logger = createLogger();
    const failure = new Error("best failed");
    const uow = createImmediateUnitOfWork({ value: 1 }, { logger });

    await uow.transaction(async (tx) => {
      tx.afterCommit.bestEffort("best.fail", () => {
        throw failure;
      });
      return "ok";
    }, {
      observability: {
        requestId: "req-test",
        traceId: "trace-test",
      },
    });

    expect(logger.warn.mock.calls[0]).toEqual([
      {
        afterCommit: "best.fail",
        mode: "bestEffort",
        err: failure,
        requestId: "req-test",
        traceId: "trace-test",
      },
      "best-effort afterCommit task failed",
    ]);
  });
});

describe("mapUnitOfWork", () => {
  test("maps transaction ports and preserves the same afterCommit registration API", async () => {
    const events: string[] = [];
    const logger = createLogger();
    const source = createUnitOfWork({
      db: createTransactionalDb({}),
      logger,
      createTxPorts: () => ({ repository: { id: 1 }, hidden: true }),
    });
    const mapped = mapUnitOfWork(source, tx => ({ repository: tx.repository }));

    const result = await mapped.transaction(async (tx) => {
      events.push(`callback:${tx.repository.id}`);
      tx.afterCommit.required("mapped.required", () => {
        events.push("mapped.required");
      });
      return "mapped";
    });

    expect(result).toBe("mapped");
    expect(events).toEqual(["callback:1", "mapped.required"]);
  });
});
