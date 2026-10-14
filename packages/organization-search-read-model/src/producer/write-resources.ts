import type { BullMqRedisConfig } from "@iam/jobs";
import { createJobQueue } from "@iam/jobs";
import { createOrganizationSearchJobProducer } from "../jobs";
import { ORGANIZATION_SEARCH_QUEUE_NAME } from "../work.types";

export function createOrganizationSearchWriteResources(options: {
  redis: BullMqRedisConfig;
  logger: { error: (context: { err: unknown }, message: string) => void };
  prefix?: string;
}) {
  const queue = createJobQueue({
    name: ORGANIZATION_SEARCH_QUEUE_NAME,
    redis: options.redis,
    prefix: options.prefix,
    connectionOptions: { maxRetriesPerRequest: 1, connectTimeout: 2_000, enableOfflineQueue: false },
  });
  queue.on("error", (error) => options.logger.error({ err: error }, "organization search write queue error"));
  const jobProducer = createOrganizationSearchJobProducer({
    async addBulk(jobs) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // A TCP peer can stay connected without answering Redis's readiness or
        // commands. Bound this wake while the long-lived client keeps reconnecting.
        return await Promise.race([
          queue.addBulk(jobs),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error("Organization search queue wake-up timed out")), 2_000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  });
  return {
    queue,
    jobProducer,
    async close() {
      // Producer shutdown has no jobs to drain. Disconnect an initialized client
      // as well so a connected peer cannot keep QUIT waiting indefinitely.
      await queue.getBackend().close(true);
      await queue.close();
    },
  };
}
