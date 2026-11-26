import { z } from "@hono/zod-openapi";
import { booleanString, optionalNonEmptyString } from "@iam/runtime/env-schema";
import { type RedisConfig, redisUrlString } from "@iam/runtime/redis/config";

function jsonRecordString(description: string) {
  return z.string().transform((value, ctx) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        !Object.values(parsed).every((item) => typeof item === "string" && item.trim() !== "")
      ) {
        ctx.addIssue({ code: "custom", message: `${description} must be a JSON object of strings` });
        return z.NEVER;
      }
      return parsed as Record<string, string>;
    } catch {
      ctx.addIssue({ code: "custom", message: `${description} must be valid JSON` });
      return z.NEVER;
    }
  });
}

function originString() {
  return z
    .string()
    .regex(/^[^\\\s]+$/u)
    .pipe(z.url())
    .refine(
      (value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash &&
          !url.username &&
          !url.password
        );
      },
      { message: "SSO entry must be an HTTP(S) origin without credentials, path, query or fragment" },
    )
    .transform((value) => new URL(value).origin);
}

const RawEnvSchema = z
  .object({
    IAM_AUTH_API_DATABASE_URL: z.string().min(1),
    IAM_AUTH_API_PASSWORD_HASH_ROUNDS: z.coerce.number().int().positive().default(10),
    IAM_AUTH_API_SMS_SIGNATURE_KEY: z.string().min(1),
    IAM_AUTH_API_SMS_URL: z.string().min(1),
    IAM_AUTH_API_PORT: z.coerce.number().int().min(1).max(65535).default(30000),
    IAM_AUTH_API_WECHAT_CORP_ID: z.string().min(1),
    IAM_AUTH_API_WECHAT_CORP_SECRET: z.string().min(1),
    IAM_AUTH_API_WECHAT_QR_AGENT_ID: optionalNonEmptyString(),
    IAM_AUTH_API_WECHAT_QR_CALLBACK_URL: optionalNonEmptyString(),
    IAM_AUTH_API_MAGIC_CODE: z.string().min(1),
    NODE_ENV: z.string().default("development"),
    IAM_AUTH_API_REDIS_URL: redisUrlString(),
    IAM_AUTH_API_SSO_INTERNAL_ORIGIN: originString(),
    IAM_AUTH_API_SSO_EXTERNAL_ORIGIN: originString(),
    IAM_AUTH_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: z.coerce.number().int().positive().default(3),
    IAM_AUTH_API_LOG_LEVEL: z.string().default("info"),
    IAM_AUTH_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
    IAM_AUTH_API_CAP_ENABLED: booleanString(false),
    IAM_AUTH_API_IMAGE_CAPTCHA_ENABLED: booleanString(true),
    IAM_AUTH_API_CAP_SITE_KEY: z.string().default("iam-sso"),
    IAM_AUTH_API_CAP_SECRET: z.string().default("dev-cap-secret-change-me"),
    IAM_AUTH_API_CAP_CHALLENGE_TTL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60 * 1000),
    IAM_AUTH_API_CAP_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60),
    IAM_AUTH_API_HUMAN_VERIFICATION_WINDOW_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60),
    IAM_AUTH_API_HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
    IAM_AUTH_API_HUMAN_VERIFICATION_LOOKUP_THRESHOLD: z.coerce.number().int().positive().default(20),
    IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID: z.string().min(1),
    IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: jsonRecordString(
      "IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
    ),
    IAM_AUTH_API_LOGIN_CREDENTIAL_MAX_SKEW_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(5 * 60 * 1000),
    IAM_AUTH_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(6 * 60),
    IAM_AUTH_API_SESSION_KERNEL_NAMESPACE: z
      .string()
      .regex(/^[\w:-]+$/u)
      .default("iam:session"),
    IAM_AUTH_API_USER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    IAM_AUTH_API_CLIENT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
    IAM_AUTH_API_OIDC_NAMESPACE: z
      .string()
      .regex(/^[\w:-]+$/u)
      .default("iam:oidc"),
  })
  .superRefine((raw, ctx) => {
    const agentId = raw.IAM_AUTH_API_WECHAT_QR_AGENT_ID;
    const callback = raw.IAM_AUTH_API_WECHAT_QR_CALLBACK_URL;
    if (agentId || callback) {
      if (!agentId || !/^\d+$/u.test(agentId)) {
        ctx.addIssue({
          code: "custom",
          path: ["IAM_AUTH_API_WECHAT_QR_AGENT_ID"],
          message: "WeChat QR requires a numeric AgentId",
        });
      }
      const url = callback && URL.canParse(callback) ? new URL(callback) : undefined;
      if (
        url?.protocol !== "https:" ||
        url.hostname !== new URL(raw.IAM_AUTH_API_SSO_EXTERNAL_ORIGIN).hostname ||
        url.hostname === new URL(raw.IAM_AUTH_API_SSO_INTERNAL_ORIGIN).hostname ||
        url.pathname !== "/sso/wechat-qr/mobile/callback" ||
        url.search ||
        url.hash ||
        url.username ||
        url.password ||
        url.href !== callback
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["IAM_AUTH_API_WECHAT_QR_CALLBACK_URL"],
          message: "WeChat QR requires the canonical HTTPS public /sso/wechat-qr/mobile/callback URL",
        });
      }
    }
    if (
      raw.IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON[raw.IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID] === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID"],
        message:
          "IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID must exist in IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
      });
    }
  });

