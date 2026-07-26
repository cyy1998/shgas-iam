import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { CURRENT_USER_PROFILE_SCHEMA_VERSION } from "../user-profile.schema";
import { createUserProfileRebuildProcessor } from "../worker";

const now = new Date("2026-07-25T10:00:00.000Z");

function builtProfile(userId = 1) {
  return {
    userId,
    username: `user${userId}`,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: CURRENT_USER_PROFILE_SCHEMA_VERSION,
    detail: {} as never,
    searchDoc: {} as never,
    rebuiltAt: now,
  };
}

function createFixture(overrides: Record<string, unknown> = {}) {
  const dirtyRepository = {
    claimForProcessing: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
    markProcessed: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
    markFailed: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
  };
  const profileRepository = {
    upsertProfile: mock(async () => builtProfile()),
    deleteByUserId: mock(async () => null),
  };
  const builder = {
    buildOne: mock(async (userId: number) => builtProfile(userId)),
  };
  const processor = createUserProfileRebuildProcessor({
    dirtyRepository,
    profileRepository,
    builder,
    clock: {
      nowDate: () => now,
    },
    ...overrides,
  } as never);

  return {
    builder: (overrides.builder ?? builder) as typeof builder,
    dirtyRepository: (overrides.dirtyRepository ?? dirtyRepository) as typeof dirtyRepository,
    processor,
    profileRepository: (overrides.profileRepository ?? profileRepository) as typeof profileRepository,
  };
}

describe("UserProfileRebuildProcessor", () => {
  test("claims, rebuilds, persists, and completes the current dirty version", async () => {
    const fixture = createFixture();

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    }, { jobId: "job-1" })).resolves.toEqual({
      status: "rebuilt",
      userId: 1,
      dirtyVersion: "4",
    });

    expect(fixture.dirtyRepository.claimForProcessing).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      now,
      jobId: "job-1",
    });
    expect(fixture.profileRepository.upsertProfile).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 1 }),
    );
    expect(fixture.dirtyRepository.markProcessed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      processedAt: now,
    });
  });

  test("skips rebuild work when the dirty version can no longer be claimed", async () => {
    const dirtyRepository = {
      claimForProcessing: mock(async () => null),
      markProcessed: mock(async () => null),
      markFailed: mock(async () => null),
    };
    const fixture = createFixture({ dirtyRepository });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "skipped",
      userId: 1,
      dirtyVersion: "4",
    });

    expect(fixture.builder.buildOne).not.toHaveBeenCalled();
    expect(fixture.profileRepository.upsertProfile).not.toHaveBeenCalled();
  });

  test("deletes the projected profile when the source user no longer exists", async () => {
    const builder = {
      buildOne: mock(async () => null),
    };
    const fixture = createFixture({ builder });

    await expect(fixture.processor.process({
      userId: 1,
      dirtyVersion: "4",
      reason: UserProfileDirtyReason.UserUpdated,
    })).resolves.toEqual({
      status: "missing",
      userId: 1,
      dirtyVersion: "4",
    });

    expect(fixture.profileRepository.deleteByUserId).toHaveBeenCalledWith(1);
    expect(fixture.dirtyRepository.markProcessed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      processedAt: now,
    });
  });

  test("returns stale when the processed-state CAS loses to a newer dirty version", async () => {
    const dirtyRepository = {
      claimForProcessing: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
      markProcessed: mock(async () => null),
      markFailed: mock(async () => ({ userId: 1, dirtyVersion: "4" })),
    };
    const fixture = createFixture({ dirtyRepository });

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

  test("records a builder failure against the claimed dirty version", async () => {
    const error = new Error("builder failed");
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

    expect(fixture.dirtyRepository.markFailed).toHaveBeenCalledWith({
      userId: 1,
      dirtyVersion: "4",
      error: "builder failed",
      failedAt: now,
    });
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
      markProcessed: mock(async () => null),
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
