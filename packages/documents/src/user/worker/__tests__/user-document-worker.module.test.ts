import { describe, expect, mock, test } from "bun:test";
import { USER_DOCUMENT_QUEUE_NAME } from "@iam/contracts";
import { ZodError } from "zod";
import {
  createUserDocumentJobProcessor,
  createUserDocumentWorkerModule,
  USER_DOCUMENT_WORKER_MODULE_KEY,
} from "../user-document-worker.module";

describe("createUserDocumentJobProcessor", () => {
  test("awaits a bounded batch once and leaves individual target recovery to the processor", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const result = { status: "rebuilt", requested: 2, rebuilt: 1, skipped: 1, stale: 0 };
    const processBatch = mock(async () => {
      await gate;
      return result;
    });
    const process = mock(async () => ({ status: "rebuilt" }));
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: { process, processBatch },
      logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    });
    const requests = [1, 2].map((userId) => ({ userId, version: "9007199254740993", reason: "user-updated" }));
    let completed = false;
    const pending = processor({ id: "batch-1", name: "rebuild-user-documents-batch", data: { requests } }).then(
      (value) => {
        completed = true;
        return value;
      },
    );
    await Promise.resolve();
    expect(completed).toBe(false);
    finish();
    const actual = await pending;
    expect(actual).toEqual(result);
    expect(processBatch).toHaveBeenCalledWith(requests);
    expect(process).not.toHaveBeenCalled();
  });

  test("rejects malformed batches before processing and propagates batch failure", async () => {
    const failure = new Error("BatchBuildFailed");
    const processBatch = mock(async () => {
      throw failure;
    });
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: { process: mock(async () => ({ status: "rebuilt" })), processBatch },
      logger: { info: mock(() => {}), warn: mock(() => {}), error: mock(() => {}) },
    });
    for (const data of [{ requests: [] }, { requests: [{ userId: 1, version: "invalid", reason: "user-updated" }] }]) {
      let error: unknown;
      try {
        await processor({ name: "rebuild-user-documents-batch", data });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ZodError);
    }
    expect(processBatch).not.toHaveBeenCalled();
    let error: unknown;
    try {
      await processor({
        name: "rebuild-user-documents-batch",
        data: { requests: [{ userId: 1, version: "1", reason: "user-updated" }] },
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBe(failure);
  });

  test("batch failure logs exclude exception payloads at both processor and worker boundaries", async () => {
    const canary = "BATCH_DOCUMENT_CONTENT_MUST_NOT_REACH_LOGS";
    const failure = Object.assign(new AggregateError([new Error(canary)], "Batch failed"), {
      command: { args: [canary] },
    });
    const logs: Record<string, unknown>[] = [];
    const logger = {
      info() {},
      warn() {},
      error(fields: Record<string, unknown>) {
        logs.push(fields);
      },
    };
    const job = {
      id: "batch-failure",
      name: "rebuild-user-documents-batch",
      data: { requests: [{ userId: 1, version: "1", reason: "user-updated" }] },
    };
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: {
        process: mock(async () => ({ status: "rebuilt" })),
        processBatch: mock(async () => {
          throw failure;
        }),
      },
      logger,
    });
    let rejected: unknown;
    try {
      await processor(job);
    } catch (error) {
      rejected = error;
    }
    expect(rejected).toBe(failure);
    let onFailed!: (job: unknown, error: Error) => void;
    const module = createUserDocumentWorkerModule({
      db: {} as never,
      redis: { host: "localhost", port: 6379, db: 0 },
      subjectFactsRedis: { eval: mock(async () => 1) },
      subjectAccessRepair: { repairSubject: mock(async () => ({ status: "stable" as const })) },
      logger,
      clock: { nowDate: () => new Date("2026-11-02T00:00:00Z") },
      config: { concurrency: 1, rebuildBatchSize: 100, backfillBatchSize: 100 },
      factories: {
        createQueue: (() => ({ name: USER_DOCUMENT_QUEUE_NAME, close: mock(async () => {}) })) as never,
        createWorker: (() => ({
          close: mock(async () => {}),
          on(event: string, listener: typeof onFailed) {
            if (event === "failed") onFailed = listener;
          },
        })) as never,
      },
    });
    try {
      await module.startConsumers();
      onFailed(job, failure);
      expect(logs).toHaveLength(2);
      for (const fields of logs) {
        expect(fields).toMatchObject({ errorType: "AggregateError", jobId: job.id, requested: 1 });
        expect(fields).not.toHaveProperty("err");
      }
      expect(JSON.stringify(logs)).not.toContain(canary);
    } finally {
      await module.close();
    }
  });

  test("parses and delegates the current versioned rebuild job", async () => {
    const process = mock(async () => ({ status: "rebuilt" }));
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: {
        process,
        processBatch: mock(async () => ({ status: "rebuilt", requested: 0, rebuilt: 0, skipped: 0, stale: 0 })),
      },
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    });

    await expect(
      processor({
        id: "rebuild-user-document|123|42",
        name: "rebuild-user-document",
        data: {
          userId: 123,
          version: "42",
          reason: "user-updated",
          requestId: "request-42",
          traceId: "trace-42",
        },
      }),
    ).resolves.toEqual({ status: "rebuilt" });

    expect(process).toHaveBeenCalledWith(
      {
        userId: 123,
        version: "42",
        reason: "user-updated",
        requestId: "request-42",
        traceId: "trace-42",
      },
      { jobId: "rebuild-user-document|123|42" },
    );
  });

  test("rejects unknown jobs and malformed rebuild payloads before delegation", async () => {
    const process = mock(async () => ({ status: "rebuilt" }));
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: {
        process,
        processBatch: mock(async () => ({ status: "rebuilt", requested: 0, rebuilt: 0, skipped: 0, stale: 0 })),
      },
      logger: {
        info: mock(() => {}),
        warn: mock(() => {}),
        error: mock(() => {}),
      },
    });

    await expect(
      processor({
        id: "unknown|123|42",
        name: "unknown-job",
        data: {
          userId: 123,
          version: "42",
          reason: "user-updated",
        },
      }),
    ).rejects.toThrow("Unsupported user document job name: unknown-job");

    await expect(
      processor({
        id: "rebuild-user-document|0|invalid",
        name: "rebuild-user-document",
        data: {
          userId: 0,
          version: "invalid",
          reason: "user-updated",
        },
      }),
    ).rejects.toBeInstanceOf(ZodError);

    expect(process).not.toHaveBeenCalled();
  });

  test("reports the cache publication result in the structured rebuild log", async () => {
    const info = mock(() => {});
    const processor = createUserDocumentJobProcessor({
      rebuildProcessor: {
        processBatch: mock(async () => ({ status: "rebuilt", requested: 0, rebuilt: 0, skipped: 0, stale: 0 })),
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
      id: "rebuild-user-document|123|42",
      name: "rebuild-user-document",
      data: {
        userId: 123,
        version: "42",
        reason: "user-updated",
      },
    });

    expect(info).toHaveBeenCalledWith(
      {
        userId: 123,
        version: "42",
        jobId: "rebuild-user-document|123|42",
        jobName: "rebuild-user-document",
        status: "rebuilt",
        cacheStatus: "failed",
      },
      "user document rebuild job processed",
    );
  });
});

