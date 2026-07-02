import { describe, expect, test } from "bun:test";
import {
  ExpandUserProfileScopeJobPayloadSchema,
  RebuildUserProfileJobPayloadSchema,
  USER_PROFILE_QUEUE_NAME,
  UserProfileDirtyReason,
  UserProfileJobName,
  UserProfileJobNameSchema,
  UserProfileJobPayloadSchemas,
  UserProfileScopeType,
} from "../user-profile";

describe("user-profile job contract", () => {
  test("defines stable queue and job names", () => {
    expect(USER_PROFILE_QUEUE_NAME).toBe("user-profile");
    expect(UserProfileJobNameSchema.parse(UserProfileJobName.RebuildUserProfile)).toBe(
      UserProfileJobName.RebuildUserProfile,
    );
    expect(UserProfileJobNameSchema.parse(UserProfileJobName.ExpandUserProfileScope)).toBe(
      UserProfileJobName.ExpandUserProfileScope,
    );
  });

  test("validates rebuild payloads before enqueueing or processing", () => {
    expect(RebuildUserProfileJobPayloadSchema.parse({
      userId: 123,
      dirtyVersion: "42",
      reason: UserProfileDirtyReason.UserUpdated,
      requestId: "req-1",
      traceId: "trace-1",
    })).toEqual({
      userId: 123,
      dirtyVersion: "42",
      reason: UserProfileDirtyReason.UserUpdated,
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 0,
      dirtyVersion: "1",
      reason: UserProfileDirtyReason.UserUpdated,
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
      dirtyVersion: "not-decimal",
      reason: UserProfileDirtyReason.UserUpdated,
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
      dirtyVersion: "0",
      reason: UserProfileDirtyReason.UserUpdated,
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
    }).success).toBe(false);
  });

  test("validates scope expansion payloads", () => {
    expect(ExpandUserProfileScopeJobPayloadSchema.parse({
      scopeType: UserProfileScopeType.OrganizationId,
      scopeId: 9,
      bucket: "2026-06-30T10:00",
      reason: UserProfileDirtyReason.OrganizationUpdated,
    })).toEqual({
      scopeType: UserProfileScopeType.OrganizationId,
      scopeId: 9,
      bucket: "2026-06-30T10:00",
      reason: UserProfileDirtyReason.OrganizationUpdated,
    });

    expect(ExpandUserProfileScopeJobPayloadSchema.safeParse({
      scopeType: "unsupported",
      scopeId: 9,
      bucket: "2026-06-30T10:00",
      reason: UserProfileDirtyReason.OrganizationUpdated,
    }).success).toBe(false);
  });

  test("exposes schemas by job name for shared producer and worker validation", () => {
    const payload = UserProfileJobPayloadSchemas[UserProfileJobName.RebuildUserProfile].parse({
      userId: 456,
      dirtyVersion: "7",
      reason: UserProfileDirtyReason.ManualRebuild,
    });

    expect(payload).toEqual({
      userId: 456,
      dirtyVersion: "7",
      reason: UserProfileDirtyReason.ManualRebuild,
    });
  });
});
