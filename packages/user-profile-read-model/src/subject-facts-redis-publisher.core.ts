export const SUBJECT_FACTS_CACHE_KEY_PREFIX = "user-profile:subject-facts:";

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

export function createMonotonicSubjectFactsRedisPublisher<TRecord extends {
  subjectIdentifier: string;
  sourceDirtyVersion: string;
}>(
  redis: SubjectFactsRedisClient,
  parse: (input: TRecord) => TRecord,
  options: CreateSubjectFactsRedisPublisherOptions,
) {
  const keyPrefix = options.keyPrefix ?? SUBJECT_FACTS_CACHE_KEY_PREFIX;

  async function publish(input: TRecord) {
    const record = parse(input);
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

  async function publishMany(records: TRecord[]) {
    const results = await Promise.all(records.map(publish));
    return results.reduce((summary, result) => {
      if (result.status === "published")
        summary.published += 1;
      else
        summary.retainedNewer += 1;
      return summary;
    }, { published: 0, retainedNewer: 0 });
  }

  return { publish, publishMany };
}
