import { describe, expect, test } from "bun:test";
import { redisUrlString } from "@iam/runtime/redis/config";
import { z } from "zod";

describe("Redis URL configuration", () => {
  test.each(["redis://redis.test", "redis://redis.test/"])("uses URL defaults for %s", (value) => {
    expect(redisUrlString().parse(value)).toEqual({ host: "redis.test", port: 6379, db: 0, password: undefined });
  });

  test("decodes ACL credentials while keeping password punctuation intact", () => {
    expect(redisUrlString().parse("redis://user%40name:p%3Aa%2Fs%40s%25word@redis.test:6380/12")).toEqual({
      host: "redis.test",
      port: 6380,
      db: 12,
      username: "user@name",
      password: "p:a/s@s%word",
    });
  });

  test("supports password-only authentication and IPv6 socket hosts", () => {
    expect(redisUrlString().parse("redis://:secret@[2001:db8::1]:6380/12")).toEqual({
      host: "2001:db8::1",
      port: 6380,
      db: 12,
      password: "secret",
    });
  });

  test("accepts surrounding env whitespace and the maximum supported port and DB", () => {
    expect(redisUrlString().parse("  REDIS://redis.test:65535/2147483647  ")).toEqual({
      host: "redis.test",
      port: 65535,
      db: 2_147_483_647,
      password: undefined,
    });
  });

  test.each([
    "redis://",
    "redis:///0",
    "rediss://redis.test/0",
    "http://redis.test/0",
    "redis://redis.test:0/0",
    "redis://redis.test:65536/0",
    "redis://redis.test:invalid/0",
    "redis://redis.test/-1",
    "redis://redis.test/1.5",
    "redis://redis.test/01/2",
    "redis://redis.test/1/../0",
    "redis://redis.test/2147483648",
    "redis://redis.test/9007199254740992",
    "redis://redis.test/0?maxRetriesPerRequest=0",
    "redis://redis.test/0?",
    "redis://redis.test/0#fragment",
    "redis://redis.test/0#",
    "redis://user:%ZZ@redis.test/0",
    "redis://redi\ts.test/0",
  ])("rejects unsupported or ambiguous connection input %s", (value) => {
    expect(redisUrlString().safeParse(value).success).toBe(false);
  });

  test("reports the env field without exposing URL credentials", () => {
    const value = "redis://private-user:private-password@redis.test/not-a-db";
    const parsed = z.object({ IAM_EXAMPLE_REDIS_URL: redisUrlString() }).safeParse({ IAM_EXAMPLE_REDIS_URL: value });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error("Invalid Redis URL was accepted");
    expect(parsed.error.issues[0]?.path).toEqual(["IAM_EXAMPLE_REDIS_URL"]);
    expect(parsed.error.message).not.toContain(value);
    expect(parsed.error.message).not.toContain("private-user");
    expect(parsed.error.message).not.toContain("private-password");
  });
});
