import { z } from "@hono/zod-openapi";
import { optionalNonEmptyString } from "@iam/runtime/env-schema";
import { redisUrlString } from "@iam/runtime/redis/config";

const RawEnvSchema = z
  .object({
    NODE_ENV: z.string().default("development"),
    IAM_INTEGRATION_API_PORT: z.coerce.number().int().min(1).max(65535).default(30005),
    IAM_INTEGRATION_API_DATABASE_URL: z.string().min(1),
    IAM_INTEGRATION_API_REDIS_URL: redisUrlString(),
    IAM_INTEGRATION_API_LOG_LEVEL: z.string().default("info"),
    IAM_INTEGRATION_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
    IAM_INTEGRATION_API_SESSION_KERNEL_NAMESPACE: z
      .string()
      .regex(/^[\w:-]+$/u)
      .default("iam:session"),
    IAM_INTEGRATION_API_USER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    IAM_INTEGRATION_API_CLIENT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    IAM_INTEGRATION_API_SMS_URL: optionalNonEmptyString().pipe(z.httpUrl().optional()),
    IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: optionalNonEmptyString(),
  })
  .superRefine((raw, ctx) => {
    if (raw.NODE_ENV === "production") {
      for (const name of ["IAM_INTEGRATION_API_SMS_URL", "IAM_INTEGRATION_API_SMS_SIGNATURE_KEY"] as const) {
        if (!raw[name]) ctx.addIssue({ code: "custom", path: [name], message: "Required for production welcome SMS" });
      }
    }
  });

export function parseIntegrationApiEnv(source: NodeJS.ProcessEnv) {
  const raw = RawEnvSchema.parse(source);
  const smsUrl = raw.IAM_INTEGRATION_API_SMS_URL;
  const signatureKey = raw.IAM_INTEGRATION_API_SMS_SIGNATURE_KEY;
  return {
    nodeEnv: raw.NODE_ENV,
    port: raw.IAM_INTEGRATION_API_PORT,
    databaseUrl: raw.IAM_INTEGRATION_API_DATABASE_URL,
    redis: raw.IAM_INTEGRATION_API_REDIS_URL,
    log: { level: raw.IAM_INTEGRATION_API_LOG_LEVEL, format: raw.IAM_INTEGRATION_API_LOG_FORMAT },
    sessionKernel: {
      namespace: raw.IAM_INTEGRATION_API_SESSION_KERNEL_NAMESPACE,
      userSessionTtlSeconds: raw.IAM_INTEGRATION_API_USER_SESSION_TTL_SECONDS,
      clientSessionTtlSeconds: raw.IAM_INTEGRATION_API_CLIENT_SESSION_TTL_SECONDS,
    },
    sms: raw.NODE_ENV === "production" && smsUrl && signatureKey ? { smsUrl, signatureKey } : undefined,
  };
}

export type Env = ReturnType<typeof parseIntegrationApiEnv>;
