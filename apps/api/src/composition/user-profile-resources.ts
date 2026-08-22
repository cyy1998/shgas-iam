import type { RebuildUserProfileJobPayload, UserProfileJobName } from "@iam/contracts";
import type { BullMqRedisConfig, JobQueue } from "@iam/jobs";
import type { createInternalUserQueryResource } from "./internal-user-query";
import { USER_PROFILE_QUEUE_NAME } from "@iam/contracts";
import { createJobQueue } from "@iam/jobs";
import { createInternalUserQueryResource as createQueryResourceDefault } from "./internal-user-query";

type UserProfileQueue = JobQueue<
  RebuildUserProfileJobPayload,
  unknown,
  UserProfileJobName
>;

export interface CreateApiUserProfileResourcesOptions {
  readonly databaseUrl: string;
  readonly redis: BullMqRedisConfig;
  readonly createQueryResource?: typeof createInternalUserQueryResource;
  readonly createQueue?: (input: {
    name: string;
    redis: BullMqRedisConfig;
  }) => UserProfileQueue;
}

export function createApiUserProfileResources(
  options: CreateApiUserProfileResourcesOptions,
) {
  const query = (options.createQueryResource ?? createQueryResourceDefault)({
    databaseUrl: options.databaseUrl,
  });
  const queue = (options.createQueue ?? createJobQueue)({
    name: USER_PROFILE_QUEUE_NAME,
    redis: options.redis,
  });

  return {
    query,
    queue,
    async close() {
      await Promise.all([
        query.close(),
        queue.close(),
      ]);
    },
  };
}
