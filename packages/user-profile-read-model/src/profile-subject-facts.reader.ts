import type {
  AuthorizationFreshnessCheckResult,
  SubjectFactsSnapshot,
} from "@iam/client-subject-projection";
import type { DbClient } from "@iam/db";
import type { SubjectFactsCacheRecord } from "./profile-cache";
import type {
  SubjectFactsReaderObservabilityPort,
  SubjectFactsReaderObservation,
} from "./subject-facts-observability.contract";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { userProfileDirty, userProfiles } from "@iam/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { SubjectFactsCacheRecordSchema } from "./profile-cache";
import {
  ProfileSubjectFactsDocumentSchema,
  USER_PROFILE_SCHEMA_VERSION,
} from "./profile.schema";

const SubjectFactsProfileRowSchema = z.object({
  subjectIdentifier: z.uuid(),
  username: z.string().min(1),
  name: z.string().min(1),
  mobile: z.string().nullable(),
  profileSchemaVersion: z.literal(
    USER_PROFILE_SCHEMA_VERSION,
  ),
  sourceDirtyVersion: z.string().regex(/^[1-9]\d*$/u),
  subjectFacts: ProfileSubjectFactsDocumentSchema,
  rebuiltAt: z.date(),
}).strict();

export interface SubjectFactsReaderCachePort {
  readonly read: (subjectIdentifier: string) => Promise<string | null>;
  readonly publish: (
    record: SubjectFactsCacheRecord,
  ) => Promise<{ readonly status: "published" | "retained-newer" }>;
}

export interface CreateSubjectFactsReaderOptions {
  readonly db: DbClient;
  readonly cache: SubjectFactsReaderCachePort;
  readonly clock?: { readonly now: () => number };
  readonly observability?: SubjectFactsReaderObservabilityPort;
}

export function createSubjectFactsReader(
  options: CreateSubjectFactsReaderOptions,
) {
  const profileLoads = new Map<
    string,
    Promise<SubjectFactsCacheRecord | null>
  >();
  const now = options.clock?.now ?? Date.now;

  function loadProfileSingleFlight(subjectIdentifier: string) {
    const existing = profileLoads.get(subjectIdentifier);
    if (existing !== undefined) {
      const waitStartedAt = now();
      return existing.finally(() => recordObservation(options.observability, {
        operation: "single-flight-wait",
        outcome: "joined",
        durationMs: elapsedMilliseconds(waitStartedAt, now()),
      }));
    }

    const profileLoadStartedAt = now();
    const load = loadProfileRecord(options.db, subjectIdentifier)
      .then(async (record) => {
        recordObservation(options.observability, {
          operation: "profile-load",
          outcome: record === null ? "not-ready" : "ready",
          durationMs: elapsedMilliseconds(profileLoadStartedAt, now()),
        });
        if (record !== null)
          await options.cache.publish(record).catch(() => undefined);
        return record;
      }, (error) => {
        recordObservation(options.observability, {
          operation: "profile-load",
          outcome: "error",
          durationMs: elapsedMilliseconds(profileLoadStartedAt, now()),
        });
        throw error;
      })
      .finally(() => {
        if (profileLoads.get(subjectIdentifier) === load)
          profileLoads.delete(subjectIdentifier);
      });
    profileLoads.set(subjectIdentifier, load);
    return load;
  }

  return {
    async read(
      subjectIdentifier: string,
    ): Promise<SubjectFactsSnapshot | null> {
      const cacheReadStartedAt = now();
      const serialized = await options.cache.read(subjectIdentifier);
      const cached = parseCachedRecord(serialized);
      const cacheMatchesSubject
        = cached !== null && cached.subjectIdentifier === subjectIdentifier;
      recordObservation(options.observability, {
        operation: "cache-read",
        outcome: cached === null
          ? (serialized === null ? "miss" : "invalid")
          : (cacheMatchesSubject ? "hit" : "invalid"),
        durationMs: elapsedMilliseconds(cacheReadStartedAt, now()),
      });
      if (cacheMatchesSubject)
        return toSubjectFactsSnapshot(cached);

      const record = await loadProfileSingleFlight(subjectIdentifier);
      if (record === null)
        return null;
      return toSubjectFactsSnapshot(record);
    },
    async check(input: {
      readonly subjectIdentifier: string;
      readonly sourceDirtyVersion: string;
    }): Promise<AuthorizationFreshnessCheckResult> {
      const freshnessStartedAt = now();
      const dirtyLoadStartedAt = now();
      let dirty: Awaited<ReturnType<typeof loadAuthoritativeDirty>>;
      try {
        dirty = await loadAuthoritativeDirty(options.db, input.subjectIdentifier);
        recordObservation(options.observability, {
          operation: "dirty-load",
          outcome: dirty === null ? "missing" : "ready",
          durationMs: elapsedMilliseconds(dirtyLoadStartedAt, now()),
        });
      }
      catch (error) {
        recordObservation(options.observability, {
          operation: "dirty-load",
          outcome: "error",
          durationMs: elapsedMilliseconds(dirtyLoadStartedAt, now()),
        });
        recordObservation(options.observability, {
          operation: "authorization-freshness",
          outcome: "error",
          durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
        });
        throw error;
      }
      if (
        dirty === null
        || dirty.status !== UserProfileDirtyStatus.Processed
        || !isDirtyVersion(dirty.dirtyVersion)
      ) {
        recordObservation(options.observability, {
          operation: "authorization-freshness",
          outcome: "not-ready",
          durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
        });
        return { status: "not-ready" };
      }
      if (dirty.dirtyVersion === input.sourceDirtyVersion) {
        recordObservation(options.observability, {
          operation: "authorization-freshness",
          outcome: "fresh",
          durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
        });
        return { status: "fresh" };
      }

      let reloaded: Awaited<ReturnType<typeof loadProfileSingleFlight>>;
      try {
        reloaded = await loadProfileSingleFlight(input.subjectIdentifier);
      }
      catch (error) {
        recordObservation(options.observability, {
          operation: "authorization-freshness",
          outcome: "error",
          durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
        });
        throw error;
      }
      if (
        reloaded === null
        || reloaded.sourceDirtyVersion !== dirty.dirtyVersion
      ) {
        recordObservation(options.observability, {
          operation: "authorization-freshness",
          outcome: "not-ready",
          durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
        });
        return { status: "not-ready" };
      }
      recordObservation(options.observability, {
        operation: "authorization-freshness",
        outcome: "refreshed",
        durationMs: elapsedMilliseconds(freshnessStartedAt, now()),
      });
      return {
        status: "refreshed",
        facts: toSubjectFactsSnapshot(reloaded),
      };
    },
  };
}

