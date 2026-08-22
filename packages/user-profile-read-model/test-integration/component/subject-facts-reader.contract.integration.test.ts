import type { SubjectFactsCacheRecord } from "../../src/subject-facts";
import {
  createClientSubjectProjectionService,
  SubjectProjectionNotReadyError,
} from "@iam/client-subject-projection";
import { UserProfileDirtyStatus } from "@iam/contracts";
import { userProfileDirty, userProfiles } from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "../../src/subject-facts";

const SUBJECT_IDENTIFIER = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

describe("Subject Facts Reader", () => {
  test("reads and compare-and-set publishes through the Subject-level Redis adapter", async () => {
    const record = cacheRecord("6");
    const get = mock(async () => JSON.stringify(record));
    const evalScript = mock(async () => 1);
    const cache = createSubjectFactsRedisCache(
      { get, eval: evalScript },
      { keyPrefix: "facts:test:" },
    );

    await expect(cache.read(SUBJECT_IDENTIFIER)).resolves.toBe(JSON.stringify(record));
    await expect(cache.publish(record)).resolves.toEqual({ status: "published" });
    expect(get).toHaveBeenCalledWith(`facts:test:${SUBJECT_IDENTIFIER}`);
    expect(evalScript).toHaveBeenCalledTimes(1);
  });

  test("uses a schema-valid cached record without querying PostgreSQL", async () => {
    const select = mock(() => {
      throw new Error("a cache hit must not query PostgreSQL");
    });
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("7"))),
        publish,
      },
    });

    await expect(reader.read(SUBJECT_IDENTIFIER)).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "7",
      profile: {
        username: "alice",
        name: "Alice",
        phone: "13800138000",
      },
      employments: [],
    });
    expect(select).toHaveBeenCalledTimes(0);
    expect(publish).toHaveBeenCalledTimes(0);
  });

  test("observes a cache hit without exposing the Subject or Facts payload", async () => {
    const observations: unknown[] = [];
    const clockValues = [100, 107];
    const reader = createSubjectFactsReader({
      db: {
        select: () => {
          throw new Error("an observed cache hit must not query PostgreSQL");
        },
      } as never,
      cache: {
        read: async () => JSON.stringify(cacheRecord("7")),
        publish: async () => ({ status: "published" as const }),
      },
      clock: {
        now: () => clockValues.shift() ?? 107,
      },
      observability: {
        record: observation => observations.push(observation),
      },
    });

    await reader.read(SUBJECT_IDENTIFIER);

    expect(observations).toEqual([{
      operation: "cache-read",
      outcome: "hit",
      durationMs: 7,
    }]);
    expect(JSON.stringify(observations)).not.toContain(SUBJECT_IDENTIFIER);
    expect(JSON.stringify(observations)).not.toContain("alice");
  });

  test("observes a schema-valid record for another Subject as invalid before reloading", async () => {
    const observations: Array<{
      operation: string;
      outcome: string;
      durationMs: number;
    }> = [];
    const limit = mock(async () => [profileRow("8")]);
    const reader = createSubjectFactsReader({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({ limit }),
          }),
        }),
      } as never,
      cache: {
        read: async () => JSON.stringify({
          ...cacheRecord("7"),
          subjectIdentifier: "f81d4fae-7dec-4f9f-a847-76c5d8b55232",
        }),
        publish: async () => ({ status: "published" as const }),
      },
      clock: { now: () => 100 },
      observability: {
        record: observation => observations.push(observation),
      },
    });

    await reader.read(SUBJECT_IDENTIFIER);

    expect(observations).toEqual([
      { operation: "cache-read", outcome: "invalid", durationMs: 0 },
      { operation: "profile-load", outcome: "ready", durationMs: 0 },
    ]);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test("reloads one narrow user_profile row when the cached record is corrupt", async () => {
    const limit = mock(async () => [profileRow("8")]);
    const where = mock(() => ({ limit }));
    const from = mock((table: unknown) => {
      expect(table).toBe(userProfiles);
      return { where };
    });
    const select = mock((columns: Record<string, unknown>) => {
      expect(Object.keys(columns)).toEqual([
        "subjectIdentifier",
        "username",
        "name",
        "mobile",
        "profileSchemaVersion",
        "sourceDirtyVersion",
        "subjectFacts",
        "rebuiltAt",
      ]);
      expect(columns).not.toHaveProperty("detail");
      expect(columns).not.toHaveProperty("searchDoc");
      return { from };
    });
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => "{not-json"),
        publish,
      },
    });

    await expect(reader.read(SUBJECT_IDENTIFIER)).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "8",
      profile: {
        username: "alice",
        name: "Alice",
        phone: "13800138000",
      },
      employments: [],
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
    expect(publish).toHaveBeenCalledWith(cacheRecord("8"));
  });

  test("single-flights concurrent cache misses into one user_profile row query and one CAS refill", async () => {
    const limit = mock(async () => {
      await Promise.resolve();
      return [profileRow("9")];
    });
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => null),
        publish,
      },
    });

    const snapshots = await Promise.all(
      Array.from({ length: 16 }, () => reader.read(SUBJECT_IDENTIFIER)),
    );

    expect(snapshots).toEqual(Array.from({ length: 16 }, () => ({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "9",
      profile: {
        username: "alice",
        name: "Alice",
        phone: "13800138000",
      },
      employments: [],
    })));
    expect(select).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  test("observes one profile query and the joined single-flight wait for concurrent misses", async () => {
    const observations: Array<{
      operation: string;
      outcome: string;
      durationMs: number;
    }> = [];
    const limit = mock(async () => [profileRow("9")]);
    const reader = createSubjectFactsReader({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({ limit }),
          }),
        }),
      } as never,
      cache: {
        read: async () => null,
        publish: async () => ({ status: "published" as const }),
      },
      clock: { now: () => 200 },
      observability: {
        record: observation => observations.push(observation),
      },
    });

    await Promise.all([
      reader.read(SUBJECT_IDENTIFIER),
      reader.read(SUBJECT_IDENTIFIER),
    ]);

    expect(observations.filter(({ operation }) => operation === "cache-read")).toEqual([
      { operation: "cache-read", outcome: "miss", durationMs: 0 },
      { operation: "cache-read", outcome: "miss", durationMs: 0 },
    ]);
    expect(observations.filter(({ operation }) => operation === "profile-load")).toEqual([
      { operation: "profile-load", outcome: "ready", durationMs: 0 },
    ]);
    expect(observations.filter(({ operation }) => operation === "single-flight-wait")).toEqual([
      { operation: "single-flight-wait", outcome: "joined", durationMs: 0 },
    ]);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["missing row", []],
    ["invalid source version", [{ ...profileRow("10"), sourceDirtyVersion: "0" }]],
    ["invalid Subject Facts", [{ ...profileRow("10"), subjectFacts: { employments: "legacy" } }]],
  ])("maps an unknown-schema cache and %s to stable Projection Not Ready", async (_, rows) => {
    const limit = mock(async () => rows);
    const reader = createSubjectFactsReader({
      db: {
        select: mock(() => ({
          from: mock(() => ({
            where: mock(() => ({ limit })),
          })),
        })),
      } as never,
      cache: {
        read: mock(async () => JSON.stringify({
          ...cacheRecord("10"),
          schemaVersion: 999,
        })),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: {
        check: async () => {
          throw new Error("profile-only projection must not check Dirty freshness");
        },
      },
    });

    const result = projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name"],
      },
    });

    await expect(result).rejects.toBeInstanceOf(SubjectProjectionNotReadyError);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test("allows authorization only after one authoritative processed Dirty query matches the cached version", async () => {
    const limit = mock(async () => [{
      dirtyVersion: "11",
      status: UserProfileDirtyStatus.Processed,
    }]);
    const where = mock(() => ({ limit }));
    const innerJoin = mock((table: unknown) => {
      expect(table).toBe(userProfiles);
      return { where };
    });
    const from = mock((table: unknown) => {
      expect(table).toBe(userProfileDirty);
      return { innerJoin };
    });
    const select = mock((columns: Record<string, unknown>) => {
      expect(Object.keys(columns)).toEqual(["dirtyVersion", "status"]);
      expect(columns).not.toHaveProperty("reasonCodes");
      return { from };
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: reader,
    });

    await expect(projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["iam:authorization"],
      },
    })).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    });
    expect(select).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(1);
  });

  test("observes the authoritative Dirty query and freshness outcome", async () => {
    const observations: Array<{
      operation: string;
      outcome: string;
      durationMs: number;
    }> = [];
    const reader = createSubjectFactsReader({
      db: {
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [{
                  dirtyVersion: "11",
                  status: UserProfileDirtyStatus.Processed,
                }],
              }),
            }),
          }),
        }),
      } as never,
      cache: {
        read: async () => JSON.stringify(cacheRecord("11")),
        publish: async () => ({ status: "published" as const }),
      },
      clock: { now: () => 300 },
      observability: {
        record: observation => observations.push(observation),
      },
    });

    await expect(reader.check({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "11",
    })).resolves.toEqual({ status: "fresh" });

    expect(observations).toEqual([
      { operation: "dirty-load", outcome: "ready", durationMs: 0 },
      { operation: "authorization-freshness", outcome: "fresh", durationMs: 0 },
    ]);
  });

  test("observes authorization freshness failure when the required Profile reload fails", async () => {
    const profileError = new Error("profile reload unavailable");
    const observations: Array<{
      operation: string;
      outcome: string;
      durationMs: number;
    }> = [];
    const select = mock((columns: Record<string, unknown>) => {
      if ("dirtyVersion" in columns) {
        return {
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                limit: async () => [{
                  dirtyVersion: "12",
                  status: UserProfileDirtyStatus.Processed,
                }],
              }),
            }),
          }),
        };
      }
      return {
        from: () => ({
          where: () => ({
            limit: async () => {
              throw profileError;
            },
          }),
        }),
      };
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: async () => JSON.stringify(cacheRecord("11")),
        publish: async () => ({ status: "published" as const }),
      },
      clock: { now: () => 400 },
      observability: {
        record: observation => observations.push(observation),
      },
    });

    await expect(reader.check({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      sourceDirtyVersion: "11",
    })).rejects.toBe(profileError);

    expect(observations).toEqual([
      { operation: "dirty-load", outcome: "ready", durationMs: 0 },
      { operation: "profile-load", outcome: "error", durationMs: 0 },
      { operation: "authorization-freshness", outcome: "error", durationMs: 0 },
    ]);
  });

  test.each([
    ["missing", []],
    ["pending", [{ dirtyVersion: "11", status: UserProfileDirtyStatus.Pending }]],
    ["processing", [{ dirtyVersion: "11", status: UserProfileDirtyStatus.Processing }]],
    ["failed", [{ dirtyVersion: "11", status: UserProfileDirtyStatus.Failed }]],
    ["invalid version", [{ dirtyVersion: "0", status: UserProfileDirtyStatus.Processed }]],
  ])("fails the whole authorization projection for %s authoritative Dirty state", async (_, rows) => {
    const limit = mock(async () => rows);
    const select = mock(() => ({
      from: mock(() => ({
        innerJoin: mock(() => ({
          where: mock(() => ({ limit })),
        })),
      })),
    }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: reader,
    });

    const result = projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name", "iam:authorization"],
      },
      allowStaleAuthorization: true,
      dirtyReason: "user-updated",
    } as never);

    await expect(result).rejects.toBeInstanceOf(SubjectProjectionNotReadyError);
    expect(select).toHaveBeenCalledTimes(1);
  });

  test("reloads user_profile once and assembles the whole projection from the current processed version", async () => {
    const dirtyLimit = mock(async () => [{
      dirtyVersion: "12",
      status: UserProfileDirtyStatus.Processed,
    }]);
    const profileLimit = mock(async () => [{
      ...profileRow("12"),
      name: "Current Alice",
    }]);
    const select = mock((columns: Record<string, unknown>) => {
      if ("dirtyVersion" in columns) {
        return {
          from: mock(() => ({
            innerJoin: mock(() => ({
              where: mock(() => ({ limit: dirtyLimit })),
            })),
          })),
        };
      }
      return {
        from: mock(() => ({
          where: mock(() => ({ limit: profileLimit })),
        })),
      };
    });
    const publish = mock(async () => ({ status: "published" as const }));
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish,
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: reader,
    });

    await expect(projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name", "iam:authorization"],
      },
    })).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      name: "Current Alice",
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    });
    expect(dirtyLimit).toHaveBeenCalledTimes(1);
    expect(profileLimit).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      ...cacheRecord("12"),
      profile: {
        ...cacheRecord("12").profile,
        name: "Current Alice",
      },
    });
  });

  test("allows the last successful Facts for ordinary Profile claims without reading Dirty state", async () => {
    const select = mock(() => {
      throw new Error("ordinary Profile claims must not query authoritative Dirty state");
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: reader,
    });

    await expect(projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name"],
      },
    })).resolves.toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      name: "Alice",
    });
    expect(select).toHaveBeenCalledTimes(0);
  });

  test("fails without a partial Profile when the processed Dirty version is still unpublished", async () => {
    const dirtyLimit = mock(async () => [{
      dirtyVersion: "12",
      status: UserProfileDirtyStatus.Processed,
    }]);
    const profileLimit = mock(async () => [profileRow("11")]);
    const select = mock((columns: Record<string, unknown>) => {
      if ("dirtyVersion" in columns) {
        return {
          from: mock(() => ({
            innerJoin: mock(() => ({
              where: mock(() => ({ limit: dirtyLimit })),
            })),
          })),
        };
      }
      return {
        from: mock(() => ({
          where: mock(() => ({ limit: profileLimit })),
        })),
      };
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createClientSubjectProjectionService({
      subjectAccess: {
        assertAccessible: async () => {},
      },
      subjectFacts: reader,
      authorizationFreshness: reader,
    });

    const result = projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["profile:name", "iam:authorization"],
      },
    });

    await expect(result).rejects.toBeInstanceOf(SubjectProjectionNotReadyError);
    expect(dirtyLimit).toHaveBeenCalledTimes(1);
    expect(profileLimit).toHaveBeenCalledTimes(1);
  });
});

function cacheRecord(sourceDirtyVersion: string): SubjectFactsCacheRecord {
  return {
    schemaVersion: 3,
    sourceDirtyVersion,
    publishedAt: "2026-07-25T10:00:00.000Z",
    subjectIdentifier: SUBJECT_IDENTIFIER,
    profile: {
      username: "alice",
      name: "Alice",
      phone: "13800138000",
    },
    facts: {
      employments: [],
    },
  };
}

function profileRow(sourceDirtyVersion: string) {
  return {
    subjectIdentifier: SUBJECT_IDENTIFIER,
    username: "alice",
    name: "Alice",
    mobile: "13800138000",
    profileSchemaVersion: 3,
    sourceDirtyVersion,
    subjectFacts: {
      employments: [],
    },
    rebuiltAt: new Date("2026-07-25T10:00:00.000Z"),
  };
}
