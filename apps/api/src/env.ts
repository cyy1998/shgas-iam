import { z } from "@hono/zod-openapi";

function booleanString(defaultValue: boolean) {
  return z.string().optional().transform((value) => {
    if (value === undefined || value.trim() === "") {
      return defaultValue;
    }
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });
}

function jsonRecordString(description: string) {
  return z.string().transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        typeof parsed !== "object"
        || parsed === null
        || Array.isArray(parsed)
        || !Object.values(parsed).every(item => typeof item === "string" && item.trim() !== "")
      ) {
        ctx.addIssue({ code: "custom", message: `${description} must be a JSON object of strings` });
        return z.NEVER;
      }
      return parsed as Record<string, string>;
    }
    catch {
      ctx.addIssue({ code: "custom", message: `${description} must be valid JSON` });
      return z.NEVER;
    }
  });
}

function optionalNonEmptyString() {
  return z.string().optional().transform(value => value?.trim() || undefined);
}

function originString() {
  return z.url().transform(value => new URL(value).origin);
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PASSWORD_HASH_ROUNDS: z.coerce.number().default(10),
  SMS_SIGNATURE_KEY: z.string(),
  SMS_URL: z.string(),
  REDIS_EXPIRE_TIME: z.coerce.number(),
  AUTH_CODE_EXPIRE_TIME: z.coerce.number(),
  ORCAS_URL: z.string(),
  PORT: z.coerce.number().default(30000),
  WX_CORPID: z.string(),
  WX_CORPSECRET: z.string(),
  MAGIC_CODE: z.string(),
  NODE_ENV: z.string(),
  REDIS_URL: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional().transform(value => value || undefined),
  REDIS_DB: z.coerce.number(),
  LOGIN_ENDPOINT: z.string(),
  SSO_INTERNAL_ORIGIN: originString(),
  SSO_EXTERNAL_ORIGIN: originString(),
  AUTHORIZATION_ENDPOINT: z.string(),
  LOGOUT_ENDPOINT: z.string(),
  THIRDPARTY_OA_ENDPOINT: z.string(),
  LOG_LEVEL: z.string().default("info"),
  LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  CAP_ENABLED: booleanString(false),
  CAP_SITE_KEY: z.string().default("iam-sso"),
  CAP_SECRET: z.string().default("dev-cap-secret-change-me"),
  CAP_CHALLENGE_TTL_MS: z.coerce.number().default(10 * 60 * 1000),
  CAP_TOKEN_TTL_SECONDS: z.coerce.number().default(10 * 60),
  HUMAN_VERIFICATION_WINDOW_SECONDS: z.coerce.number().default(10 * 60),
  HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD: z.coerce.number().default(3),
  HUMAN_VERIFICATION_LOOKUP_THRESHOLD: z.coerce.number().default(20),
  LOGIN_CREDENTIAL_ACTIVE_KID: z.string().min(1),
  LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: jsonRecordString("LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON"),
  LOGIN_CREDENTIAL_MAX_SKEW_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  LOGIN_CREDENTIAL_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(6 * 60),
  SESSION_KERNEL_NAMESPACE: z.string().default("sess:v2:"),
  SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  SESSION_KERNEL_TOMBSTONE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  SESSION_LOOKUP_HMAC_CURRENT_ID: z.string().min(1).default("dev-current"),
  SESSION_LOOKUP_HMAC_CURRENT_SECRET: z.string().min(32).default("dev-session-lookup-hmac-secret-32-bytes"),
  SESSION_LOOKUP_HMAC_PREVIOUS_ID: optionalNonEmptyString(),
  SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: optionalNonEmptyString(),
}).superRefine((env, ctx) => {
  if (env.LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON[env.LOGIN_CREDENTIAL_ACTIVE_KID] === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["LOGIN_CREDENTIAL_ACTIVE_KID"],
      message: "LOGIN_CREDENTIAL_ACTIVE_KID must exist in LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
    });
  }
  const hasPreviousId = env.SESSION_LOOKUP_HMAC_PREVIOUS_ID !== undefined;
  const hasPreviousSecret = env.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined;
  if (hasPreviousId !== hasPreviousSecret) {
    ctx.addIssue({
      code: "custom",
      path: ["SESSION_LOOKUP_HMAC_PREVIOUS_ID"],
      message: "SESSION_LOOKUP_HMAC_PREVIOUS_ID and SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be configured together",
    });
  }
  if (env.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined && env.SESSION_LOOKUP_HMAC_PREVIOUS_SECRET.length < 32) {
    ctx.addIssue({
      code: "custom",
      path: ["SESSION_LOOKUP_HMAC_PREVIOUS_SECRET"],
      message: "SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be at least 32 characters",
    });
  }
  if (env.NODE_ENV === "production" && !process.env.SESSION_LOOKUP_HMAC_CURRENT_SECRET?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["SESSION_LOOKUP_HMAC_CURRENT_SECRET"],
      message: "SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production",
    });
  }
});

export type Env = z.infer<typeof EnvSchema>;

// 从 process.env 或 Deno.env 获取（根据运行时调整）
const rawEnv = process.env;

const env = EnvSchema.parse(rawEnv);

export default env;
