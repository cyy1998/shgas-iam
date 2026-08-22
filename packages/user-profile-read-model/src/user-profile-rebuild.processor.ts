import type { RebuildUserProfileJobPayload } from "@iam/contracts";
import type { SubjectFactsCacheRecord } from "./profile-cache";
import type { PublishedProfile } from "./profile.schema";
import { createSubjectFactsCacheRecord } from "./profile-cache";

export type UserProfileRebuildProjection = PublishedProfile;

export interface UserProfilePublicationPort {
  publishCandidate: (input: {
    userId: number;
    dirtyVersion: string;
    profile: UserProfileRebuildProjection | null;
    processedAt: Date;
  }) => Promise<
    | { status: "published" }
    | { status: "missing" }
    | { status: "stale" }
  >;
}

export interface SubjectFactsPublisherPort {
  publish: (record: SubjectFactsCacheRecord) => Promise<{
    status: "published" | "retained-newer";
  }>;
}

export interface UserProfileRebuildDirtyStorePort {
  claimForProcessing: (input: {
    userId: number;
    dirtyVersion: string;
    now: Date;
    jobId?: string;
  }) => Promise<unknown | null>;
  markFailed: (input: {
    userId: number;
    dirtyVersion: string;
    error: string;
    failedAt: Date;
  }) => Promise<unknown | null>;
}

export interface UserProfileRebuildBuilderPort {
  buildOne: (input: {
    userId: number;
    sourceDirtyVersion: string;
  }) => Promise<UserProfileRebuildProjection | null>;
}

export interface UserProfileRebuildLoggerPort {
  warn: (data: Record<string, unknown>, message: string) => void;
}

export interface SubjectAccessRepairPort {
  repairSubject: (subjectIdentifier: string) => Promise<unknown>;
}

export interface CreateUserProfileRebuildProcessorDeps {
  dirtyRepository: UserProfileRebuildDirtyStorePort;
  builder: UserProfileRebuildBuilderPort;
  publicationRepository: UserProfilePublicationPort;
  subjectFactsPublisher: SubjectFactsPublisherPort;
  subjectAccessRepair: SubjectAccessRepairPort;
  logger: UserProfileRebuildLoggerPort;
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
        const builtProfile = await deps.builder.buildOne({
          userId: payload.userId,
          sourceDirtyVersion: payload.dirtyVersion,
        });
        const processedAt = deps.clock.nowDate();
        const cacheRecord = builtProfile === null
          ? null
          : createSubjectFactsCacheRecord(builtProfile, processedAt);
        const publication = await deps.publicationRepository.publishCandidate({
          userId: payload.userId,
          dirtyVersion: payload.dirtyVersion,
          profile: builtProfile,
          processedAt,
        });
        if (publication.status === "stale") {
          return { status: "stale" as const, userId: payload.userId, dirtyVersion: payload.dirtyVersion };
        }
        if (publication.status === "missing" || cacheRecord === null) {
          return {
            status: "missing" as const,
            userId: payload.userId,
            dirtyVersion: payload.dirtyVersion,
          };
        }

        const cacheStatus = await publishCache(
          deps.subjectFactsPublisher,
          cacheRecord,
          {
            userId: payload.userId,
            dirtyVersion: payload.dirtyVersion,
            logger: deps.logger,
          },
        );
        if (cacheStatus !== "failed") {
          await repairSubjectAccess(
            deps.subjectAccessRepair,
            cacheRecord.subjectIdentifier,
            {
              userId: payload.userId,
              logger: deps.logger,
            },
          );
        }
        return {
          status: "rebuilt" as const,
          userId: payload.userId,
          dirtyVersion: payload.dirtyVersion,
          cacheStatus,
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

async function repairSubjectAccess(
  repair: SubjectAccessRepairPort,
  subjectIdentifier: string,
  context: {
    userId: number;
    logger: UserProfileRebuildLoggerPort;
  },
) {
  try {
    await repair.repairSubject(subjectIdentifier);
  }
  catch (error) {
    context.logger.warn({
      userId: context.userId,
      operation: "subject_access_repair",
      errorType: readSafeErrorToken(error, "name") ?? "UnknownError",
    }, "user profile Subject Access repair failed");
  }
}

export type UserProfileRebuildProcessor = ReturnType<typeof createUserProfileRebuildProcessor>;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function publishCache(
  publisher: SubjectFactsPublisherPort,
  record: SubjectFactsCacheRecord,
  context: {
    userId: number;
    dirtyVersion: string;
    logger: UserProfileRebuildLoggerPort;
  },
) {
  try {
    return (await publisher.publish(record)).status;
  }
  catch (error) {
    const errorSummary = summarizeCachePublicationError(error);
    context.logger.warn({
      userId: context.userId,
      dirtyVersion: context.dirtyVersion,
      cacheStatus: "failed",
      ...errorSummary,
    }, "user profile Subject Facts cache publication failed");
    return "failed" as const;
  }
}

function summarizeCachePublicationError(error: unknown) {
  return {
    errorType: readSafeErrorToken(error, "name") ?? "UnknownError",
    errorCode: readSafeErrorToken(error, "code"),
  };
}

function readSafeErrorToken(error: unknown, property: "code" | "name") {
  if (typeof error !== "object" || error === null)
    return undefined;

  try {
    const value = (error as Record<string, unknown>)[property];
    return typeof value === "string" && /^[A-Za-z][\w.-]{0,63}$/u.test(value)
      ? value
      : undefined;
  }
  catch {
    return undefined;
  }
}
