import type { ResolveClientSubjectInput } from "@iam/client-subject-projection";
import type { SubjectFactsCacheRecord } from "../../src/subject-facts";
import { createSubjectAccessOperations, SubjectAccessPermissionRequiredError } from "@iam/api-core/subject-access";
import {
  createPermittedClientSubjectProjectionService,
  SubjectProjectionNotReadyError,
} from "@iam/client-subject-projection";
import { userProfiles } from "@iam/db/schema";
import { describe, expect, mock, test } from "bun:test";
import {
  createSubjectFactsReader,
  createSubjectFactsRedisCache,
} from "../../src/subject-facts";

const SUBJECT_IDENTIFIER = "46739d0b-cdda-48f5-af1f-1f90e2d81169";

function createPermittedProjectionFixture(
  options: Omit<Parameters<typeof createPermittedClientSubjectProjectionService>[0], "assertPermission">,
) {
  const operations = createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId(subjectIdentifier) {
        if (subjectIdentifier !== SUBJECT_IDENTIFIER)
          throw new Error("unexpected subject in projection fixture");
        return "00000000-0000-4000-8000-000000000001";
      },
    },
    revocation: {
      async revokePrincipalSession() { throw new Error("unexpected root revocation"); },
      async revokeUserSessions() { throw new Error("unexpected subject revocation"); },
    },
  });
  return {
    async resolve(input: ResolveClientSubjectInput) {
      return await operations.run(async (operation) => {
        const permission = await operation.acquireForAuthentication(input.subjectIdentifier);
        const projection = createPermittedClientSubjectProjectionService({
          ...options,
          assertPermission(value, subjectIdentifier) {
            if (operation.requirePermission(subjectIdentifier) !== value)
              throw new SubjectAccessPermissionRequiredError();
          },
        });
        return await projection.resolve(input, permission);
      });
    },
  };
}

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
    const projection = createPermittedProjectionFixture({
      subjectFacts: reader,
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
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test("delivers published authorization from a cache hit without PostgreSQL", async () => {
    const select = mock(() => {
      throw new Error("cached authorization must not require PostgreSQL");
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: mock(async () => JSON.stringify(cacheRecord("11"))),
        publish: mock(async () => ({ status: "published" as const })),
      },
    });
    const projection = createPermittedProjectionFixture({
      subjectFacts: reader,
    });

    const result = await projection.resolve({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      clientCode: "console",
      selection: {
        catalogVersion: 2,
        optionalClaims: ["iam:authorization"],
      },
    });
    expect(result).toEqual({
      subjectIdentifier: SUBJECT_IDENTIFIER,
      authorization: {
        employments: [],
        roles: [],
        privileges: [],
      },
    });
    expect(select).not.toHaveBeenCalled();
  });

  test.each([null, "{broken", JSON.stringify({ ...cacheRecord("8"), schemaVersion: 999 })])(
    "delivers the published database authorization when cache is unusable (%s) even if refill fails",
    async (cached) => {
      const limit = mock(async () => [profileRow("8")]);
      const reader = createSubjectFactsReader({
        db: { select: () => ({ from: () => ({ where: () => ({ limit }) }) }) } as never,
        cache: {
          read: async () => cached,
          publish: async () => { throw new Error("refill failed"); },
        },
      });
      const projection = createPermittedProjectionFixture({ subjectFacts: reader });
      const result = await projection.resolve({
        subjectIdentifier: SUBJECT_IDENTIFIER,
        clientCode: "console",
        selection: { catalogVersion: 2, optionalClaims: ["profile:name", "iam:authorization"] },
      });
      expect(result).toEqual({
        subjectIdentifier: SUBJECT_IDENTIFIER,
        name: "Alice",
        authorization: { employments: [], roles: [], privileges: [] },
      });
      expect(limit).toHaveBeenCalledTimes(1);
    },
  );

  test("does not fall back to PostgreSQL on a Redis read error", async () => {
    const cacheError = new Error("Redis unavailable");
    const select = mock(() => {
      throw new Error("unexpected database fallback");
    });
    const reader = createSubjectFactsReader({
      db: { select } as never,
      cache: {
        read: async () => { throw cacheError; },
        publish: async () => ({ status: "published" }),
      },
    });
    let failure: unknown;
    try {
      await reader.read(SUBJECT_IDENTIFIER);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBe(cacheError);
    expect(select).not.toHaveBeenCalled();
  });

  test("preserves a database read error and its observation on cache miss", async () => {
    const databaseError = new Error("PostgreSQL unavailable");
    const observations: unknown[] = [];
    const reader = createSubjectFactsReader({
      db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => { throw databaseError; } }) }) }) } as never,
      cache: { read: async () => null, publish: async () => ({ status: "published" }) },
      clock: { now: () => 100 },
      observability: { record: observation => observations.push(observation) },
    });
    let failure: unknown;
    try {
      await reader.read(SUBJECT_IDENTIFIER);
    }
    catch (error) {
      failure = error;
    }
    expect(failure).toBe(databaseError);
    expect(observations).toEqual([
      { operation: "cache-read", outcome: "miss", durationMs: 0 },
      { operation: "profile-load", outcome: "error", durationMs: 0 },
    ]);
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
