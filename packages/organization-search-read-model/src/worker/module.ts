import type { db as database } from "@iam/db";
import type { BullMqRedisConfig, CreateJobQueueInput, CreateJobWorkerInput, JobQueue } from "@iam/jobs";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import {
  createOrganizationSearchJobProducer,
  type OrganizationSearchJobName,
  type OrganizationSearchJobPayload,
} from "../jobs";
import {
  ORGANIZATION_REBUILD_JOB_NAME,
  ORGANIZATION_SEARCH_QUEUE_NAME,
  ORGANIZATION_SOURCE_CHANGE_JOB_NAME,
  OrganizationRebuildJobPayloadSchema,
  OrganizationSourceChangeJobPayloadSchema,
} from "../work.types";
import { createOrganizationSearchProcessor } from "./processor";

export const ORGANIZATION_SEARCH_WORKER_MODULE_KEY = "organization-search";

export interface OrganizationSearchWorkerLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export interface OrganizationSearchWorkerHandle {
  close: () => Promise<void>;
  on: ((event: "error", listener: (error: Error) => void) => unknown) &
    ((event: "failed", listener: (job: { id?: string; name: string } | undefined, error: Error) => void) => unknown);
}

export interface CreateOrganizationSearchWorkerModuleInput {
  db: typeof database;
  redis: BullMqRedisConfig;
  logger: OrganizationSearchWorkerLogger;
  clock?: { nowDate: () => Date };
  config: { concurrency: number };
  factories?: {
    createQueue?: (
      input: CreateJobQueueInput,
    ) => JobQueue<OrganizationSearchJobPayload, unknown, OrganizationSearchJobName>;
    createWorker?: (
      input: CreateJobWorkerInput<OrganizationSearchJobPayload, unknown, OrganizationSearchJobName>,
    ) => OrganizationSearchWorkerHandle;
  };
}

export function createOrganizationSearchWorkerModule(input: CreateOrganizationSearchWorkerModuleInput) {
  const queue = (
    input.factories?.createQueue ?? createJobQueue<OrganizationSearchJobPayload, unknown, OrganizationSearchJobName>
  )({
    name: ORGANIZATION_SEARCH_QUEUE_NAME,
    redis: input.redis,
  });
  const jobProducer = createOrganizationSearchJobProducer(queue);
  const processor = createOrganizationSearchProcessor({ db: input.db, jobProducer, clock: input.clock });
  let worker: OrganizationSearchWorkerHandle | undefined;
  let closing: Promise<void> | undefined;

  async function processJob(job: { id?: string; name: string; data: unknown }) {
    let result: unknown;
    if (job.name === ORGANIZATION_SOURCE_CHANGE_JOB_NAME) {
      result = await processor.processSourceChange(OrganizationSourceChangeJobPayloadSchema.parse(job.data));
    } else if (job.name === ORGANIZATION_REBUILD_JOB_NAME) {
      result = await processor.processRebuild(OrganizationRebuildJobPayloadSchema.parse(job.data));
    } else {
      throw new Error(`Unsupported organization search job name: ${job.name}`);
    }
    input.logger.info({ jobId: job.id, jobName: job.name, result }, "organization search job processed");
    return result;
  }

  async function startConsumers() {
    if (closing) throw new Error("Organization search worker module is closed");
    if (worker) return;
    worker = (
      input.factories?.createWorker ?? createJobWorker<OrganizationSearchJobPayload, unknown, OrganizationSearchJobName>
    )({
      name: ORGANIZATION_SEARCH_QUEUE_NAME,
      redis: input.redis,
      concurrency: input.config.concurrency,
      processor: processJob,
    });
    worker.on("error", (error) => input.logger.error({ err: error }, "organization search worker error"));
    worker.on("failed", (job, error) =>
      input.logger.error({ err: error, jobId: job?.id, jobName: job?.name }, "organization search job failed"),
    );
  }

  async function closeResources() {
    const failures: unknown[] = [];
    if (worker) {
      try {
        await worker.close();
      } catch (error) {
        failures.push(error);
      }
      worker = undefined;
    }
    try {
      await queue.close();
    } catch (error) {
      failures.push(error);
    }
    if (failures.length) throw new AggregateError(failures, "Organization search worker shutdown failed");
  }

  return {
    key: ORGANIZATION_SEARCH_WORKER_MODULE_KEY,
    queue,
    processor,
    queueRegistrations: [
      { moduleKey: ORGANIZATION_SEARCH_WORKER_MODULE_KEY, queueName: ORGANIZATION_SEARCH_QUEUE_NAME, queue },
    ],
    startConsumers,
    close() {
      closing ??= closeResources();
      return closing;
    },
  };
}

export type OrganizationSearchWorkerModule = ReturnType<typeof createOrganizationSearchWorkerModule>;
