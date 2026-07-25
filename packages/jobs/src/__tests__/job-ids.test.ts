import { describe, expect, test } from "bun:test";
import {
  buildDeterministicJobId,
  buildUserJobId,
  buildUserVersionJobId,
  DEFAULT_JOB_OPTIONS,
  DEFAULT_QUEUE_PREFIX,
  resolveDefaultJobOptions,
} from "../index";
import * as jobs from "../index";

describe("job id helpers", () => {
  test("builds a deterministic user-level job id", () => {
    expect(buildUserJobId("rebuild-user-profile", 123)).toBe("rebuild-user-profile|123");
  });

  test("builds a deterministic user-version job id", () => {
    expect(buildUserVersionJobId("rebuild-user-profile", 123, "42")).toBe("rebuild-user-profile|123|42");
    expect(buildUserVersionJobId("rebuild-user-profile", 123, "43")).toBe("rebuild-user-profile|123|43");
  });

  test("does not expose the retired scope-bucket job id builder", () => {
    expect("buildScopeBucketJobId" in jobs).toBe(false);
  });

  test("rejects empty job id parts", () => {
    expect(() => buildDeterministicJobId([])).toThrow("jobId parts must not be empty");
    expect(() => buildDeterministicJobId(["rebuild-user-profile", ""])).toThrow("jobId parts must be non-empty");
  });
});

describe("default queue options", () => {
  test("defines shared BullMQ retry and cleanup defaults", () => {
    expect(DEFAULT_QUEUE_PREFIX).toBe("iam");
    expect(DEFAULT_JOB_OPTIONS).toEqual({
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 1_000,
      },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  });

  test("allows callers to override default job options narrowly", () => {
    expect(resolveDefaultJobOptions({
      attempts: 5,
      removeOnFail: 100,
    })).toEqual({
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 1_000,
      },
      removeOnComplete: 1_000,
      removeOnFail: 100,
    });
  });
});
