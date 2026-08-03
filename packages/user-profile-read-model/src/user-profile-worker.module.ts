import type { SubjectAccessBootstrap } from "@iam/api-core/subject-access";
import type {
  RebuildUserProfileJobPayload,
  UserProfileJobName,
} from "@iam/contracts";
import type { db as database } from "@iam/db";
import type { BullMqRedisConfig, CreateJobQueueInput, CreateJobWorkerInput, JobQueue } from "@iam/jobs";
import type { SubjectFactsRedisClient } from "./subject-facts-redis.publisher";
import type { SubjectProjectionCutoverBackfill } from "./subject-projection-cutover-backfill";
import type { SubjectAccessRepairPort } from "./user-profile-rebuild.processor";
import type { UserProfileWorkerMaintenance } from "./user-profile-worker-maintenance";
import {
  RebuildUserProfileJobPayloadSchema,
  USER_PROFILE_QUEUE_NAME,
  UserProfileJobName as UserProfileJobNameValue,
} from "@iam/contracts";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import { createRoleAssignmentResolver } from "@iam/role-assignment-resolution";
import { createUserProfileDirtyRepository } from "./dirty.repository";
import { createSubjectFactsRedisPublisher } from "./subject-facts-redis.publisher";
import { createSubjectProjectionCutoverBackfill } from "./subject-projection-cutover-backfill";
import { createSubjectProjectionCutoverRepository } from "./subject-projection-cutover.repository";
import { createUserProfileBuildRepository } from "./user-profile-build.repository";
import { createUserProfileBuilder } from "./user-profile-builder.service";
import { createUserProfileJobProducer } from "./user-profile-job.producer";
import { createUserProfileMaintenanceRepository } from "./user-profile-maintenance.repository";
import { createUserProfilePublicationRepository } from "./user-profile-publication.repository";
import { createUserProfileRebuildProcessor } from "./user-profile-rebuild.processor";
import { createUserProfileWorkerMaintenance } from "./user-profile-worker-maintenance";

export const USER_PROFILE_WORKER_MODULE_KEY = "user-profile";

export interface UserProfileWorkerModuleLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  warn: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export interface UserProfileJobProcessorInput {
  id?: string;
  name: string;
  data: unknown;
}

export interface UserProfileJobProcessorRebuildPort {
  process: (
    payload: RebuildUserProfileJobPayload,
    options?: { jobId?: string },
  ) => Promise<{
    status: string;
    cacheStatus?: "failed" | "published" | "retained-newer";
  }>;
}

export interface CreateUserProfileJobProcessorDeps {
  rebuildProcessor: UserProfileJobProcessorRebuildPort;
  logger: UserProfileWorkerModuleLogger;
}

export function createUserProfileJobProcessor(deps: CreateUserProfileJobProcessorDeps) {
  return async (job: UserProfileJobProcessorInput) => {
    if (job.name !== UserProfileJobNameValue.RebuildUserProfile)
      throw new Error(`Unsupported user profile job name: ${job.name}`);

    const payload = RebuildUserProfileJobPayloadSchema.parse(job.data);
    try {
      const result = await deps.rebuildProcessor.process(payload, { jobId: job.id });
      deps.logger.info({
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
        jobId: job.id,
        jobName: job.name,
        status: result.status,
        cacheStatus: result.cacheStatus,
      }, "user profile rebuild job processed");
      return result;
    }
    catch (error) {
      deps.logger.error({
        err: error,
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
        jobId: job.id,
        jobName: job.name,
        status: "failed",
      }, "user profile rebuild job failed");
      throw error;
    }
  };
}

export type UserProfileJobProcessor = ReturnType<typeof createUserProfileJobProcessor>;

export interface CreateUserProfileWorkerModuleInput {
  db: typeof database;
  redis: BullMqRedisConfig;
  subjectFactsRedis: SubjectFactsRedisClient;
  subjectAccessRepair: SubjectAccessRepairPort;
  subjectAccessBootstrap: Pick<SubjectAccessBootstrap, "seedMany">;
  logger: UserProfileWorkerModuleLogger;
  clock: {
    nowDate: () => Date;
  };
  config: {
    concurrency: number;
    rebuildBatchSize: number;
    backfillBatchSize: number;
  };
  factories?: {
    createQueue?: (input: CreateJobQueueInput) => JobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>;
    createWorker?: (
      input: CreateJobWorkerInput<RebuildUserProfileJobPayload, unknown, UserProfileJobName>,
    ) => UserProfileWorkerHandle;
  };
}

export interface UserProfileWorkerHandle {
  close: () => Promise<void>;
  on: (
    (
      event: "completed",
      listener: (job: { id?: string; name: string; data?: unknown; returnvalue?: unknown }) => void,
    ) => unknown
  ) & (
    (
      event: "failed",
      listener: (job: { id?: string; name: string; data?: unknown } | undefined, error: Error) => void,
    ) => unknown
  );
}

