import { z } from "@hono/zod-openapi";
import {
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID,
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
} from "@iam/session-kernel";

function optionalNonEmptyString() {
  return z.string().optional().transform(value => value?.trim() || undefined);
}

function listString(defaultValue: string) {
  return z.string().default(defaultValue).transform(value => value.split(",").map(item => item.trim()).filter(Boolean));
}

const RawEnvSchema = z.object({
  IAM_ADMIN_API_DATABASE_URL: z.string().min(1),
  IAM_ADMIN_API_PASSWORD_HASH_ROUNDS: z.coerce.number().int().positive().default(10),
  IAM_ADMIN_API_PORT: z.coerce.number().int().min(1).max(65535).default(30001),
  NODE_ENV: z.string().default("development"),
  IAM_ADMIN_API_REDIS_HOST: z.string().min(1),
  IAM_ADMIN_API_REDIS_PORT: z.coerce.number().int().min(1).max(65535),
  IAM_ADMIN_API_REDIS_PASSWORD: optionalNonEmptyString(),
  IAM_ADMIN_API_REDIS_DB: z.coerce.number().int().min(0),
  IAM_ADMIN_API_LOG_LEVEL: z.string().default("info"),
  IAM_ADMIN_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_ADMIN_API_ADMIN_CLIENT_CODES: listString("iam-admin"),
  IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE: z.string().default("sess:v2:"),
  IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID: z.string().min(1).default(DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID),
  IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: z
    .string()
    .min(32)
    .default(DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET),
  IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID: optionalNonEmptyString(),
  IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: optionalNonEmptyString(),
}).superRefine((raw, ctx) => {
  const hasPreviousId = raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID !== undefined;
  const hasPreviousSecret = raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined;
  if (hasPreviousId !== hasPreviousSecret) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID"],
      message: "IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID and IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be configured together",
    });
  }
  if (
    raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined
    && raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET.length < 32
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET"],
      message: "IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be at least 32 characters",
    });
  }
  if (
    raw.NODE_ENV === "production"
    && raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET === DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET"],
      message: "IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production",
    });
  }
});

type RawEnv = z.infer<typeof RawEnvSchema>;

export interface Env extends Record<string, unknown> {
  databaseUrl: string;
  passwordHashRounds: number;
  port: number;
  nodeEnv: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  auth: {
    adminClientCodes: string[];
  };
  sessionKernel: {
    namespace: string;
    principalIdleTtlSeconds: number;
    principalAbsoluteTtlSeconds: number;
    tombstoneTtlSeconds: number;
    tombstoneGraceSeconds: number;
    lookupHmacCurrentId: string;
    lookupHmacCurrentSecret: string;
    lookupHmacPreviousId?: string;
    lookupHmacPreviousSecret?: string;
  };
}

function toAdminApiEnv(raw: RawEnv): Env {
  return {
    databaseUrl: raw.IAM_ADMIN_API_DATABASE_URL,
    passwordHashRounds: raw.IAM_ADMIN_API_PASSWORD_HASH_ROUNDS,
    port: raw.IAM_ADMIN_API_PORT,
    nodeEnv: raw.NODE_ENV,
    redis: {
      host: raw.IAM_ADMIN_API_REDIS_HOST,
      port: raw.IAM_ADMIN_API_REDIS_PORT,
      password: raw.IAM_ADMIN_API_REDIS_PASSWORD,
      db: raw.IAM_ADMIN_API_REDIS_DB,
    },
    log: {
      level: raw.IAM_ADMIN_API_LOG_LEVEL,
      format: raw.IAM_ADMIN_API_LOG_FORMAT,
    },
    auth: {
      adminClientCodes: raw.IAM_ADMIN_API_ADMIN_CLIENT_CODES,
    },
    sessionKernel: {
      namespace: raw.IAM_ADMIN_API_SESSION_KERNEL_NAMESPACE,
      principalIdleTtlSeconds: raw.IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS,
      principalAbsoluteTtlSeconds: raw.IAM_ADMIN_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS,
      tombstoneTtlSeconds: raw.IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS,
      tombstoneGraceSeconds: raw.IAM_ADMIN_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS,
      lookupHmacCurrentId: raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_ID,
      lookupHmacCurrentSecret: raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
      lookupHmacPreviousId: raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID,
      lookupHmacPreviousSecret: raw.IAM_ADMIN_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET,
    },
  };
}

function exposeDatabaseUrlForDbPackage(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
}

export function parseAdminApiEnv(source: NodeJS.ProcessEnv): Env {
  const env = toAdminApiEnv(RawEnvSchema.parse(source));
  exposeDatabaseUrlForDbPackage(env.databaseUrl);
  return env;
}

const env = parseAdminApiEnv(process.env);

export default env;
