import { AdminMutationCommittedError, createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { AfterCommitRequiredTaskError, createUnitOfWork } from "@iam/api-core/uow";
import { describe, expect, test } from "bun:test";

describe("Admin mutation failure boundary", () => {
  test("classifies required task failure only after UoW commit, without replaying business writes", async () => {
    const events: string[] = [];
    const mutation = createAdminMutation(createUnitOfWork({
      db: { transaction: async <T>(callback: (tx: object) => Promise<T>) => {
        const result = await callback({});
        events.push("commit");
        return result;
      } },
      createTxPorts: () => ({}),
      logger: { error: () => undefined, warn: () => undefined },
    }));
    let failure: unknown;
    try {
      await mutation.transaction(async (tx) => {
        events.push("write");
        tx.afterCommit.required("test-required-task", async () => {
          events.push("afterCommit");
          throw new Error("unavailable");
        });
        return { changed: true, result: null };
      });
    }
    catch (error) { failure = error; }
    expect(events).toEqual(["write", "commit", "afterCommit"]);
    expect(failure).toBeInstanceOf(AdminMutationCommittedError);
  });

  test("ordinary errors remain unchanged and lock-miss never executes the domain command", async () => {
    const missing = new Error("missing");
    let executed = false;
    const mutation = createAdminMutation(createUnitOfWork({
      db: { transaction: async <T>(callback: (tx: object) => Promise<T>) => callback({}) },
      createTxPorts: () => ({}),
      logger: { error: () => undefined, warn: () => undefined },
    }));
    let failure: unknown;
    try {
      await mutation.locked(async () => null, () => missing, async () => {
        executed = true;
        return { changed: true, result: null };
      });
    }
    catch (error) { failure = error; }
    expect(failure).toBe(missing);
    expect(failure).not.toBeInstanceOf(AfterCommitRequiredTaskError);
    expect(executed).toBe(false);
  });
});
