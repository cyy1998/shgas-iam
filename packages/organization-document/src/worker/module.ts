import type { db as database } from "@iam/db";
import type { BullMqRedisConfig, CreateJobQueueInput, CreateJobWorkerInput, JobQueue } from "@iam/jobs";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import {
  createOrganizationDocumentJobProducer,
  type OrganizationDocumentJobName,
  type OrganizationDocumentJobPayload,
} from "../jobs";
import {
  ORGANIZATION_DOCUMENT_QUEUE_NAME,
  ORGANIZATION_OUTBOX_JOB_NAME,
  ORGANIZATION_REBUILD_JOB_NAME,
  OrganizationOutboxJobPayloadSchema,
  OrganizationRebuildJobPayloadSchema,
} from "../work.types";
import { createOrganizationDocumentProcessor } from "./processor";

export const ORGANIZATION_DOCUMENT_WORKER_MODULE_KEY = "organization-document";

export interface OrganizationDocumentWorkerLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export interface OrganizationDocumentWorkerHandle {
  close: () => Promise<void>;
  on: ((event: "error", listener: (error: Error) => void) => unknown) &
    ((event: "failed", listener: (job: { id?: string; name: string } | undefined, error: Error) => void) => unknown);
}

export interface CreateOrganizationDocumentWorkerModuleInput {
  db: typeof database;
  redis: BullMqRedisConfig;
  logger: OrganizationDocumentWorkerLogger;
  clock?: { nowDate: () => Date };
  config: { concurrency: number };
  factories?: {
    createQueue?: (
      input: CreateJobQueueInput,
    ) => JobQueue<OrganizationDocumentJobPayload, unknown, OrganizationDocumentJobName>;
    createWorker?: (
      input: CreateJobWorkerInput<OrganizationDocumentJobPayload, unknown, OrganizationDocumentJobName>,
    ) => OrganizationDocumentWorkerHandle;
  };
}

export function createOrganizationDocumentWorkerModule(input: CreateOrganizationDocumentWorkerModuleInput) {
  const queue = (
    input.factories?.createQueue ?? createJobQueue<OrganizationDocumentJobPayload, unknown, OrganizationDocumentJobName>
  )({
    name: ORGANIZATION_DOCUMENT_QUEUE_NAME,
    redis: input.redis,
  });
  const jobProducer = createOrganizationDocumentJobProducer(queue);
  const processor = createOrganizationDocumentProcessor({ db: input.db, jobProducer, clock: input.clock });
  let worker: OrganizationDocumentWorkerHandle | undefined;
  let closing: Promise<void> | undefined;

  async function processJob(job: { id?: string; name: string; data: unknown }) {
    let result: unknown;
    if (job.name === ORGANIZATION_OUTBOX_JOB_NAME) {
      result = await processor.processOutbox(OrganizationOutboxJobPayloadSchema.parse(job.data));
    } else if (job.name === ORGANIZATION_REBUILD_JOB_NAME) {
      result = await processor.processRebuild(OrganizationRebuildJobPayloadSchema.parse(job.data));
    } else {
      throw new Error(`Unsupported organization document job name: ${job.name}`);
    }
    input.logger.info({ jobId: job.id, jobName: job.name, result }, "organization document job processed");
    return result;
  }

  async function startConsumers() {
    if (closing) throw new Error("Organization document worker module is closed");
    if (worker) return;
    worker = (
      input.factories?.createWorker ??
      createJobWorker<OrganizationDocumentJobPayload, unknown, OrganizationDocumentJobName>
    )({
      name: ORGANIZATION_DOCUMENT_QUEUE_NAME,
      redis: input.redis,
      concurrency: input.config.concurrency,
      processor: processJob,
    });
    worker.on("error", (error) => input.logger.error({ err: error }, "organization document worker error"));
    worker.on("failed", (job, error) =>
      input.logger.error({ err: error, jobId: job?.id, jobName: job?.name }, "organization document job failed"),
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
    if (failures.length) throw new AggregateError(failures, "Organization document worker shutdown failed");
  }

  return {
    key: ORGANIZATION_DOCUMENT_WORKER_MODULE_KEY,
    queue,
    processor,
    queueRegistrations: [
      { moduleKey: ORGANIZATION_DOCUMENT_WORKER_MODULE_KEY, queueName: ORGANIZATION_DOCUMENT_QUEUE_NAME, queue },
    ],
    startConsumers,
    close() {
      closing ??= closeResources();
      return closing;
    },
  };
}

export type OrganizationDocumentWorkerModule = ReturnType<typeof createOrganizationDocumentWorkerModule>;
