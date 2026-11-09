import { describe, expect, test } from "bun:test";
import { UserNotFoundError } from "@iam/domain/user";
import { createUserDocumentQueryService } from "../../query";

function query(profile: { username: string; name: string; mobile: string | null } | null) {
  return createUserDocumentQueryService({
    documentRepository: {
      getCurrentLoginProfileByUserId: async () => profile,
      getCurrentMobileByUsername: async () => profile,
    },
  });
}

describe("published login and contact reads", () => {
  test("login receives only the published identity and nullable mobile", async () => {
    const result = await query({ username: "alice", name: "Published Alice", mobile: null }).getLoginProfileByUserId(
      42,
    );
    expect(result).toEqual({ username: "alice", name: "Published Alice", mobile: null });
  });

  test.each(["13800000000", null])("contact returns the published nullable mobile: %s", async (mobile) => {
    const result = await query({ username: "alice", name: "Alice", mobile }).getMobileByUsername("alice");
    expect(result).toBe(mobile);
  });

  test("missing publication remains a failure for both consumers", async () => {
    const service = query(null);
    const loginError = await service.getLoginProfileByUserId(42).catch((error) => error);
    const mobileError = await service.getMobileByUsername("alice").catch((error) => error);
    expect(loginError).toBeInstanceOf(UserNotFoundError);
    expect(mobileError).toBeInstanceOf(UserNotFoundError);
  });
});
