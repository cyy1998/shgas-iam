import type { PostgresTestHarness } from "./postgres-test-harness";
import { ApiErrorCode, UserStatus, UserType } from "@iam/contracts";
import { userProfiles } from "@iam/db/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createInternalUserProfileQueryRepository } from "../../src/internal-user-query.repository";
import { createInternalUserProfileQueryService } from "../../src/internal-user-query.service";
import { createPostgresTestHarness } from "./postgres-test-harness";

const now = new Date("2026-08-22T12:00:00.000Z");
let harness: PostgresTestHarness | undefined;

beforeAll(async () => {
  harness = await createPostgresTestHarness();
});

beforeEach(async () => {
  await harness!.reset();
});

afterAll(async () => {
  await harness?.close();
});

describe("Internal User Profile Detail", () => {
  test("reads only the strict v3 Detail by username", async () => {
    await harness!.db.insert(userProfiles).values([
      profile(1, 3),
      profile(2, 2),
    ]);
    const service = createInternalUserProfileQueryService({
      profileRepository: createInternalUserProfileQueryRepository(harness!.db),
    });

    const current = await service.getDetailByUsername("user-1");
    const staleError = await service.getDetailByUsername("user-2").catch(error => error);

    expect(current).toMatchObject({ id: 1, username: "user-1", employments: [] });
    expect(staleError).toMatchObject({
      code: ApiErrorCode.UserNotFound,
      httpStatus: 404,
    });
  });
});

function profile(userId: number, profileSchemaVersion: number) {
  const subjectIdentifier
    = `00000000-0000-4000-8000-${String(userId).padStart(12, "0")}`;
  const username = `user-${userId}`;
  return {
    userId,
    subjectIdentifier,
    username,
    name: username,
    mobile: null,
    wxId: null,
    status: UserStatus.Enable,
    isDelete: false,
    searchVisible: true,
    profileSchemaVersion,
    sourceDirtyVersion: "1",
    detail: {
      id: userId,
      username,
      name: username,
      mobile: null,
      wxId: null,
      userType: UserType.Formal,
      orderNum: userId,
      status: UserStatus.Enable,
      isDelete: false,
      createTime: now,
      updateTime: now,
      employments: [],
      privileges: [],
      roles: [],
    },
    searchDoc: {
      user: {
        subjectIdentifier,
        username,
        name: username,
        mobile: null,
        wxId: null,
        userType: UserType.Formal,
        status: UserStatus.Enable,
      },
      employments: [],
    },
    subjectFacts: { employments: [] },
    rebuiltAt: now,
  };
}
