import { DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET } from "@iam/api-core/session/kernel";
import { describe, expect, test } from "bun:test";
import { parseAdminApiEnv } from "../env";

function validEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://iam:password@localhost/iam",
    REDIS_URL: "localhost",
    REDIS_PORT: "6379",
    REDIS_DB: "0",
  };
}

describe("admin API environment", () => {
  test("rejects the default Session Kernel HMAC secret in production", () => {
    expect(() => parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    })).toThrow("SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");

    expect(() => parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      SESSION_LOOKUP_HMAC_CURRENT_SECRET: DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
    })).toThrow("SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");
  });

  test("accepts an explicit production Session Kernel HMAC secret", () => {
    const env = parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      SESSION_LOOKUP_HMAC_CURRENT_SECRET: "p".repeat(32),
    });

    expect(env.SESSION_LOOKUP_HMAC_CURRENT_SECRET).toBe("p".repeat(32));
  });
});
