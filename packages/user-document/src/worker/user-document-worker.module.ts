import type {
  RebuildUserDocumentJobPayload,
  UserDocumentJobName,
  UserDocumentJobPayload,
  UserDocumentOutboxJobPayload,
} from "@iam/contracts";
import {
  RebuildUserDocumentJobPayloadSchema,
  RebuildUserDocumentsBatchJobPayloadSchema,
  USER_DOCUMENT_QUEUE_NAME,
  UserDocumentJobName as UserDocumentJobNameValue,
  UserDocumentOutboxJobPayloadSchema,
} from "@iam/contracts";
import type { db as database } from "@iam/db";
import type { BullMqRedisConfig, CreateJobQueueInput, CreateJobWorkerInput, JobQueue } from "@iam/jobs";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import { createOrganizationResponsibilityResolver } from "@iam/organization-responsibility-resolution";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createUserDocumentBuilder, parseUserDocumentRow } from "../build/user-document-builder";
import type { DocumentFactsCacheRecord, PublishedUserDocument } from "../document";
import {
  createDocumentFactsCacheRecord,
  DocumentFactsCacheRecordSchema,
  USER_DOCUMENT_SCHEMA_VERSION,
} from "../document";
import { createUserDocumentJobProducer } from "../invalidation/user-document-job.producer";
import type { SubjectFactsRedisClient } from "../subject-facts/subject-facts-redis-publisher.core";
import type { UserDocumentProjectionBundle } from "./user-document-projection";
import { createUserDocumentProjectionBundle } from "./user-document-projection";
import type { SubjectAccessRepairPort } from "./user-document-rebuild.processor";
import { createUserDocumentUpdateProcessor } from "./user-document-update.processor";

export const USER_DOCUMENT_WORKER_MODULE_KEY = "user-document";

export interface UserDocumentWorkerModuleLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export interface UserDocumentJobProcessorInput {
  id?: string;
  name: string;
  data: unknown;
}

export interface UserDocumentJobProcessorRebuildPort {
  processBatch: (payloads: RebuildUserDocumentJobPayload[]) => Promise<{
    status: string;
    requested: number;
    rebuilt: number;
    skipped: number;
    stale: number;
  }>;
  process: (
    payload: RebuildUserDocumentJobPayload,
    options?: { jobId?: string },
  ) => Promise<{
    status: string;
    cacheStatus?: "failed" | "published" | "retained-newer";
  }>;
}

export interface CreateUserDocumentJobProcessorDeps {
  rebuildProcessor: UserDocumentJobProcessorRebuildPort;
  outboxProcessor?: { processOutbox(payload: UserDocumentOutboxJobPayload): Promise<{ status: string }> };
  logger: UserDocumentWorkerModuleLogger;
}

export function createUserDocumentJobProcessor(deps: CreateUserDocumentJobProcessorDeps) {
  return async (job: UserDocumentJobProcessorInput) => {
    if (job.name === UserDocumentJobNameValue.ExpandUserDocumentOutbox) {
      if (!deps.outboxProcessor) throw new Error("User Document Outbox processor is required");
      return await deps.outboxProcessor.processOutbox(UserDocumentOutboxJobPayloadSchema.parse(job.data));
    }
    if (job.name === UserDocumentJobNameValue.RebuildUserDocumentsBatch) {
      const { requests } = RebuildUserDocumentsBatchJobPayloadSchema.parse(job.data);
      const startedAt = performance.now();
      try {
        const result = await deps.rebuildProcessor.processBatch(requests);
        deps.logger.info(
          { ...result, jobId: job.id, jobName: job.name, durationMs: performance.now() - startedAt },
          "user document rebuild batch processed",
        );
        return result;
      } catch (error) {
        deps.logger.error(
          {
            ...batchFailureLogFields(error),
            requested: requests.length,
            jobId: job.id,
            jobName: job.name,
            durationMs: performance.now() - startedAt,
          },
          "user document rebuild batch failed",
        );
        throw error;
      }
    }
    if (job.name !== UserDocumentJobNameValue.RebuildUserDocument)
      throw new Error(`Unsupported user document job name: ${job.name}`);

    const payload = RebuildUserDocumentJobPayloadSchema.parse(job.data);
    try {
      const result = await deps.rebuildProcessor.process(payload, { jobId: job.id });
      deps.logger.info(
        {
          userId: payload.userId,
          version: payload.version,
          jobId: job.id,
          jobName: job.name,
          status: result.status,
          cacheStatus: result.cacheStatus,
        },
        "user document rebuild job processed",
      );
      return result;
    } catch (error) {
      deps.logger.error(
        {
          err: error,
          userId: payload.userId,
          version: payload.version,
          jobId: job.id,
          jobName: job.name,
          status: "failed",
        },
        "user document rebuild job failed",
      );
      throw error;
    }
  };
}