type RawEnv = z.infer<typeof RawEnvSchema>;

export interface Env extends Record<string, unknown> {
  databaseUrl: string;
  passwordHashRounds: number;
  port: number;
  nodeEnv: string;
  redis: RedisConfig;
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  auth: {
    magicCode: string;
  };
  cap: {
    enabled: boolean;
    siteKey: string;
    secret: string;
    challengeTtlMs: number;
    tokenTtlSeconds: number;
  };
  humanVerification: {
    imageCaptchaEnabled: boolean;
    windowSeconds: number;
    loginFailureThreshold: number;
    lookupThreshold: number;
  };
  loginCredential: {
    activeKid: string;
    privateKeysByKid: Record<string, string>;
    maxSkewMs: number;
    nonceTtlSeconds: number;
  };
  sessionKernel: {
    namespace: string;
    userSessionTtlSeconds: number;
    clientSessionTtlSeconds: number;
  };
  oidc: {
    namespace: string;
  };
  integrations: {
    sms: {
      url: string;
      signatureKey: string;
    };
    wechat: {
      corpId: string;
      corpSecret: string;
      qr?: { agentId: string; callbackUrl: string };
    };
  };
  sso: {
    internalOrigin: string;
    externalOrigin: string;

    projectionRetryAfterSeconds: number;
  };
}

function toApiEnv(raw: RawEnv): Env {
  return {
    databaseUrl: raw.IAM_AUTH_API_DATABASE_URL,
    passwordHashRounds: raw.IAM_AUTH_API_PASSWORD_HASH_ROUNDS,
    port: raw.IAM_AUTH_API_PORT,
    nodeEnv: raw.NODE_ENV,
    redis: raw.IAM_AUTH_API_REDIS_URL,
    log: {
      level: raw.IAM_AUTH_API_LOG_LEVEL,
      format: raw.IAM_AUTH_API_LOG_FORMAT,
    },
    auth: {
      magicCode: raw.IAM_AUTH_API_MAGIC_CODE,
    },
    cap: {
      enabled: raw.IAM_AUTH_API_CAP_ENABLED,
      siteKey: raw.IAM_AUTH_API_CAP_SITE_KEY,
      secret: raw.IAM_AUTH_API_CAP_SECRET,
      challengeTtlMs: raw.IAM_AUTH_API_CAP_CHALLENGE_TTL_MS,
      tokenTtlSeconds: raw.IAM_AUTH_API_CAP_TOKEN_TTL_SECONDS,
    },
    humanVerification: {
      imageCaptchaEnabled: raw.IAM_AUTH_API_IMAGE_CAPTCHA_ENABLED,
      windowSeconds: raw.IAM_AUTH_API_HUMAN_VERIFICATION_WINDOW_SECONDS,
      loginFailureThreshold: raw.IAM_AUTH_API_HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD,
      lookupThreshold: raw.IAM_AUTH_API_HUMAN_VERIFICATION_LOOKUP_THRESHOLD,
    },
    loginCredential: {
      activeKid: raw.IAM_AUTH_API_LOGIN_CREDENTIAL_ACTIVE_KID,
      privateKeysByKid: raw.IAM_AUTH_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON,
      maxSkewMs: raw.IAM_AUTH_API_LOGIN_CREDENTIAL_MAX_SKEW_MS,
      nonceTtlSeconds: raw.IAM_AUTH_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS,
    },
    sessionKernel: {
      namespace: raw.IAM_AUTH_API_SESSION_KERNEL_NAMESPACE,
      userSessionTtlSeconds: raw.IAM_AUTH_API_USER_SESSION_TTL_SECONDS,
      clientSessionTtlSeconds: raw.IAM_AUTH_API_CLIENT_SESSION_TTL_SECONDS,
    },
    oidc: {
      namespace: raw.IAM_AUTH_API_OIDC_NAMESPACE,
    },
    integrations: {
      sms: {
        url: raw.IAM_AUTH_API_SMS_URL,
        signatureKey: raw.IAM_AUTH_API_SMS_SIGNATURE_KEY,
      },
      wechat: {
        corpId: raw.IAM_AUTH_API_WECHAT_CORP_ID,
        corpSecret: raw.IAM_AUTH_API_WECHAT_CORP_SECRET,
        qr:
          raw.IAM_AUTH_API_WECHAT_QR_AGENT_ID && raw.IAM_AUTH_API_WECHAT_QR_CALLBACK_URL
            ? { agentId: raw.IAM_AUTH_API_WECHAT_QR_AGENT_ID, callbackUrl: raw.IAM_AUTH_API_WECHAT_QR_CALLBACK_URL }
            : undefined,
      },
    },
    sso: {
      internalOrigin: raw.IAM_AUTH_API_SSO_INTERNAL_ORIGIN,
      externalOrigin: raw.IAM_AUTH_API_SSO_EXTERNAL_ORIGIN,

      projectionRetryAfterSeconds: raw.IAM_AUTH_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS,
    },
  };
}

export function parseAuthApiEnv(source: NodeJS.ProcessEnv): Env {
  return toApiEnv(RawEnvSchema.parse(source));
}
