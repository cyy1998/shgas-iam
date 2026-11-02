import { USER_DOCUMENT_QUEUE_NAME, type UserDocumentJobName, type UserDocumentJobPayload } from "@iam/contracts";
import { type BullMqRedisConfig, createJobProducerResources } from "@iam/jobs";
import { createUserDocumentJobProducer } from "../invalidation/user-document-job.producer";

export function createUserDocumentWriteResources(options: {
  redis: BullMqRedisConfig;
  logger: { error: (context: { errorType: string }, message: string) => void };
  prefix?: string;
  batchSize?: number;
}) {
  const resources = createJobProducerResources<UserDocumentJobPayload, UserDocumentJobName>({
    name: USER_DOCUMENT_QUEUE_NAME,
    redis: options.redis,
    prefix: options.prefix,
    onError: (error) => options.logger.error({ errorType: error.name }, "User Document write queue error"),
  });
  const jobProducer = createUserDocumentJobProducer(resources.queue, {
    batchSize: options.batchSize,
    wakeUpTimeoutMs: resources.wakeUpTimeoutMs,
  });
  return {
    queue: resources.queue,
    jobProducer,
    close: resources.close,
  };
}
