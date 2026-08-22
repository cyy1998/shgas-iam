import type { SubjectFactsCacheRecord } from "./profile-cache";
import type {
  CreateSubjectFactsRedisPublisherOptions,
  SubjectFactsRedisCacheClient,
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "./subject-facts-redis-publisher.core";
import { SubjectFactsCacheRecordSchema } from "./profile-cache";
import {
  createMonotonicSubjectFactsRedisPublisher,
  createSubjectFactsRedisInspector as createVersionedSubjectFactsRedisInspector,
  SUBJECT_FACTS_CACHE_KEY_PREFIX,
} from "./subject-facts-redis-publisher.core";

export function createSubjectFactsRedisPublisher(
  redis: SubjectFactsRedisClient,
  options: CreateSubjectFactsRedisPublisherOptions = {},
) {
  return createMonotonicSubjectFactsRedisPublisher<SubjectFactsCacheRecord>(
    redis,
    input => SubjectFactsCacheRecordSchema.parse(input),
    options,
  );
}

export function createSubjectFactsRedisCache(
  redis: SubjectFactsRedisCacheClient,
  options: CreateSubjectFactsRedisPublisherOptions & {
    readonly keyPrefix?: string;
  } = {},
) {
  const keyPrefix = options.keyPrefix ?? SUBJECT_FACTS_CACHE_KEY_PREFIX;
  const publisher = createSubjectFactsRedisPublisher(
    redis,
    { ...options, keyPrefix },
  );

  return {
    async read(subjectIdentifier: string) {
      return await redis.get(`${keyPrefix}${subjectIdentifier}`);
    },
    publish: publisher.publish,
  };
}

export function createSubjectFactsRedisInspector(
  redis: SubjectFactsRedisInspectionClient,
  options: CreateSubjectFactsRedisPublisherOptions = {},
) {
  return createVersionedSubjectFactsRedisInspector(
    redis,
    input => SubjectFactsCacheRecordSchema.parse(input),
    options,
  );
}
