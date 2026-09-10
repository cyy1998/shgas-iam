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

  test("accepts production configuration without lookup secrets", () => {
    const env = parseAdminApiEnv({
      ...validEnv(),
      NODE_ENV: "production",
    });

    expect(env.nodeEnv).toBe("production");
    expect(env.sessionKernel.namespace).toBe("sess:v2:");
  });
});
