import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { ZodError } from "zod";
import { createUserProfileRebuildProcessor } from "../user-profile-rebuild.processor";
import {
  createUserProfileJobProcessor,
  createUserProfileWorkerModule,
  USER_PROFILE_WORKER_MODULE_KEY,
} from "../user-profile-worker.module";

describe("createUserProfileWorkerModule", () => {
  test("registers queue metadata and starts/closes the BullMQ worker lifecycle", async () => {
    const queue = {
      name: USER_PROFILE_QUEUE_NAME,
      add: mock(async (_name: string, _payload: unknown, options: { jobId: string }) => ({ id: options.jobId })),
      close: mock(async () => {}),
    };
    const worker = {
      close: mock(async () => {}),
      on: mock(() => undefined),
    };
    const createQueue = mock(() => queue);
    const createWorker = mock(() => worker);
    const module = createUserProfileWorkerModule({
      db: {} as never,
      redis: { host: "localhost", port: 6379, db: 0 },
      logger: {
        info: mock(() => {}),
        error: mock(() => {}),
      },
      clock: { nowDate: () => new Date("2026-07-01T00:00:00.000Z") },
      config: {
        concurrency: 4,
        rebuildBatchSize: 25,
        backfillBatchSize: 200,
      },
      factories: {
        createQueue: createQueue as never,
        createWorker: createWorker as never,
      },
    });

    expect(module.key).toBe(USER_PROFILE_WORKER_MODULE_KEY);
    expect(Object.keys(module.maintenance)).toEqual(["backfillAllUsers", "repairFailedOrStale"]);
    expect("rebuildProcessor" in module).toBeFalse();
    expect("workerService" in module).toBeFalse();
    expect(module.queueRegistrations).toEqual([{
      moduleKey: USER_PROFILE_WORKER_MODULE_KEY,
      queueName: USER_PROFILE_QUEUE_NAME,
      queue: queue as never,
    }]);

    await module.startConsumers();
    await module.startConsumers();

    expect(createWorker).toHaveBeenCalledTimes(1);
    const workerCalls = createWorker.mock.calls as any[];
    const workerInput = workerCalls[0]?.[0] as any;
    expect(workerInput).toMatchObject({
      name: USER_PROFILE_QUEUE_NAME,
      concurrency: 4,
    });
    expect(worker.on).toHaveBeenCalledWith("completed", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("failed", expect.any(Function));

    await module.close();

    expect(worker.close).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
  });

  test("rejects the retired job name and scope payload before rebuild state is touched", async () => {
    const profileRepository = {
      upsertProfile: mock(async () => {}),
      deleteByUserId: mock(async () => {}),
    };
    const dirtyRepository = {
      claimForProcessing: mock(async () => ({ claimed: true })),
      markProcessed: mock(async () => ({ processed: true })),
      markFailed: mock(async () => ({ failed: true })),
    };
    const builder = {
      buildOne: mock(async () => null),
    };
    const processor = createUserProfileJobProcessor({
      rebuildProcessor: createUserProfileRebuildProcessor({
        profileRepository,
        dirtyRepository,
        builder,
        clock: { nowDate: () => new Date("2026-07-01T00:00:00.000Z") },
      }),
      logger: {
        info: mock(() => {}),
        error: mock(() => {}),
      },
    });

    await expect(processor({
      id: "legacy-name",
      name: "expand-user-profile-scope",
      data: {
        userId: 123,
        dirtyVersion: "42",
        reason: "user-updated",
      },
    })).rejects.toThrow("Unsupported user profile job name: expand-user-profile-scope");
    await expect(processor({
      id: "legacy-payload",
      name: "rebuild-user-profile",
      data: {
        scopeType: "organization-id",
        scopeId: 9,
        bucket: "2026-06-30T10:00",
        reason: "organization-updated",
      },
    })).rejects.toBeInstanceOf(ZodError);

    expect(dirtyRepository.claimForProcessing).not.toHaveBeenCalled();
    expect(dirtyRepository.markProcessed).not.toHaveBeenCalled();
    expect(dirtyRepository.markFailed).not.toHaveBeenCalled();
    expect(builder.buildOne).not.toHaveBeenCalled();
    expect(profileRepository.upsertProfile).not.toHaveBeenCalled();
    expect(profileRepository.deleteByUserId).not.toHaveBeenCalled();
  });
});
