import type { WorkerModule } from "../modules/registry";
import { describe, expect, mock, test } from "bun:test";
import { closeWorkerModules, resolveModuleKeys, selectModules, selectQueueRegistrations } from "../modules/registry";

function module(key: string, closeOrder: string[] = []): WorkerModule {
  return {
    key,
    queueRegistrations: [{ moduleKey: key, queueName: `${key}-queue`, queue: {} }],
    startConsumers: mock(async () => {}),
    close: mock(async () => {
      closeOrder.push(key);
    }),
  };
}

describe("worker module registry", () => {
  test("selects all, none, and explicit module keys", () => {
    const modules = [module("user-profile")];

    expect(resolveModuleKeys({ mode: "all", keys: [] }, modules)).toEqual(["user-profile"]);
    expect(resolveModuleKeys({ mode: "none", keys: [] }, modules)).toEqual([]);
    expect(selectModules({ mode: "list", keys: ["user-profile"] }, modules).map(item => item.key)).toEqual([
      "user-profile",
    ]);
    expect(selectQueueRegistrations({ mode: "all", keys: [] }, modules)).toEqual([
      { moduleKey: "user-profile", queueName: "user-profile-queue", queue: {} },
    ]);
  });

  test("rejects unknown module keys", () => {
    expect(() => resolveModuleKeys({ mode: "list", keys: ["missing"] }, [module("user-profile")]))
      .toThrow("Unknown worker module key(s): missing");
  });

  test("closes modules in reverse order", async () => {
    const closeOrder: string[] = [];
    const first = module("first", closeOrder);
    const second = module("second", closeOrder);

    await closeWorkerModules([first, second]);

    expect(closeOrder).toEqual(["second", "first"]);
  });
});
