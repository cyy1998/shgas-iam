import { z } from "@hono/zod-openapi";

function optionalNonEmptyString() {
  return z.string().optional().transform(value => value?.trim() || undefined);
}

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PASSWORD_HASH_ROUNDS: z.coerce.number().default(10),
  PORT: z.coerce.number().default(30001),
  NODE_ENV: z.string().default("development"),
  REDIS_URL: z.string(),
  REDIS_PORT: z.coerce.number(),
  REDIS_PASSWORD: z.string().optional().transform(value => value || undefined),
  REDIS_DB: z.coerce.number(),
  LOG_LEVEL: z.string().default("info"),
  LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  ADMIN_CLIENT_CODES: z.string().default("iam-admin"),
  ADMIN_ROLE_CODES: z.string().default("iam:admin"),
  SESSION_KERNEL_NAMESPACE: z.string().default("sess:v2:"),
  SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  SESSION_KERNEL_TOMBSTONE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  SESSION_LOOKUP_HMAC_CURRENT_ID: z.string().min(1).default("dev-current"),
  SESSION_LOOKUP_HMAC_CURRENT_SECRET: z.string().min(32).default("dev-session-lookup-hmac-secret-32-bytes"),
  SESSION_LOOKUP_HMAC_PREVIOUS_ID: optionalNonEmptyString(),
  SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: optionalNonEmptyString(),
}).superRefine((env, ctx) => {
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

const env = EnvSchema.parse(process.env);

export const adminClientCodes = env.ADMIN_CLIENT_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export const adminRoleCodes = env.ADMIN_ROLE_CODES.split(",")
  .map(code => code.trim())
  .filter(Boolean);

export default env;
