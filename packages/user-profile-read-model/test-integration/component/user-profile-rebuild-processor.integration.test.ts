import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { UserProfileEmploymentIntegrityError } from "../../src/user-profile-builder.service";
import { CURRENT_USER_PROFILE_SCHEMA_VERSION } from "../../src/user-profile.schema";
import { createUserProfileRebuildProcessor } from "../../src/worker";

const now = new Date("2026-07-25T10:00:00.000Z");

function builtProfile(userId = 1) {
  return {
    userId,
    subjectIdentifier: "8af9666f-3e20-49ef-bd03-7ca7f5c51ed4",
    username: `user${userId}`,
    name: `User ${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
    sourceDirtyVersion: "4",
    detail: {} as never,
    searchDoc: {} as never,
    subjectFacts: { employments: [] },
    rebuiltAt: now,
  };
}

function createFixture(overrides: Record<string, unknown> = {}) {
  const observed: {
    failed?: unknown;
    publication?: unknown;
    warning?: unknown;
  } = {};
  const dirtyRepository = {
    claimForProcessing: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
    markFailed: mock(async (input: unknown) => {
      observed.failed = input;
      return { userId: 1, dirtyVersion: "4" };
    }),
  };
  const builder = {
    buildOne: mock(async (input: { userId: number }) => builtProfile(input.userId)),
  };
  const publicationRepository = {
    publishCandidate: mock(async (input: unknown) => {
      observed.publication = input;
      return { status: "published" as const };
    }),
  };
  const subjectFactsPublisher = {
    publish: mock(async () => ({ status: "published" as const })),
  };
  const logger = {
    warn: mock((data: unknown, message: string) => {
      observed.warning = { data, message };
    }),
  };
  const subjectAccessRepair = {
    repairSubject: mock(async () => ({ status: "enabled" as const })),
  };
  const processor = createUserProfileRebuildProcessor({
    dirtyRepository,
    builder,
    publicationRepository,
    subjectFactsPublisher,
    subjectAccessRepair,
    logger,
    clock: {
      nowDate: () => now,
    },
    ...overrides,
  } as never);

  return {
    builder: (overrides.builder ?? builder) as typeof builder,
    dirtyRepository: (overrides.dirtyRepository ?? dirtyRepository) as typeof dirtyRepository,
    observed,
    processor,
    publicationRepository: (overrides.publicationRepository ?? publicationRepository) as typeof publicationRepository,
    subjectFactsPublisher: (overrides.subjectFactsPublisher ?? subjectFactsPublisher) as typeof subjectFactsPublisher,
    subjectAccessRepair: (overrides.subjectAccessRepair ?? subjectAccessRepair) as typeof subjectAccessRepair,
  };
}

describe("UserProfileRebuildProcessor", () => {
  test("publishes the committed candidate to the Subject-level cache", async () => {
    let cachedRecord: unknown;
    const subjectFactsPublisher = {
      publish: mock(async (record: unknown) => {
        cachedRecord = record;
        return { status: "published" as const };
      }),
    };
    const fixture = createFixture({ subjectFactsPublisher });

    const result = await fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    });

    expect(result).toEqual({
      status: "rebuilt",
      userId: 1,
      dirtyVersion: "4",
      cacheStatus: "published",
    });
    expect(cachedRecord).toEqual({
      schemaVersion: 1,
      sourceDirtyVersion: "4",
      publishedAt: "2026-07-25T10:00:00.000Z",
      subjectIdentifier: "8af9666f-3e20-49ef-bd03-7ca7f5c51ed4",
      profile: {
        username: "user1",
        name: "User 1",
        phone: null,
      },
      facts: { employments: [] },
    });
    expect(fixture.subjectAccessRepair.repairSubject).toHaveBeenCalledWith(
      "8af9666f-3e20-49ef-bd03-7ca7f5c51ed4",
    );
  });

  test("keeps the committed PostgreSQL publication when the cache write fails", async () => {
    const subjectFactsPublisher = {
      publish: mock(async () => {
        throw new Error("redis unavailable");
      }),
    };
    const fixture = createFixture({ subjectFactsPublisher });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "rebuilt",
      userId: 1,
      dirtyVersion: "4",
      cacheStatus: "failed",
    });

    expect(fixture.observed.publication).toEqual({
      userId: 1,
      dirtyVersion: "4",
      profile: builtProfile(),
      processedAt: now,
    });
    expect(fixture.observed.failed).toBeUndefined();
    expect(fixture.observed.warning).toEqual({
      data: {
        userId: 1,
        dirtyVersion: "4",
        cacheStatus: "failed",
        errorType: "Error",
        errorCode: undefined,
      },
      message: "user profile Subject Facts cache publication failed",
    });
    expect(fixture.subjectAccessRepair.repairSubject).not.toHaveBeenCalled();
  });

  test("keeps a successful Facts publication when post-publication access repair fails", async () => {
    const subjectAccessRepair = {
      repairSubject: mock(async () => {
        throw new Error("redis://secret internal transition");
      }),
    };
    const fixture = createFixture({ subjectAccessRepair });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "rebuilt",
      userId: 1,
      dirtyVersion: "4",
      cacheStatus: "published",
    });

    expect(fixture.observed.failed).toBeUndefined();
    expect(fixture.observed.warning).toEqual({
      data: {
        userId: 1,
        operation: "subject_access_repair",
        errorType: "Error",
      },
      message: "user profile Subject Access repair failed",
    });
    expect(JSON.stringify(fixture.observed.warning)).not.toContain("redis://");
  });

  test("rebuilds and atomically publishes the current dirty version", async () => {
    const fixture = createFixture();

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    }, { jobId: "job-1" })).resolves.toEqual({
      status: "rebuilt",
      userId: 1,
      dirtyVersion: "4",
      cacheStatus: "published",
    });

    expect(fixture.observed.publication).toEqual({
      userId: 1,
      dirtyVersion: "4",
      profile: builtProfile(),
      processedAt: now,
    });
  });

  test("skips rebuild work when the dirty version can no longer be claimed", async () => {
    const dirtyRepository = {
      claimForProcessing: mock(async () => null),
      markFailed: mock(async () => null),
    };
    const builder = {
      buildOne: async () => {
        throw new Error("skipped rebuild must not build a candidate");
      },
    };
    const fixture = createFixture({ builder, dirtyRepository });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "skipped",
      userId: 1,
      dirtyVersion: "4",
    });
  });

  test("publishes a missing source user through the same atomic seam", async () => {
    const builder = {
      buildOne: mock(async () => null),
    };
    let publishedCandidate: unknown;
    const publicationRepository = {
      publishCandidate: mock(async (input: unknown) => {
        publishedCandidate = input;
        return { status: "missing" as const };
      }),
    };
    const fixture = createFixture({ builder, publicationRepository });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "missing",
      userId: 1,
      dirtyVersion: "4",
    });

    expect(publishedCandidate).toEqual({
      userId: 1,
      dirtyVersion: "4",
      profile: null,
      processedAt: now,
    });
  });

  test("returns stale when atomic publication rejects the candidate", async () => {
    const publicationRepository = {
      publishCandidate: mock(async () => ({ status: "stale" as const })),
    };
    const fixture = createFixture({ publicationRepository });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "stale",
      userId: 1,
      dirtyVersion: "4",
    });
  });

  test("retains the Dirty failure without publishing a partial profile when Employment integrity fails", async () => {
    const error = new UserProfileEmploymentIntegrityError(1, 10, "position-not-effective");
    const builder = {
      buildOne: mock(async () => {
        throw error;
      }),
    };
    const fixture = createFixture({ builder });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).rejects.toBe(error);

    expect(fixture.observed.failed).toEqual({
      userId: 1,
      dirtyVersion: "4",
      error: "User Profile Employment integrity failed: position-not-effective",
      failedAt: now,
    });
    expect(fixture.publicationRepository.publishCandidate).not.toHaveBeenCalled();
    expect(fixture.subjectFactsPublisher.publish).not.toHaveBeenCalled();
    expect(fixture.subjectAccessRepair.repairSubject).not.toHaveBeenCalled();
  });

  test("returns stale when failure recording loses its CAS", async () => {
    const error = new Error("builder failed");
    const builder = {
      buildOne: mock(async () => {
        throw error;
      }),
    };
    const dirtyRepository = {
      claimForProcessing: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
      markFailed: mock(async () => null),
    };
    const fixture = createFixture({ builder, dirtyRepository });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "stale",
      userId: 1,
      dirtyVersion: "4",
    });
  });
});
