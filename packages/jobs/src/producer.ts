import { randomUUID } from "node:crypto";
import type { BullMqRedisConfig } from "./connection";
import { createJobQueue } from "./queue";

export interface JobWakeUpQueuePort<Data, Name extends string = string> {
  addBulk: (jobs: Array<{ name: Name; data: Data; opts: { jobId: string } }>) => Promise<unknown[]>;
}

/** Queue delivery only wakes durable work; a timeout cannot cancel an already sent command. */
export function createJobWakeUpProducer<Data, Name extends string>(
  queue: JobWakeUpQueuePort<Data, Name>,
  options: { label: string; timeoutErrorName?: string; wakeUpTimeoutMs?: number },
) {
  const wakeUpTimeoutMs = options.wakeUpTimeoutMs;
  assertWakeUpTimeout(wakeUpTimeoutMs, options.label);
  return {
    async enqueue(name: Name, payloads: readonly Data[]) {
      if (!payloads.length) return { enqueued: 0, jobIds: [] };
      const deadline = wakeUpTimeoutMs === undefined ? undefined : performance.now() + wakeUpTimeoutMs;
      const timeoutError = new Error(`${options.label} queue wake-up timed out`);
      timeoutError.name = options.timeoutErrorName ?? "JobWakeUpTimeoutError";
      let expired = false;
      function checkDeadline() {
        if (deadline !== undefined && (expired || performance.now() >= deadline)) {
          expired = true;
          throw timeoutError;
        }
      }
      const jobs = payloads.map((data) => ({ name, data, opts: { jobId: randomUUID() } }));
      async function enqueueBatches() {
        const jobIds: string[] = [];
        for (let offset = 0; offset < jobs.length; offset += 500) {
          checkDeadline();
          const batch = jobs.slice(offset, offset + 500);
          const acknowledgments = await queue.addBulk(batch);
          // A late command must not start another batch after its caller timed out.
          checkDeadline();
          if (acknowledgments.length !== batch.length)
            throw new Error(`${options.label} queue did not acknowledge every wake`);
          for (const [index, job] of batch.entries())
            jobIds.push(acknowledgedJobId(acknowledgments[index], job.opts.jobId));
        }
        return { enqueued: jobIds.length, jobIds };
      }
      if (deadline === undefined) return await enqueueBatches();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => {
              expired = true;
              reject(timeoutError);
            },
            Math.max(0, deadline - performance.now()),
          );
        });
        // Promise.race also observes a dependency rejection arriving after timeout.
        return await Promise.race([enqueueBatches(), timeout]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function acknowledgedJobId(acknowledgment: unknown, fallback: string) {
  return typeof acknowledgment === "object" &&
    acknowledgment !== null &&
    "id" in acknowledgment &&
    typeof acknowledgment.id === "string"
    ? acknowledgment.id
    : fallback;
}

function assertWakeUpTimeout(timeoutMs: number | undefined, label: string) {
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647))
    throw new RangeError(`${label} queue wake-up timeout must be a positive timer-safe integer`);
}

export function createJobProducerResources<Data = unknown, Name extends string = string>(options: {
  name: string;
  redis: BullMqRedisConfig;
  prefix?: string;
  wakeUpTimeoutMs?: number;
  onError: (error: Error) => void;
}) {
  const wakeUpTimeoutMs = options.wakeUpTimeoutMs ?? 2_000;
  assertWakeUpTimeout(wakeUpTimeoutMs, "Job producer");
  const queue = createJobQueue<Data, unknown, Name>({
    name: options.name,
    redis: options.redis,
    prefix: options.prefix,
    connectionOptions: {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: wakeUpTimeoutMs,
      socketTimeout: wakeUpTimeoutMs,
    },
  });
  queue.on("error", options.onError);
  return {
    queue,
    wakeUpTimeoutMs,
    async close() {
      // Producers have no consumer work to drain; a silent peer must not hold QUIT.
      await queue.getBackend().close(true);
      await queue.close();
    },
  };
}
