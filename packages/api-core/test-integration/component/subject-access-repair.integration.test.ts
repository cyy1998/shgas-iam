import type { SubjectAccessAuthorityState } from "../../src/subject-access";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectAccessBarrier,
  createSubjectAccessRepair,
  SubjectAccessRecordV1Schema,
} from "../../src/subject-access";
import { createInMemorySubjectAccessStore } from "../../src/subject-access/testing";

const subjectIdentifier = "00000000-0000-4000-8000-000000000001";
const transitionId = "10000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-31T08:05:00.000Z").getTime();

function createHarness(initialState: "enabled" | "disabled" = "enabled") {
  let redisNow = now;
  const store = createInMemorySubjectAccessStore([{
    version: 1,
    subjectIdentifier,
    state: initialState,
    transitionId: "20000000-0000-4000-8000-000000000001",
    updatedAt: "2026-07-31T08:00:00.000Z",
  }], { clock: { now: () => redisNow } });
  const barrier = createSubjectAccessBarrier({
    store,
    clock: { nowDate: () => new Date(redisNow) },
    random: { uuid: () => transitionId },
  });
  const resolve = mock(async (): Promise<SubjectAccessAuthorityState> => ({
    accountState: "enabled" as const,
    factsState: "current" as const,
  }));
  const warn = mock((_fields: Record<string, unknown>, _message: string) => undefined);
  let leaseSequence = 0;
  const repair = createSubjectAccessRepair({
    barrier,
    backlog: store,
    authority: { resolve },
    logger: { warn },
    random: { uuid: () => `lease-${leaseSequence += 1}` },
  });
  return {
    advanceRedis(milliseconds: number) {
      redisNow += milliseconds;
    },
    barrier,
    repair,
    resolve,
    store,
    warn,
  };
}

async function state(store: ReturnType<typeof createInMemorySubjectAccessStore>) {
  const serialized = await store.read(subjectIdentifier);
  if (serialized === null)
    return null;
  return SubjectAccessRecordV1Schema.parse(JSON.parse(serialized)).state;
}

describe("Subject Access repair", () => {
  test("cannot repair a transition whose database mutation is still unconfirmed", async () => {
    const { barrier, repair, resolve, store } = createHarness();
    await barrier.beginBlocking(subjectIdentifier);

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "deferred",
    });

    expect(resolve).not.toHaveBeenCalled();
    expect(await state(store)).toBe("blocking");
  });

  test("enables only the committed enabled target whose published Facts are current", async () => {
    const { barrier, repair, store } = createHarness();
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, "enabled");

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "enabled",
    });
    expect(await state(store)).toBe("enabled");
  });

  test("lets a current Facts publication nudge bypass retry backoff", async () => {
    const { barrier, repair, resolve, store } = createHarness();
    resolve.mockImplementationOnce(async () => ({
      accountState: "enabled",
      factsState: "not_current",
    }));
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, "enabled");

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "deferred",
    });
    expect(await state(store)).toBe("blocking");
    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "enabled",
    });
  });

  test("finalizes a committed disabled target without requiring Facts", async () => {
    const { barrier, repair, resolve, store } = createHarness();
    resolve.mockImplementationOnce(async () => ({
      accountState: "disabled",
      factsState: "not_current",
    }));
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, "disabled");

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "disabled",
    });
    expect(await state(store)).toBe("disabled");
  });

  test("never uses a contrary authority read to reverse the committed target", async () => {
    const { barrier, repair, resolve, store } = createHarness();
    resolve.mockImplementationOnce(async () => ({
      accountState: "disabled",
      factsState: "not_current",
    }));
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, "enabled");

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "deferred",
    });
    expect(await state(store)).toBe("blocking");
  });

  test("never creates enabled state from a missing record", async () => {
    const store = createInMemorySubjectAccessStore([], { clock: { now: () => now } });
    const barrier = createSubjectAccessBarrier({
      store,
      clock: { nowDate: () => new Date(now) },
      random: { uuid: () => transitionId },
    });
    const resolve = mock(async () => ({
      accountState: "enabled" as const,
      factsState: "current" as const,
    }));
    const repair = createSubjectAccessRepair({
      barrier,
      backlog: store,
      authority: { resolve },
      logger: { warn: mock(() => undefined) },
      random: { uuid: () => "lease-missing" },
    });

    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "deferred",
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(await store.read(subjectIdentifier)).toBeNull();
  });

  test("leaves failures fenced and rescheduled without leaking the error", async () => {
    const { barrier, repair, resolve, store, warn } = createHarness();
    resolve.mockImplementationOnce(async () => {
      throw new Error("postgresql://secret@db/internal transition details");
    });
    const transition = await barrier.beginBlocking(subjectIdentifier);
    await barrier.prepareRepair(transition, "enabled");

    await expect(repair.repairPending({ limit: 10 })).resolves.toEqual({
      disabled: 0,
      enabled: 0,
      deferred: 0,
      failed: 1,
      stable: 0,
    });
    expect(await state(store)).toBe("blocking");
    await expect(repair.repairSubject(subjectIdentifier)).resolves.toEqual({
      status: "enabled",
    });
    expect(warn).toHaveBeenCalledWith({
      errorType: "Error",
      operation: "repair",
      subjectIdentifier,
    }, "Subject Access repair failed");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("postgresql://");
  });

  test("claims one item immediately before work so slow items do not pre-lease later pages", async () => {
    const pageSubjects = [
      "00000000-0000-4000-8000-000000000011",
      "00000000-0000-4000-8000-000000000012",
    ];
    const transitions = [
      "10000000-0000-4000-8000-000000000011",
      "10000000-0000-4000-8000-000000000012",
    ];
    const store = createInMemorySubjectAccessStore(
      pageSubjects.map(currentSubject => ({
        version: 1 as const,
        subjectIdentifier: currentSubject,
        transitionId: currentSubject.replace(
          "00000000-0000",
          "20000000-0000",
        ),
        state: "enabled" as const,
        updatedAt: "2026-07-31T08:00:00.000Z",
      })),
      { clock: { now: () => now } },
    );
    let transitionIndex = 0;
    const barrier = createSubjectAccessBarrier({
      store,
      clock: { nowDate: () => new Date(now) },
      random: { uuid: () => transitions[transitionIndex++]! },
    });
    for (const currentSubject of pageSubjects) {
      const transition = await barrier.beginBlocking(currentSubject);
      await barrier.prepareRepair(transition, "enabled");
    }
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = Promise.withResolvers<void>();
    const authority = {
      resolve: mock(async (currentSubject: string) => {
        if (currentSubject === pageSubjects[0]) {
          firstStarted.resolve();
          await firstCanFinish;
        }
        return {
          accountState: "enabled" as const,
          factsState: "current" as const,
        };
      }),
    };
    let leaseSequence = 0;
    const createRepair = () => createSubjectAccessRepair({
      authority,
      backlog: store,
      barrier,
      logger: { warn: mock(() => undefined) },
      random: { uuid: () => `concurrent-${leaseSequence += 1}` },
    });
    const slowWorker = createRepair().repairPending({ limit: 2 });
    await firstStarted.promise;

    await expect(createRepair().repairPending({ limit: 1 })).resolves.toMatchObject({
      enabled: 1,
    });
    releaseFirst();
    await expect(slowWorker).resolves.toMatchObject({
      enabled: 1,
    });
  });
});
