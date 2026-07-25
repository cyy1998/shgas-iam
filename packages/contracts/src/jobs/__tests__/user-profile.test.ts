import { describe, expect, test } from "bun:test";
import {
  RebuildUserProfileJobPayloadSchema,
  USER_PROFILE_QUEUE_NAME,
  UserProfileDirtyReasonSchema,
  UserProfileJobName,
  UserProfileJobNameSchema,
} from "../user-profile";
import * as userProfileJobContract from "../user-profile";

describe("user-profile job contract", () => {
  test("defines the stable rebuild queue and job name", () => {
    expect(USER_PROFILE_QUEUE_NAME).toBe("user-profile");
    const result = UserProfileJobNameSchema.safeParse("rebuild-user-profile");

    expect(result.success).toBe(true);
    if (!result.success)
      throw result.error;
    expect(String(result.data)).toBe("rebuild-user-profile");
  });

  test("validates rebuild payloads before enqueueing or processing", () => {
    const result = RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
      dirtyVersion: "42",
      reason: "user-updated",
      requestedAt: "2026-07-25T10:30:00.000Z",
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(result.success).toBe(true);
    if (!result.success)
      throw result.error;
    expect({
      ...result.data,
      reason: String(result.data.reason),
    }).toEqual({
      userId: 123,
      dirtyVersion: "42",
      reason: "user-updated",
      requestedAt: "2026-07-25T10:30:00.000Z",
      requestId: "req-1",
      traceId: "trace-1",
    });

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 0,
      dirtyVersion: "1",
      reason: "user-updated",
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
      dirtyVersion: "not-decimal",
      reason: "user-updated",
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
      dirtyVersion: "0",
      reason: "user-updated",
    }).success).toBe(false);

    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      userId: 123,
    }).success).toBe(false);
  });

  test("rejects the retired scope-expansion job name and payload", () => {
    expect(UserProfileJobNameSchema.safeParse("expand-user-profile-scope").success).toBe(false);
    expect(RebuildUserProfileJobPayloadSchema.safeParse({
      scopeType: "organization-id",
      scopeId: 9,
      bucket: "2026-06-30T10:00",
      reason: "organization-updated",
    }).success).toBe(false);
  });

  test("does not expose generic payload registries for the single rebuild protocol", () => {
    expect("UserProfileJobPayloadSchemas" in userProfileJobContract).toBe(false);
    expect("UserProfileJobPayloadSchema" in userProfileJobContract).toBe(false);
  });

  test("continues parsing the historical privilege dirty reason", () => {
    const result = UserProfileDirtyReasonSchema.safeParse("privilege-updated");

    expect(result.success).toBe(true);
    if (!result.success)
      throw result.error;
    expect(String(result.data)).toBe("privilege-updated");
    expect(String(UserProfileJobName.RebuildUserProfile)).toBe("rebuild-user-profile");
  });
});
