import type { PublishedProfile } from "../../src/schema/profile.schema";
import { UserStatus, UserType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createProfilePublicationService } from "../../src/publication/profile-publication.service";

const processedAt = new Date("2026-08-20T12:00:00.000Z");

describe("User Profile v3 publication service", () => {
  test("keeps the committed PostgreSQL candidate when the post-commit cache write fails", async () => {
    let postgresCommitted = false;
    const publishCandidate = mock(async () => {
      postgresCommitted = true;
      return { status: "published" as const };
    });
    const publishCache = mock(async () => {
      expect(postgresCommitted).toBe(true);
      throw new Error("Redis unavailable");
    });
    const service = createProfilePublicationService({
      profilePublication: { publishCandidate },
      cachePublisher: { publish: publishCache },
    });

    const result = await service.publish({
      userId: 1,
      dirtyVersion: "7",
      profile: profile(),
      processedAt,
    });

    expect(result).toEqual({ profileStatus: "published", cacheStatus: "failed" });
    expect(publishCandidate).toHaveBeenCalledTimes(1);
    expect(publishCache).toHaveBeenCalledTimes(1);
  });
});

function profile(): PublishedProfile {
  return {
    userId: 1,
    subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
    username: "user1",
    name: "User 1",
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion: 3,
    sourceDirtyVersion: "7",
    detail: {
      id: 1,
      username: "user1",
      name: "User 1",
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: 1,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: processedAt,
      updateTime: processedAt,
      employments: [],
      privileges: [],
      roles: [],
    },
    searchDoc: {
      user: {
        subjectIdentifier: "5ee46272-9123-4ec3-9d8d-8a7a6ac7f888",
        username: "user1",
        name: "User 1",
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: processedAt,
  };
}
