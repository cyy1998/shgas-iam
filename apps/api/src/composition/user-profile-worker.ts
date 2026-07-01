import type { UserProfileJobName, UserProfileJobPayload } from "@iam/contracts";
import env from "@api/env";
import { logger } from "@api/lib/logger";
import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import db from "@iam/db";
import { createJobQueue } from "@iam/jobs";
import { createUserProfileJobProducer } from "@iam/user-profile-read-model/producer";
import {
  createUserProfileBuilder,
  createUserProfileBuildRepository,
  createUserProfileWorkerService,
} from "@iam/user-profile-read-model/worker";
import { createApiRepositories } from "./repositories";
import { createApiRuntime } from "./runtime";

export interface CreateUserProfileWorkerCompositionOptions {
  env?: typeof env;
  logger?: typeof logger;
}

export async function createUserProfileWorkerComposition(
  options: CreateUserProfileWorkerCompositionOptions = {},
) {
  const compositionEnv = options.env ?? env;
  const compositionLogger = options.logger ?? logger;
  const runtime = createApiRuntime({ env: compositionEnv, logger: compositionLogger });
  const repositories = createApiRepositories();
  const userProfileBuildRepository = createUserProfileBuildRepository(db);
  const queue = createJobQueue<UserProfileJobPayload, unknown, UserProfileJobName>({
    name: USER_PROFILE_QUEUE_NAME,
    redis: runtime.config.env.redis,
  });
  const jobProducer = createUserProfileJobProducer(queue);
  const builder = createUserProfileBuilder({
    buildRepository: userProfileBuildRepository,
    clock: runtime.clock,
    config: {
      batchSize: runtime.config.userProfile.rebuildBatchSize,
    },
  });

  const workerService = createUserProfileWorkerService({
    profileRepository: repositories.userProfile,
    dirtyRepository: repositories.userProfileDirty,
    scopeRepository: repositories.userProfileScope,
    builder,
    jobProducer,
    clock: runtime.clock,
    config: {
      backfillBatchSize: runtime.config.userProfile.backfillBatchSize,
    },
  });

  return {
    env: compositionEnv,
    logger: compositionLogger,
    runtime,
    repositories,
    userProfileBuildRepository,
    queue,
    jobProducer,
    builder,
    workerService,
  };
}