export interface UserProfileWorkerModule {
  key: typeof USER_PROFILE_WORKER_MODULE_KEY;
  queue: JobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>;
  maintenance: UserProfileWorkerMaintenance;
  cutoverBackfill: SubjectProjectionCutoverBackfill;
  queueRegistrations: Array<{
    moduleKey: typeof USER_PROFILE_WORKER_MODULE_KEY;
    queueName: typeof USER_PROFILE_QUEUE_NAME;
    queue: JobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>;
  }>;
  startConsumers: () => Promise<void>;
  close: () => Promise<void>;
}

export function createUserProfileWorkerModule(input: CreateUserProfileWorkerModuleInput): UserProfileWorkerModule {
  const dirtyRepository = createUserProfileDirtyRepository(input.db);
  const publicationRepository = createUserProfilePublicationRepository(input.db);
  const subjectFactsPublisher = createSubjectFactsRedisPublisher(input.subjectFactsRedis);
  const roleAssignmentResolver = createRoleAssignmentResolver(input.db);
  const maintenanceRepository = createUserProfileMaintenanceRepository(input.db);
  const cutoverRepository = createSubjectProjectionCutoverRepository(input.db);
  const buildRepository = createUserProfileBuildRepository(input.db, roleAssignmentResolver);
  const queue
    = (input.factories?.createQueue
      ?? createJobQueue<RebuildUserProfileJobPayload, unknown, UserProfileJobName>)({
      name: USER_PROFILE_QUEUE_NAME,
      redis: input.redis,
    });
  const jobProducer = createUserProfileJobProducer(queue);
  const builder = createUserProfileBuilder({
    buildRepository,
    clock: input.clock,
    config: {
      batchSize: input.config.rebuildBatchSize,
    },
  });
  const rebuildProcessor = createUserProfileRebuildProcessor({
    dirtyRepository,
    builder,
    publicationRepository,
    subjectFactsPublisher,
    subjectAccessRepair: input.subjectAccessRepair,
    logger: input.logger,
    clock: input.clock,
  });
  const jobProcessor = createUserProfileJobProcessor({
    rebuildProcessor,
    logger: input.logger,
  });
  const maintenance = createUserProfileWorkerMaintenance({
    userRepository: maintenanceRepository,
    dirtyRepository,
    jobProducer,
    clock: input.clock,
    config: {
      backfillBatchSize: input.config.backfillBatchSize,
    },
  });
  const cutoverBackfill = createSubjectProjectionCutoverBackfill({
    repository: cutoverRepository,
    builder,
    subjectFacts: subjectFactsPublisher,
    subjectAccess: input.subjectAccessBootstrap,
    clock: input.clock,
  });
  let worker: UserProfileWorkerHandle | undefined;

  async function startConsumers() {
    if (worker !== undefined)
      return;

    worker
      = (input.factories?.createWorker
        ?? createJobWorker<RebuildUserProfileJobPayload, unknown, UserProfileJobName>)({
        name: USER_PROFILE_QUEUE_NAME,
        redis: input.redis,
        concurrency: input.config.concurrency,
        processor: jobProcessor,
      });

    worker.on("completed", (job) => {
      input.logger.info({
        jobId: job.id,
        jobName: job.name,
        status: extractReturnStatus(job.returnvalue),
        cacheStatus: extractReturnCacheStatus(job.returnvalue),
        ...extractRebuildJobLogFields(job),
      }, "user profile job completed");
    });
    worker.on("failed", (job, error) => {
      input.logger.error({
        err: error,
        jobId: job?.id,
        jobName: job?.name,
        status: "failed",
        ...extractRebuildJobLogFields(job),
      }, "user profile job failed");
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
    key: USER_PROFILE_WORKER_MODULE_KEY,
    queue,
    maintenance,
    cutoverBackfill,
    queueRegistrations: [{
      moduleKey: USER_PROFILE_WORKER_MODULE_KEY,
      queueName: USER_PROFILE_QUEUE_NAME,
      queue,
    }],
    startConsumers,
    close,
  };
}

function extractRebuildJobLogFields(job: { name?: string; data?: unknown } | undefined) {
  if (job?.name !== UserProfileJobNameValue.RebuildUserProfile)
    return {};

  const payload = RebuildUserProfileJobPayloadSchema.safeParse(job.data);
  if (!payload.success)
    return {};

  return {
    userId: payload.data.userId,
    dirtyVersion: payload.data.dirtyVersion,
  };
}

function extractReturnStatus(returnvalue: unknown) {
  if (typeof returnvalue !== "object" || returnvalue === null || !("status" in returnvalue))
    return undefined;

  const status = (returnvalue as { status?: unknown }).status;
  return typeof status === "string" ? status : undefined;
}

function extractReturnCacheStatus(returnvalue: unknown) {
  if (typeof returnvalue !== "object" || returnvalue === null || !("cacheStatus" in returnvalue))
    return undefined;

  const cacheStatus = (returnvalue as { cacheStatus?: unknown }).cacheStatus;
  return typeof cacheStatus === "string" ? cacheStatus : undefined;
}
