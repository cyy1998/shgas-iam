import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { ZodError } from "zod";
import {
  createUserProfileJobProcessor,
  createUserProfileWorkerModule,
  USER_PROFILE_WORKER_MODULE_KEY,
} from "../user-profile-worker.module";

describe("createUserProfileJobProcessor", () => {
  test("parses and delegates the current versioned rebuild job", async () => {
    const process = mock(async () => ({ status: "rebuilt" }));
    const processor = createUserProfileJobProcessor({
      rebuildProcessor: { process },
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    });

    await expect(processor({
      id: "rebuild-user-profile|123|42",
      name: "rebuild-user-profile",
      data: {
        userId: 123,
        dirtyVersion: "42",
        reason: "user-updated",
        requestId: "request-42",
        traceId: "trace-42",
      },
    })).resolves.toEqual({ status: "rebuilt" });

    expect(process).toHaveBeenCalledWith({
      userId: 123,
      dirtyVersion: "42",
      reason: "user-updated",
      requestId: "request-42",
      traceId: "trace-42",
    }, { jobId: "rebuild-user-profile|123|42" });
  });

  test("rejects unknown jobs and malformed rebuild payloads before delegation", async () => {
    const process = mock(async () => ({ status: "rebuilt" }));
    const processor = createUserProfileJobProcessor({
      rebuildProcessor: { process },
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    });

    await expect(processor({
      id: "unknown|123|42",
      name: "unknown-job",
      data: {
        userId: 123,
        dirtyVersion: "42",
        reason: "user-updated",
      },
    })).rejects.toThrow("Unsupported user profile job name: unknown-job");

    await expect(processor({
      id: "rebuild-user-profile|0|invalid",
      name: "rebuild-user-profile",
      data: {
        userId: 0,
        dirtyVersion: "invalid",
        reason: "user-updated",
      },
    })).rejects.toBeInstanceOf(ZodError);

    expect(process).not.toHaveBeenCalled();
  });

  test("reports the cache publication result in the structured rebuild log", async () => {
    const info = mock(() => {});
    const processor = createUserProfileJobProcessor({
      rebuildProcessor: {
        process: mock(async () => ({
          status: "rebuilt",
          cacheStatus: "failed" as const,
        })),
      },
      logger: {
        info,
        error: mock(() => {}),
        warn: mock(() => {}),
      },
    });

    await processor({
      id: "rebuild-user-profile|123|42",
      name: "rebuild-user-profile",
      data: {
        userId: 123,
        dirtyVersion: "42",
        reason: "user-updated",
      },
    });

    expect(info).toHaveBeenCalledWith({
      userId: 123,
      dirtyVersion: "42",
      jobId: "rebuild-user-profile|123|42",
      jobName: "rebuild-user-profile",
      status: "rebuilt",
      cacheStatus: "failed",
    }, "user profile rebuild job processed");
  });
});

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
    const info = mock(() => {});
    const module = createUserProfileWorkerModule({
      db: {} as never,
      redis: { host: "localhost", port: 6379, db: 0 },
      subjectFactsRedis: {
        eval: mock(async () => 1),
      },
      subjectAccessRepair: {
        repairSubject: mock(async () => ({ status: "stable" as const })),
      },
      subjectAccessBootstrap: {
        seedMany: mock(async records => ({
          seeded: records.length,
          retainedExisting: 0,
        })),
      },
      logger: {
        info,
        warn: mock(() => {}),
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

    const completedListener = (worker.on.mock.calls as unknown as Array<[
      string,
      (job: unknown) => void,
    ]>).find(([event]) => event === "completed")?.[1];
    completedListener?.({
      id: "rebuild-user-profile|123|42",
      name: "rebuild-user-profile",
      data: {
        userId: 123,
        dirtyVersion: "42",
        reason: "user-updated",
      },
      returnvalue: {
        status: "rebuilt",
        cacheStatus: "failed",
      },
    });

    expect(info).toHaveBeenCalledWith({
      jobId: "rebuild-user-profile|123|42",
      jobName: "rebuild-user-profile",
      status: "rebuilt",
      cacheStatus: "failed",
      userId: 123,
      dirtyVersion: "42",
    }, "user profile job completed");

    await module.close();

    expect(worker.close).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
  });
});
