import type { SubjectFactsCacheRecordV1 } from "./subject-facts-cache";
import type {
  CreateSubjectFactsRedisPublisherOptions,
  SubjectFactsRedisCacheClient,
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "./subject-facts-redis-publisher.core";
import {
  SubjectFactsCacheRecordV1Schema,
} from "./subject-facts-cache";
import {
  createMonotonicSubjectFactsRedisPublisher,
  SUBJECT_FACTS_CACHE_KEY_PREFIX,
} from "./subject-facts-redis-publisher.core";

export type {
  CreateSubjectFactsRedisPublisherOptions,
  SubjectFactsRedisCacheClient,
  SubjectFactsRedisClient,
  SubjectFactsRedisInspectionClient,
} from "./subject-facts-redis-publisher.core";

export function createSubjectFactsRedisPublisher(
  redis: SubjectFactsRedisClient,
  options: CreateSubjectFactsRedisPublisherOptions = {},
) {
  return createMonotonicSubjectFactsRedisPublisher<SubjectFactsCacheRecordV1>(
    redis,
    input => SubjectFactsCacheRecordV1Schema.parse(input),
    options,
  );
}

export function createSubjectFactsRedisCache(
  redis: SubjectFactsRedisCacheClient,
  options: CreateSubjectFactsRedisPublisherOptions = {},
) {
  const keyPrefix = options.keyPrefix ?? SUBJECT_FACTS_CACHE_KEY_PREFIX;
  const publisher = createSubjectFactsRedisPublisher(redis, { keyPrefix });

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
  const keyPrefix = options.keyPrefix ?? SUBJECT_FACTS_CACHE_KEY_PREFIX;

  return {
    async inspectMany(subjectIdentifiers: string[]) {
      if (new Set(subjectIdentifiers).size !== subjectIdentifiers.length)
        throw new Error("Subject Facts inspection contains duplicate subjects");
      if (subjectIdentifiers.length === 0)
        return [];
      const values = await redis.mget(
        ...subjectIdentifiers.map(subjectIdentifier => `${keyPrefix}${subjectIdentifier}`),
      );
      if (values.length !== subjectIdentifiers.length)
        throw new Error("Subject Facts inspection returned an incomplete batch");
      return values.map((value, index) => {
        if (value === null)
          return { status: "missing" as const };
        let decoded: unknown;
        try {
          decoded = JSON.parse(value);
        }
        catch {
          return { status: "invalid" as const };
        }
        const parsed = SubjectFactsCacheRecordV1Schema.safeParse(decoded);
        if (
          !parsed.success
          || parsed.data.subjectIdentifier !== subjectIdentifiers[index]
        ) {
          return { status: "invalid" as const };
        }
        return { status: "valid" as const, record: parsed.data };
      });
    },
  };
}
