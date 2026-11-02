import type { BullMqRedisConfig } from "@iam/jobs";
import { createUserDocumentWriteResources } from "@iam/user-document/producer";
import type { createInternalUserQueryResource } from "./internal-user-query";
import { createInternalUserQueryResource as createQueryResourceDefault } from "./internal-user-query";

export interface CreateApiUserDocumentResourcesOptions {
  readonly databaseUrl: string;
  readonly redis: BullMqRedisConfig;
  readonly logger: Parameters<typeof createUserDocumentWriteResources>[0]["logger"];
  readonly createQueryResource?: typeof createInternalUserQueryResource;
  readonly createWriteResources?: typeof createUserDocumentWriteResources;
}

export function createApiUserDocumentResources(options: CreateApiUserDocumentResourcesOptions) {
  const query = (options.createQueryResource ?? createQueryResourceDefault)({
    databaseUrl: options.databaseUrl,
  });
  const writes = (options.createWriteResources ?? createUserDocumentWriteResources)({
    redis: options.redis,
    logger: options.logger,
  });

  return {
    query,
    queue: writes.queue,
    jobProducer: writes.jobProducer,
    async close() {
      await Promise.all([query.close(), writes.close()]);
    },
  };
}
