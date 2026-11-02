import type { BullMqRedisConfig } from "@iam/jobs";
import { createJobProducerResources } from "@iam/jobs";
import { createOrganizationDocumentJobProducer } from "../jobs";
import { ORGANIZATION_DOCUMENT_QUEUE_NAME } from "../work.types";

export function createOrganizationDocumentWriteResources(options: {
  redis: BullMqRedisConfig;
  logger: { error: (context: { err: unknown }, message: string) => void };
  prefix?: string;
}) {
  const resources = createJobProducerResources({
    name: ORGANIZATION_DOCUMENT_QUEUE_NAME,
    redis: options.redis,
    prefix: options.prefix,
    onError: (error) => options.logger.error({ err: error }, "organization document write queue error"),
  });
  const jobProducer = createOrganizationDocumentJobProducer(resources.queue, {
    wakeUpTimeoutMs: resources.wakeUpTimeoutMs,
  });
  return {
    queue: resources.queue,
    jobProducer,
    close: resources.close,
  };
}
