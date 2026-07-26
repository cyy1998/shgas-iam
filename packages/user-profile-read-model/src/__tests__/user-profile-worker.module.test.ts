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
});