export type UserDocumentJobProcessor = ReturnType<typeof createUserDocumentJobProcessor>;

export interface CreateUserDocumentWorkerModuleInput {
  db: typeof database;
  redis: BullMqRedisConfig;
  subjectFactsRedis: SubjectFactsRedisClient;
  subjectAccessRepair: SubjectAccessRepairPort;
  logger: UserDocumentWorkerModuleLogger;
  clock: {
    nowDate: () => Date;
  };
  config: {
    concurrency: number;
    rebuildBatchSize: number;
    backfillBatchSize: number;
  };
  factories?: {
    createQueue?: (input: CreateJobQueueInput) => JobQueue<UserDocumentJobPayload, unknown, UserDocumentJobName>;
    createWorker?: (
      input: CreateJobWorkerInput<UserDocumentJobPayload, unknown, UserDocumentJobName>,
    ) => UserDocumentWorkerHandle;
  };
}

export interface UserDocumentWorkerHandle {
  close: () => Promise<void>;
  on: ((
    event: "completed",
    listener: (job: { id?: string; name: string; data?: unknown; returnvalue?: unknown }) => void,
  ) => unknown) &
    ((
      event: "failed",
      listener: (job: { id?: string; name: string; data?: unknown } | undefined, error: Error) => void,
    ) => unknown);
}

export interface UserDocumentWorkerModule {
  key: typeof USER_DOCUMENT_WORKER_MODULE_KEY;
  queue: JobQueue<UserDocumentJobPayload, unknown, UserDocumentJobName>;
  maintenance: {
    backfillAllUsers(options?: {
      batchSize?: number;
      signal?: AbortSignal;
    }): Promise<{ registered: number; enqueued: number }>;
    repairFailedOrStale(input: {
      staleBefore: Date;
      limit?: number;
      force?: boolean;
    }): Promise<{ enqueued: number; failed: number; exhausted: number }>;
  };
  queueRegistrations: Array<{
    moduleKey: typeof USER_DOCUMENT_WORKER_MODULE_KEY;
    queueName: typeof USER_DOCUMENT_QUEUE_NAME;
    queue: JobQueue<UserDocumentJobPayload, unknown, UserDocumentJobName>;
  }>;
  startConsumers: () => Promise<void>;
  close: () => Promise<void>;
}

export function createCurrentUserDocumentProjectionBundle() {
  return createUserDocumentProjectionBundle<PublishedUserDocument, DocumentFactsCacheRecord>({
    schemaVersion: USER_DOCUMENT_SCHEMA_VERSION,
    parseDocumentRow: parseUserDocumentRow,
    createBuilder(input) {
      return createUserDocumentBuilder({
        db: input.db,
        roleAssignmentResolver: createRoleAssignmentResolver(input.db),
        responsibilityResolver: createOrganizationResponsibilityResolver(input.db),
        clock: input.clock,
        config: { batchSize: input.batchSize },
      });
    },
    createFactsRecord(profile) {
      return createDocumentFactsCacheRecord(profile);
    },
    parseFactsRecord: (input) => DocumentFactsCacheRecordSchema.parse(input),
  });
}

export function createUserDocumentWorkerModule(input: CreateUserDocumentWorkerModuleInput): UserDocumentWorkerModule {
  return createUserDocumentWorkerModuleWithProjection(input, createCurrentUserDocumentProjectionBundle());
}

function createUserDocumentWorkerModuleWithProjection<
  TDocument extends PublishedUserDocument,
  TFactsRecord extends {
    subjectIdentifier: string;
    sourceVersion: string;
  },
