import { z } from "@hono/zod-openapi";
import { type RedisConfig, redisUrlString } from "@iam/runtime/redis/config";

function listString(defaultValue: string) {
  return z
    .string()
    .default(defaultValue)
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    );
}

const RawEnvSchema = z.object({
  IAM_ADMIN_API_DATABASE_URL: z.string().min(1),
  IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: z.coerce.number().int().positive().default(10),
  IAM_ADMIN_API_HOSTNAME: z.string().trim().min(1).optional(),
  IAM_ADMIN_API_PORT: z.coerce.number().int().min(1).max(65535).default(30001),
  NODE_ENV: z.string().default("development"),
  IAM_ADMIN_API_REDIS_URL: redisUrlString(),
  IAM_ADMIN_API_LOG_LEVEL: z.string().default("info"),
  IAM_ADMIN_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_ADMIN_API_ADMIN_CLIENT_CODES: listString("iam-admin"),
  IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: z
    .string()
    .regex(/^[\w:-]+$/u)
    .default("iam:session"),
  IAM_ADMIN_API_USER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_ADMIN_API_CLIENT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
});

type RawEnv = z.infer<typeof RawEnvSchema>;

export interface Env extends Record<string, unknown> {
  databaseUrl: string;
  passwordHashRounds: number;
  hostname?: string;
  port: number;
  nodeEnv: string;
  redis: RedisConfig;
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  auth: {
    adminClientCodes: string[];
  };
  sessionKernel: {
    namespace: string;
    userSessionTtlSeconds: number;
    clientSessionTtlSeconds: number;
  };
}

function toAdminApiEnv(raw: RawEnv): Env {
  return {
    databaseUrl: raw.IAM_ADMIN_API_DATABASE_URL,
    passwordHashRounds: raw.IAM_ADMIN_API_PASSWORD_HASH_ROUNDS,
    hostname: raw.IAM_ADMIN_API_HOSTNAME,
    port: raw.IAM_ADMIN_API_PORT,
    nodeEnv: raw.NODE_ENV,
    redis: raw.IAM_ADMIN_API_REDIS_URL,
    log: {
      level: raw.IAM_ADMIN_API_LOG_LEVEL,
      format: raw.IAM_ADMIN_API_LOG_FORMAT,
    },
    auth: {
      adminClientCodes: raw.IAM_ADMIN_API_ADMIN_CLIENT_CODES,
    },
    sessionKernel: {
      namespace: raw.IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE,
      userSessionTtlSeconds: raw.IAM_ADMIN_API_USER_SESSION_TTL_SECONDS,
      clientSessionTtlSeconds: raw.IAM_ADMIN_API_CLIENT_SESSION_TTL_SECONDS,
    },
  };
}

export function readAdminApiEnv(source: NodeJS.ProcessEnv): Env {
  return toAdminApiEnv(RawEnvSchema.parse(source));
}

export function parseAdminApiEnv(source: NodeJS.ProcessEnv): Env {
  const env = readAdminApiEnv(source);
  process.env.DATABASE_URL = env.databaseUrl;
  return env;
}
