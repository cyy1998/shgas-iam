import { DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET } from "@iam/session-kernel";
import { beforeAll, describe, expect, test } from "bun:test";

type ParseAdminApiEnv = typeof import("../env").parseAdminApiEnv;

let parseAdminApiEnv: ParseAdminApiEnv;

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_ADMIN_API_REDIS_HOST: "localhost",
    IAM_ADMIN_API_REDIS_PORT: "6379",
    IAM_ADMIN_API_REDIS_DB: "0",
  };
}

describe("admin API environment", () => {
  beforeAll(async () => {
    Object.assign(process.env, validEnv());
    ({ parseAdminApiEnv } = await import("../env"));
  });

  test("rejects the default Session Kernel HMAC secret in production", () => {
    expect(() => parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    })).toThrow("IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");

    expect(() => parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
    })).toThrow("IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production");
  });

  test("accepts an explicit production Session Kernel HMAC secret", () => {
    const env = parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: "p".repeat(32),
    });

    expect(env.sessionKernel.lookupHmacCurrentSecret).toBe("p".repeat(32));
  });
});
