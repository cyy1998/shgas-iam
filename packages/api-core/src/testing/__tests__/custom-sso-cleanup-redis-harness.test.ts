import { describe, expect, test } from "bun:test";
import {
  resolveCustomSsoCleanupRedisResource,
} from "../custom-sso-cleanup-redis-harness";

const cleanupUrlName = "IAM_API_CORE_CLEANUP_TEST_REDIS_URL";
const cleanupUrl = "redis://cleanup-user:cleanup-secret@redis.test.:6380/7";

describe("Custom SSO cleanup Redis resource safety", () => {
  test.each([
    "IAM_ADMIN_API_TEST_REDIS_URL",
    "IAM_API_CORE_TEST_REDIS_URL",
    "IAM_API_TEST_REDIS_URL",
    "IAM_OIDC_PROVIDER_TEST_REDIS_URL",
    "IAM_USER_PROFILE_TEST_REDIS_URL",
    "IAM_WORKER_TEST_REDIS_URL",
    "REDIS_URL",
  ])("rejects the same canonical logical DB exposed as %s", (candidateName) => {
    expect(() => resolveCustomSsoCleanupRedisResource({
      [cleanupUrlName]: cleanupUrl,
      [candidateName]: "redis://other-user:other-secret@REDIS.TEST:6380/7",
    })).toThrow(
      `${cleanupUrlName} must not identify the same Redis logical DB as ${candidateName}`,
    );
  });

  test.each([
    [cleanupUrlName, `${cleanupUrl}?db=8`],
    ["IAM_API_TEST_REDIS_URL", "redis://redis.test:6380/8?db=7"],
    ["REDIS_URL", "redis://redis.test:6380/8?port=6381"],
  ])("rejects query-based identity in %s", (candidateName, candidateUrl) => {
    expect(() => resolveCustomSsoCleanupRedisResource({
      [cleanupUrlName]: cleanupUrl,
      [candidateName]: candidateUrl,
    })).toThrow(
      `${candidateName} must not contain query parameters because connection identity must be unambiguous`,
    );
  });

  test("rejects the same canonical IPv6 runtime host tuple", () => {
    expect(() => resolveCustomSsoCleanupRedisResource({
      [cleanupUrlName]: "redis://cleanup-secret@[::1]:6380/7",
      IAM_REDIS_HOST: "[::1]",
      IAM_REDIS_PORT: "6380",
      IAM_REDIS_DB: "7",
    })).toThrow(
      `${cleanupUrlName} must not identify the same Redis logical DB as IAM_REDIS_HOST/IAM_REDIS_PORT/IAM_REDIS_DB`,
    );
  });

  test("returns only the validated cleanup connection needed by real callers", () => {
    expect(resolveCustomSsoCleanupRedisResource({
      [cleanupUrlName]: cleanupUrl,
      IAM_API_TEST_REDIS_URL: "redis://redis.test:6380/8",
    })).toEqual({
      url: cleanupUrl,
      username: "cleanup-user",
    });
  });
});