>(
  input: CreateUserDocumentWorkerModuleInput,
  projection: UserDocumentProjectionBundle<TDocument, TFactsRecord>,
): UserDocumentWorkerModule {
  const subjectFactsPublisher = projection.subjectFacts.createPublisher(input.subjectFactsRedis);
  const queue = (input.factories?.createQueue ?? createJobQueue<UserDocumentJobPayload, unknown, UserDocumentJobName>)({
    name: USER_DOCUMENT_QUEUE_NAME,
    redis: input.redis,
  });
  const jobProducer = createUserDocumentJobProducer(queue, { batchSize: input.config.rebuildBatchSize });
  const rebuildProcessor = createUserDocumentUpdateProcessor({
    db: input.db,
    projection,
    jobProducer,
    batchSize: input.config.rebuildBatchSize,
    subjectFactsPublisher,
    subjectAccessRepair: input.subjectAccessRepair,
    logger: input.logger,
    clock: input.clock,
  });
  const jobProcessor = createUserDocumentJobProcessor({
    rebuildProcessor,
    outboxProcessor: rebuildProcessor,
    logger: input.logger,
  });
  const maintenance = {
    backfillAllUsers: (options: { batchSize?: number; signal?: AbortSignal } = {}) =>
      rebuildProcessor.backfillAllUsers({
        signal: options.signal,
        batchSize: options.batchSize ?? input.config.backfillBatchSize,
      }),
    repairFailedOrStale(options: { staleBefore: Date; limit?: number; force?: boolean }) {
      return rebuildProcessor.repairFailedOrStale({
        ...options,
        limit: options.limit ?? input.config.backfillBatchSize,
      });
    },
  };
  let worker: UserDocumentWorkerHandle | undefined;

  async function startConsumers() {
    if (worker !== undefined) return;

    worker = (input.factories?.createWorker ?? createJobWorker<UserDocumentJobPayload, unknown, UserDocumentJobName>)({
      name: USER_DOCUMENT_QUEUE_NAME,
      redis: input.redis,
      concurrency: input.config.concurrency,
      processor: jobProcessor,
    });

    worker.on("completed", (job) => {
      input.logger.info(
        {
          jobId: job.id,
          jobName: job.name,
          status: extractReturnStatus(job.returnvalue),
          cacheStatus: extractReturnCacheStatus(job.returnvalue),
          ...extractRebuildJobLogFields(job),
        },
        "user document job completed",
      );
    });
    worker.on("failed", (job, error) => {
      input.logger.error(
        {
          ...(job?.name === UserDocumentJobNameValue.RebuildUserDocumentsBatch
            ? batchFailureLogFields(error)
            : { err: error }),
          jobId: job?.id,
          jobName: job?.name,
          status: "failed",
          ...extractRebuildJobLogFields(job),
        },
        "user document job failed",
      );
    });
  }

  async function close() {
    if (worker !== undefined) {
      await worker.close();
      worker = undefined;
    }
    await queue.close();
  }

  return {
    key: USER_DOCUMENT_WORKER_MODULE_KEY,
    queue,
    maintenance,
    queueRegistrations: [
      {
        moduleKey: USER_DOCUMENT_WORKER_MODULE_KEY,
        queueName: USER_DOCUMENT_QUEUE_NAME,
        queue,
      },
    ],
    startConsumers,
    close,
  };
}

function batchFailureLogFields(error: unknown) {
  return { errorType: error instanceof AggregateError ? "AggregateError" : "BatchRebuildError" };
}

function extractRebuildJobLogFields(job: { name?: string; data?: unknown } | undefined) {
  if (job?.name === UserDocumentJobNameValue.RebuildUserDocumentsBatch) {
    const payload = RebuildUserDocumentsBatchJobPayloadSchema.safeParse(job.data);
    return payload.success ? { requested: payload.data.requests.length } : {};
  }
  if (job?.name !== UserDocumentJobNameValue.RebuildUserDocument) return {};

  const payload = RebuildUserDocumentJobPayloadSchema.safeParse(job.data);
  if (!payload.success) return {};

  return {
    userId: payload.data.userId,
    version: payload.data.version,
  };
}

function extractReturnStatus(returnvalue: unknown) {
  if (typeof returnvalue !== "object" || returnvalue === null || !("status" in returnvalue)) return undefined;

  const status = (returnvalue as { status?: unknown }).status;
  return typeof status === "string" ? status : undefined;
}

function extractReturnCacheStatus(returnvalue: unknown) {
  if (typeof returnvalue !== "object" || returnvalue === null || !("cacheStatus" in returnvalue)) return undefined;

  const cacheStatus = (returnvalue as { cacheStatus?: unknown }).cacheStatus;
  return typeof cacheStatus === "string" ? cacheStatus : undefined;
}
