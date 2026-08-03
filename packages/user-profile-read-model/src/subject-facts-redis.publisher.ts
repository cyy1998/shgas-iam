import type { SubjectFactsCacheRecordV1 } from "./subject-facts-cache";
import type {
  SubjectFactsPublisherPort,
} from "./user-profile-rebuild.processor";
import { SubjectFactsCacheRecordV1Schema } from "./subject-facts-cache";

const SUBJECT_FACTS_CACHE_KEY_PREFIX = "user-profile:subject-facts:";

const PUBLISH_IF_NOT_OLDER_SCRIPT = `
local currentJson = redis.call("GET", KEYS[1])
if currentJson then
  local decoded, current = pcall(cjson.decode, currentJson)
  if decoded and type(current) == "table" and type(current.sourceDirtyVersion) == "string" then
    local currentVersion = current.sourceDirtyVersion
    local incomingVersion = ARGV[1]
    local currentIsCanonical = string.match(currentVersion, "^[1-9][0-9]*$") ~= nil
    if currentIsCanonical and (
      string.len(currentVersion) > string.len(incomingVersion)
      or (
        string.len(currentVersion) == string.len(incomingVersion)
        and currentVersion > incomingVersion
      )
    ) then
      return 0
    end
  end
end

redis.call("SET", KEYS[1], ARGV[2])
return 1
`;

export interface SubjectFactsRedisClient {
  eval: (
    script: string,
    numberOfKeys: number,
    key: string,
    sourceDirtyVersion: string,
    record: string,
  ) => Promise<unknown>;
}

export interface SubjectFactsRedisCacheClient extends SubjectFactsRedisClient {
  get: (key: string) => Promise<string | null>;
}

export interface SubjectFactsRedisInspectionClient {
  mget: (...keys: string[]) => Promise<Array<string | null>>;
}

export interface CreateSubjectFactsRedisPublisherOptions {
  keyPrefix?: string;
}

export function createSubjectFactsRedisPublisher(
  redis: SubjectFactsRedisClient,
  options: CreateSubjectFactsRedisPublisherOptions = {},
): SubjectFactsPublisherPort & {
  publishMany: (records: SubjectFactsCacheRecordV1[]) => Promise<{
    published: number;
    retainedNewer: number;
  }>;
} {
  const keyPrefix = options.keyPrefix ?? SUBJECT_FACTS_CACHE_KEY_PREFIX;

  async function publish(input: SubjectFactsCacheRecordV1) {
    const record = SubjectFactsCacheRecordV1Schema.parse(input);
    const result = await redis.eval(
      PUBLISH_IF_NOT_OLDER_SCRIPT,
      1,
      `${keyPrefix}${record.subjectIdentifier}`,
      record.sourceDirtyVersion,
      JSON.stringify(record),
    );
    return {
      status: Number(result) === 1 ? "published" as const : "retained-newer" as const,
    };
  }

  async function publishMany(records: SubjectFactsCacheRecordV1[]) {
    const results = await Promise.all(records.map(publish));
    return results.reduce((summary, result) => {
      if (result.status === "published")
        summary.published += 1;
      else
        summary.retainedNewer += 1;
      return summary;
    }, { published: 0, retainedNewer: 0 });
  }

  return {
    publish,
    publishMany,
  };
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
