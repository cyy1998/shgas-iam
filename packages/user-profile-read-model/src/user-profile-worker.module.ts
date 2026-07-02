import type { UserProfileJobName, UserProfileJobPayload } from "@iam/contracts";
import type { DbClient } from "@iam/db";
import type { BullMqRedisConfig, CreateJobQueueInput, CreateJobWorkerInput, JobQueue } from "@iam/jobs";
import type { UserProfileWorkerService } from "./user-profile-worker.service";
import {
  ExpandUserProfileScopeJobPayloadSchema,
  RebuildUserProfileJobPayloadSchema,
  USER_PROFILE_QUEUE_NAME,
  UserProfileJobName as UserProfileJobNameValue,
} from "@iam/contracts";
import { createJobQueue, createJobWorker } from "@iam/jobs";
import { createUserProfileDirtyRepository } from "./dirty.repository";
import { createUserProfileScopeRepository } from "./scope.repository";
import { createUserProfileBuildRepository } from "./user-profile-build.repository";
import { createUserProfileBuilder } from "./user-profile-builder.service";
import { createUserProfileJobProducer } from "./user-profile-job.producer";
import { createUserProfileWorkerService } from "./user-profile-worker.service";
import { createUserProfileRepository } from "./user-profile.repository";

export const USER_PROFILE_WORKER_MODULE_KEY = "user-profile";

export interface UserProfileWorkerModuleLogger {
  info: (data: Record<string, unknown>, message: string) => void;
  error: (data: Record<string, unknown>, message: string) => void;
}

export interface CreateUserProfileWorkerModuleInput {
  db: DbClient;
  redis: BullMqRedisConfig;
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
    createQueue?: (input: CreateJobQueueInput) => JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;
    createWorker?: (
      input: CreateJobWorkerInput<UserProfileJobPayload, unknown, UserProfileJobName>,
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
  queue: JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;
  workerService: UserProfileWorkerService;
  queueRegistrations: Array<{
    moduleKey: typeof USER_PROFILE_WORKER_MODULE_KEY;
    queueName: typeof USER_PROFILE_QUEUE_NAME;
    queue: JobQueue<UserProfileJobPayload, unknown, UserProfileJobName>;
  }>;
  startConsumers: () => Promise<void>;
  close: () => Promise<void>;
}

export function createUserProfileWorkerModule(input: CreateUserProfileWorkerModuleInput): UserProfileWorkerModule {
  const profileRepository = createUserProfileRepository(input.db);
  const dirtyRepository = createUserProfileDirtyRepository(input.db);
  const scopeRepository = createUserProfileScopeRepository(input.db);
  const buildRepository = createUserProfileBuildRepository(input.db);
  const queue = (input.factories?.createQueue ?? createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>)({
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
  const workerService = createUserProfileWorkerService({
    profileRepository,
    dirtyRepository,
    scopeRepository,
    builder,
    jobProducer,
    clock: input.clock,
    config: {
      backfillBatchSize: input.config.backfillBatchSize,
    },
  });
  let worker: UserProfileWorkerHandle | undefined;

  async function startConsumers() {
    if (worker !== undefined)
      return;

    worker = (input.factories?.createWorker ?? createJobWorker<UserProfileJobPayload, unknown, UserProfileJobName>)({
      name: USER_PROFILE_QUEUE_NAME,
      redis: input.redis,
      concurrency: input.config.concurrency,
      processor: async (job) => {
        switch (job.name) {
          case UserProfileJobNameValue.RebuildUserProfile: {
            const payload = RebuildUserProfileJobPayloadSchema.parse(job.data);
            try {
              const result = await workerService.processRebuildUserProfile(payload, { jobId: job.id });
              input.logger.info({
                userId: payload.userId,
                dirtyVersion: payload.dirtyVersion,
                jobId: job.id,
                jobName: job.name,
                status: result.status,
              }, "user profile rebuild job processed");
              return result;
            }
            catch (error) {
              input.logger.error({
                err: error,
                userId: payload.userId,
                dirtyVersion: payload.dirtyVersion,
                jobId: job.id,
                jobName: job.name,
                status: "failed",
              }, "user profile rebuild job failed");
              throw error;
            }
          }
          case UserProfileJobNameValue.ExpandUserProfileScope:
            return await workerService.processExpandUserProfileScope(
              ExpandUserProfileScopeJobPayloadSchema.parse(job.data),
            );
        }
      },
    });

    worker.on("completed", (job) => {
      input.logger.info({
        jobId: job.id,
        jobName: job.name,
        status: extractReturnStatus(job.returnvalue),
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
    workerService,
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
