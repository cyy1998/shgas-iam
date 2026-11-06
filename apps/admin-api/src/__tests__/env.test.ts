import { beforeAll, describe, expect, test } from "bun:test";

type ParseAdminApiEnv = typeof import("../env").parseAdminApiEnv;

let parseAdminApiEnv: ParseAdminApiEnv;

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_ADMIN_API_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_ADMIN_API_REDIS_URL: "redis://localhost:6379/0",
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
    expect(env.sessionKernel.namespace).toBe("iam:session");
  });

  test("configures root and client lifetimes independently", () => {
    const env = parseAdminApiEnv({
      ...validEnv(),
      IAM_ADMIN_API_USER_SESSION_TTL_SECONDS: "86400",
      IAM_ADMIN_API_CLIENT_SESSION_TTL_SECONDS: "3600",
    });
    expect(env.sessionKernel).toEqual({
      namespace: "iam:session",
      userSessionTtlSeconds: 86400,
      clientSessionTtlSeconds: 3600,
    });
    for (const key of ["IAM_ADMIN_API_USER_SESSION_TTL_SECONDS", "IAM_ADMIN_API_CLIENT_SESSION_TTL_SECONDS"])
      expect(() => parseAdminApiEnv({ ...validEnv(), [key]: "0" })).toThrow();
  });

  test("maps a Redis URL to its complete connection configuration", () => {
    const env = parseAdminApiEnv({
      ...validEnv(),
      IAM_ADMIN_API_REDIS_URL: "redis://admin-user:p%40ss%3Aword@cache.local:6380/3",
    });
    expect(env.redis).toEqual({
      host: "cache.local",
      port: 6380,
      db: 3,
      username: "admin-user",
      password: "p@ss:word",
    });
  });

  test("requires a Redis URL instead of separate connection fields", () => {
    expect(() =>
      parseAdminApiEnv({
        ...validEnv(),
        IAM_ADMIN_API_REDIS_URL: undefined,
        IAM_ADMIN_API_REDIS_HOST: "localhost",
        IAM_ADMIN_API_REDIS_PORT: "6379",
        IAM_ADMIN_API_REDIS_DB: "0",
      }),
    ).toThrow("IAM_ADMIN_API_REDIS_URL");
  });
});
