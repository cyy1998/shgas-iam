import type { UserDocumentJobName, UserDocumentJobPayload } from "@iam/contracts";
import { USER_DOCUMENT_QUEUE_NAME } from "@iam/contracts";
import type { BullMqRedisConfig, JobQueue } from "@iam/jobs";
import { createJobQueue } from "@iam/jobs";
import type { createInternalUserQueryResource } from "./internal-user-query";
import { createInternalUserQueryResource as createQueryResourceDefault } from "./internal-user-query";

type UserDocumentQueue = JobQueue<UserDocumentJobPayload, unknown, UserDocumentJobName>;

export interface CreateApiUserDocumentResourcesOptions {
  readonly databaseUrl: string;
  readonly redis: BullMqRedisConfig;
  readonly createQueryResource?: typeof createInternalUserQueryResource;
  readonly createQueue?: (input: { name: string; redis: BullMqRedisConfig }) => UserDocumentQueue;
}

export function createApiUserDocumentResources(options: CreateApiUserDocumentResourcesOptions) {
  const query = (options.createQueryResource ?? createQueryResourceDefault)({
    databaseUrl: options.databaseUrl,
  });
  const queue = (options.createQueue ?? createJobQueue)({
    name: USER_DOCUMENT_QUEUE_NAME,
    redis: options.redis,
  });

  return {
    query,
    queue,
    async close() {
      await Promise.all([query.close(), queue.close()]);
    },
  };
}