describe("createUserDocumentWorkerModule", () => {
  test("registers queue metadata and starts/closes the BullMQ worker lifecycle", async () => {
    const queue = {
      name: USER_DOCUMENT_QUEUE_NAME,
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
    const module = createUserDocumentWorkerModule({
      db: {} as never,
      redis: { host: "localhost", port: 6379, db: 0 },
      subjectFactsRedis: {
        eval: mock(async () => 1),
      },
      subjectAccessRepair: {
        repairSubject: mock(async () => ({ status: "stable" as const })),
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

    expect(module.key).toBe(USER_DOCUMENT_WORKER_MODULE_KEY);
    expect(module.queueRegistrations).toEqual([
      {
        moduleKey: USER_DOCUMENT_WORKER_MODULE_KEY,
        queueName: USER_DOCUMENT_QUEUE_NAME,
        queue: queue as never,
      },
    ]);

    await module.startConsumers();
    await module.startConsumers();

    expect(createWorker).toHaveBeenCalledTimes(1);
    const workerCalls = createWorker.mock.calls as any[];
    const workerInput = workerCalls[0]?.[0] as any;
    expect(workerInput).toMatchObject({
      name: USER_DOCUMENT_QUEUE_NAME,
      concurrency: 4,
    });
    expect(worker.on).toHaveBeenCalledWith("completed", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("failed", expect.any(Function));

    const completedListener = (worker.on.mock.calls as unknown as Array<[string, (job: unknown) => void]>).find(
      ([event]) => event === "completed",
    )?.[1];
    completedListener?.({
      id: "rebuild-user-document|123|42",
      name: "rebuild-user-document",
      data: {
        userId: 123,
        version: "42",
        reason: "user-updated",
      },
      returnvalue: {
        status: "rebuilt",
        cacheStatus: "failed",
      },
    });

    expect(info).toHaveBeenCalledWith(
      {
        jobId: "rebuild-user-document|123|42",
        jobName: "rebuild-user-document",
        status: "rebuilt",
        cacheStatus: "failed",
        userId: 123,
        version: "42",
      },
      "user document job completed",
    );

    await module.close();

    expect(worker.close).toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalled();
  });
});
