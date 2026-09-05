import type { SubjectAccessRecordV1 } from "../model";
import {
  parseSubjectAccessRecord,
  serializeSubjectAccessRecord,
} from "../model";
import { SUBJECT_ACCESS_REDIS_KEY_PREFIX } from "../storage/redis-store";

const SEED_IF_ABSENT_SCRIPT = `-- subject-access:bootstrap-seed-if-absent
if redis.call("EXISTS", KEYS[1]) == 1 then
  return 0
end
redis.call("SET", KEYS[1], ARGV[1])
return 1
`;

export interface SubjectAccessBootstrapRedis {
  eval: (
    script: string,
    keyCount: number,
    key: string,
    value: string,
  ) => Promise<unknown>;
  mget: (...keys: string[]) => Promise<Array<string | null>>;
}

export interface CreateSubjectAccessBootstrapOptions {
  redis: SubjectAccessBootstrapRedis;
  random: {
    uuid: () => string;
  };
  keyPrefix?: string;
}

export function createSubjectAccessBootstrap(
  options: CreateSubjectAccessBootstrapOptions,
) {
  const recordPrefix = `${options.keyPrefix ?? SUBJECT_ACCESS_REDIS_KEY_PREFIX}record:`;

  async function seedMany(
    inputs: Array<{
      subjectIdentifier: string;
      state: "enabled" | "disabled";
    }>,
    seededAt: Date,
  ) {
    assertUniqueSubjects(inputs.map(input => input.subjectIdentifier));
    const results = await Promise.all(inputs.map(async (input) => {
      const record = serializeSubjectAccessRecord({
        version: 1,
        subjectIdentifier: input.subjectIdentifier,
        state: input.state,
        transitionId: options.random.uuid(),
        updatedAt: seededAt.toISOString(),
      });
      const result = Number(await options.redis.eval(
        SEED_IF_ABSENT_SCRIPT,
        1,
        `${recordPrefix}${input.subjectIdentifier}`,
        record,
      ));
      if (result !== 0 && result !== 1)
        throw new Error("Subject Access bootstrap returned an invalid result");
      return result;
    }));
    const seeded = results.filter(result => result === 1).length;
    return {
      seeded,
      retainedExisting: results.length - seeded,
    };
  }

  async function inspectMany(subjectIdentifiers: string[]): Promise<Array<
    | { status: "missing" | "invalid" }
    | { status: "valid"; record: SubjectAccessRecordV1 }
  >> {
    assertUniqueSubjects(subjectIdentifiers);
    if (subjectIdentifiers.length === 0)
      return [];
    const values = await options.redis.mget(
      ...subjectIdentifiers.map(subjectIdentifier => `${recordPrefix}${subjectIdentifier}`),
    );
    if (values.length !== subjectIdentifiers.length)
      throw new Error("Subject Access bootstrap batch read returned an invalid result");
    return values.map((value, index) => {
      if (value === null)
        return { status: "missing" as const };
      const parsed = parseSubjectAccessRecord(value);
      if (
        !parsed.success
        || parsed.data.subjectIdentifier !== subjectIdentifiers[index]
      ) {
        return { status: "invalid" as const };
      }
      return { status: "valid" as const, record: parsed.data };
    });
  }

  return { inspectMany, seedMany };
}

export type SubjectAccessBootstrap = ReturnType<typeof createSubjectAccessBootstrap>;

function assertUniqueSubjects(subjectIdentifiers: string[]) {
  if (new Set(subjectIdentifiers).size !== subjectIdentifiers.length)
    throw new Error("Subject Access bootstrap batch contains duplicate subjects");
}