function recordObservation(
  observability: SubjectFactsReaderObservabilityPort | undefined,
  observation: SubjectFactsReaderObservation,
) {
  try {
    observability?.record(observation);
  }
  catch {
    // Observability must not change the Subject Facts read result.
  }
}

function elapsedMilliseconds(startedAt: number, completedAt: number) {
  return Math.max(0, completedAt - startedAt);
}

async function loadProfileRecord(
  db: DbClient,
  subjectIdentifier: string,
): Promise<SubjectFactsCacheRecord | null> {
  const rows = await db
    .select({
      subjectIdentifier: userProfiles.subjectIdentifier,
      username: userProfiles.username,
      name: userProfiles.name,
      mobile: userProfiles.mobile,
      profileSchemaVersion: userProfiles.profileSchemaVersion,
      sourceDirtyVersion: userProfiles.sourceDirtyVersion,
      subjectFacts: userProfiles.subjectFacts,
      rebuiltAt: userProfiles.rebuiltAt,
    })
    .from(userProfiles)
    .where(eq(userProfiles.subjectIdentifier, subjectIdentifier))
    .limit(1);
  const parsed = SubjectFactsProfileRowSchema.safeParse(rows[0]);
  if (!parsed.success || parsed.data.subjectIdentifier !== subjectIdentifier)
    return null;

  return SubjectFactsCacheRecordSchema.parse({
    schemaVersion: parsed.data.profileSchemaVersion,
    sourceDirtyVersion: parsed.data.sourceDirtyVersion,
    publishedAt: parsed.data.rebuiltAt.toISOString(),
    subjectIdentifier: parsed.data.subjectIdentifier,
    profile: {
      username: parsed.data.username,
      name: parsed.data.name,
      phone: parsed.data.mobile,
    },
    facts: parsed.data.subjectFacts,
  });
}

async function loadAuthoritativeDirty(
  db: DbClient,
  subjectIdentifier: string,
) {
  const rows = await db
    .select({
      dirtyVersion: userProfileDirty.dirtyVersion,
      status: userProfileDirty.status,
    })
    .from(userProfileDirty)
    .innerJoin(userProfiles, eq(userProfileDirty.userId, userProfiles.userId))
    .where(eq(userProfiles.subjectIdentifier, subjectIdentifier))
    .limit(1);
  return rows[0] ?? null;
}

function parseCachedRecord(input: string | null) {
  if (input === null)
    return null;

  try {
    const parsed = SubjectFactsCacheRecordSchema.safeParse(
      JSON.parse(input),
    );
    return parsed.success ? parsed.data : null;
  }
  catch {
    return null;
  }
}

function toSubjectFactsSnapshot(
  record: SubjectFactsCacheRecord,
): SubjectFactsSnapshot {
  return {
    subjectIdentifier: record.subjectIdentifier,
    sourceDirtyVersion: record.sourceDirtyVersion,
    profile: record.profile,
    employments: record.facts.employments,
  };
}

function isDirtyVersion(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d*$/u.test(value);
}
