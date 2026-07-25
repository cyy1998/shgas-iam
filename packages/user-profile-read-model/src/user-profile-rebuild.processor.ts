import type { RebuildUserProfileJobPayload, UserStatus } from "@iam/contracts";
import type { UserDetailDto, UserProfileSearchDoc } from "./user-profile.schema";

export interface UserProfileRebuildProjection {
  userId: number;
  username: string;
  mobile: string | null;
  wxId: string | null;
  status: UserStatus;
  isDelete: boolean;
  searchVisible: boolean;
  profileSchemaVersion: number;
  detail: UserDetailDto;
  searchDoc: UserProfileSearchDoc;
  rebuiltAt: Date;
}

export interface UserProfileRebuildProfileStorePort {
  upsertProfile: (input: UserProfileRebuildProjection) => Promise<unknown>;
  deleteByUserId: (userId: number) => Promise<unknown>;
}

export interface UserProfileRebuildDirtyStorePort {
  claimForProcessing: (input: {
    userId: number;
    dirtyVersion: string;
    now: Date;
    jobId?: string;
  }) => Promise<unknown | null>;
  markProcessed: (input: {
    userId: number;
    dirtyVersion: string;
    processedAt: Date;
  }) => Promise<unknown | null>;
  markFailed: (input: {
    userId: number;
    dirtyVersion: string;
    error: string;
    failedAt: Date;
  }) => Promise<unknown | null>;
}

export interface UserProfileRebuildBuilderPort {
  buildOne: (userId: number) => Promise<UserProfileRebuildProjection | null>;
}

export interface CreateUserProfileRebuildProcessorDeps {
  profileRepository: UserProfileRebuildProfileStorePort;
  dirtyRepository: UserProfileRebuildDirtyStorePort;
  builder: UserProfileRebuildBuilderPort;
  clock: {
    nowDate: () => Date;
  };
}

export function createUserProfileRebuildProcessor(deps: CreateUserProfileRebuildProcessorDeps) {
  return {
    async process(
      payload: RebuildUserProfileJobPayload,
      options: { jobId?: string } = {},
    ) {
      const claimed = await deps.dirtyRepository.claimForProcessing({
        userId: payload.userId,
        dirtyVersion: payload.dirtyVersion,
        now: deps.clock.nowDate(),
        jobId: options.jobId,
      });
      if (claimed === null) {
        return { status: "skipped" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
      }

      try {
        const builtProfile = await deps.builder.buildOne(payload.userId);
        if (builtProfile !== null) {
          await deps.profileRepository.upsertProfile(builtProfile);
        }
        else {
          await deps.profileRepository.deleteByUserId(payload.userId);
        }
        const processed = await deps.dirtyRepository.markProcessed({
          userId: payload.userId,
          dirtyVersion: payload.dirtyVersion,
          processedAt: deps.clock.nowDate(),
        });
        if (processed === null) {
          return { status: "stale" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
        }
        return {
          status: builtProfile === null ? "missing" as const : "rebuilt" as const,
          userId: payload.userId,
          dirtyVersion: payload.dirtyVersion,
        };
      }
      catch (error) {
        const failed = await deps.dirtyRepository.markFailed({
          userId: payload.userId,
          dirtyVersion: payload.dirtyVersion,
          error: errorMessage(error),
          failedAt: deps.clock.nowDate(),
        });
        if (failed === null) {
          return { status: "stale" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
        }
        throw error;
      }
    },
  };
}

export type UserProfileRebuildProcessor = ReturnType<typeof createUserProfileRebuildProcessor>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
