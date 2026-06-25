import { z } from "@hono/zod-openapi";
import {
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID,
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
} from "@iam/api-core/session/kernel";

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

const RawEnvSchema = z.object({
  IAM_API_DATABASE_URL: z.string().min(1),
  IAM_API_PASSWORD_HASH_ROUNDS: z.coerce.number().int().positive().default(10),
  IAM_API_SMS_SIGNATURE_KEY: z.string().min(1),
  IAM_API_SMS_URL: z.string().min(1),
  IAM_API_SESSION_DEFAULT_TTL_SECONDS: z.coerce.number().int().positive(),
  IAM_API_AUTH_CODE_TTL_SECONDS: z.coerce.number().int().positive(),
  IAM_API_ORCAS_URL: z.string().min(1),
  IAM_API_PORT: z.coerce.number().int().min(1).max(65535).default(30000),
  IAM_API_WECHAT_CORP_ID: z.string().min(1),
  IAM_API_WECHAT_CORP_SECRET: z.string().min(1),
  IAM_API_MAGIC_CODE: z.string().min(1),
  NODE_ENV: z.string().default("development"),
  IAM_API_REDIS_HOST: z.string().min(1),
  IAM_API_REDIS_PORT: z.coerce.number().int().min(1).max(65535),
  IAM_API_REDIS_PASSWORD: optionalNonEmptyString(),
  IAM_API_REDIS_DB: z.coerce.number().int().min(0),
  IAM_API_LOGIN_ENDPOINT: z.string().min(1),
  IAM_API_SSO_INTERNAL_ORIGIN: originString(),
  IAM_API_SSO_EXTERNAL_ORIGIN: originString(),
  IAM_API_AUTHORIZATION_ENDPOINT: z.string().min(1),
  IAM_API_LOGOUT_ENDPOINT: z.string().min(1),
  IAM_API_THIRDPARTY_OA_ENDPOINT: z.string().min(1),
  IAM_API_LOG_LEVEL: z.string().default("info"),
  IAM_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_API_CAP_ENABLED: booleanString(false),
  IAM_API_CAP_SITE_KEY: z.string().default("iam-sso"),
  IAM_API_CAP_SECRET: z.string().default("dev-cap-secret-change-me"),
  IAM_API_CAP_CHALLENGE_TTL_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  IAM_API_CAP_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(10 * 60),
  IAM_API_HUMAN_VERIFICATION_WINDOW_SECONDS: z.coerce.number().int().positive().default(10 * 60),
  IAM_API_HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(3),
  IAM_API_HUMAN_VERIFICATION_LOOKUP_THRESHOLD: z.coerce.number().int().positive().default(20),
  IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID: z.string().min(1),
  IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON: jsonRecordString("IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON"),
  IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS: z.coerce.number().int().positive().default(6 * 60),
  IAM_API_SESSION_KERNEL_NAMESPACE: z.string().default("sess:v2:"),
  IAM_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  IAM_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: z.coerce.number().int().positive().optional(),
  IAM_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS: z.coerce.number().int().positive().default(24 * 60 * 60),
  IAM_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS: z.coerce.number().int().positive().default(5 * 60),
  IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID: z.string().min(1).default(DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID),
  IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET: z.string().min(32).default(DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET),
  IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID: optionalNonEmptyString(),
  IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: optionalNonEmptyString(),
}).superRefine((raw, ctx) => {
  if (raw.IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON[raw.IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID] === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID"],
      message: "IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID must exist in IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
    });
  }
  const hasPreviousId = raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID !== undefined;
  const hasPreviousSecret = raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined;
  if (hasPreviousId !== hasPreviousSecret) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID"],
      message: "IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID and IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be configured together",
    });
  }
  if (
    raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined
    && raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET.length < 32
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET"],
      message: "IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be at least 32 characters",
    });
  }
  if (
    raw.NODE_ENV === "production"
    && raw.IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET === DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET"],
      message: "IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production",
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
    magicCode: string;
    authCodeTtlSeconds: number;
    sessionDefaultTtlSeconds: number;
  };
  cap: {
    enabled: boolean;
    siteKey: string;
    secret: string;
    challengeTtlMs: number;
    tokenTtlSeconds: number;
  };
  humanVerification: {
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
    principalIdleTtlSeconds?: number;
    principalAbsoluteTtlSeconds?: number;
    tombstoneTtlSeconds: number;
    tombstoneGraceSeconds: number;
    lookupHmacCurrentId: string;
    lookupHmacCurrentSecret: string;
    lookupHmacPreviousId?: string;
    lookupHmacPreviousSecret?: string;
  };
  integrations: {
    orcas: {
      url: string;
    };
    sms: {
      url: string;
      signatureKey: string;
    };
    wechat: {
      corpId: string;
      corpSecret: string;
    };
  };
  sso: {
    loginEndpoint: string;
    internalOrigin: string;
    externalOrigin: string;
    authorizationEndpoint: string;
    logoutEndpoint: string;
    thirdPartyOAEndpoint: string;
  };
}

function toApiEnv(raw: RawEnv): Env {
  return {
    databaseUrl: raw.IAM_API_DATABASE_URL,
    passwordHashRounds: raw.IAM_API_PASSWORD_HASH_ROUNDS,
    port: raw.IAM_API_PORT,
    nodeEnv: raw.NODE_ENV,
    redis: {
      host: raw.IAM_API_REDIS_HOST,
      port: raw.IAM_API_REDIS_PORT,
      password: raw.IAM_API_REDIS_PASSWORD,
      db: raw.IAM_API_REDIS_DB,
    },
    log: {
      level: raw.IAM_API_LOG_LEVEL,
      format: raw.IAM_API_LOG_FORMAT,
    },
    auth: {
      magicCode: raw.IAM_API_MAGIC_CODE,
      authCodeTtlSeconds: raw.IAM_API_AUTH_CODE_TTL_SECONDS,
      sessionDefaultTtlSeconds: raw.IAM_API_SESSION_DEFAULT_TTL_SECONDS,
    },
    cap: {
      enabled: raw.IAM_API_CAP_ENABLED,
      siteKey: raw.IAM_API_CAP_SITE_KEY,
      secret: raw.IAM_API_CAP_SECRET,
      challengeTtlMs: raw.IAM_API_CAP_CHALLENGE_TTL_MS,
      tokenTtlSeconds: raw.IAM_API_CAP_TOKEN_TTL_SECONDS,
    },
    humanVerification: {
      windowSeconds: raw.IAM_API_HUMAN_VERIFICATION_WINDOW_SECONDS,
      loginFailureThreshold: raw.IAM_API_HUMAN_VERIFICATION_LOGIN_FAILURE_THRESHOLD,
      lookupThreshold: raw.IAM_API_HUMAN_VERIFICATION_LOOKUP_THRESHOLD,
    },
    loginCredential: {
      activeKid: raw.IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID,
      privateKeysByKid: raw.IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON,
      maxSkewMs: raw.IAM_API_LOGIN_CREDENTIAL_MAX_SKEW_MS,
      nonceTtlSeconds: raw.IAM_API_LOGIN_CREDENTIAL_NONCE_TTL_SECONDS,
    },
    sessionKernel: {
      namespace: raw.IAM_API_SESSION_KERNEL_NAMESPACE,
      principalIdleTtlSeconds: raw.IAM_API_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS,
      principalAbsoluteTtlSeconds: raw.IAM_API_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS,
      tombstoneTtlSeconds: raw.IAM_API_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS,
      tombstoneGraceSeconds: raw.IAM_API_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS,
      lookupHmacCurrentId: raw.IAM_API_SESSION_LOOKUP_HMAC_CURRENT_ID,
      lookupHmacCurrentSecret: raw.IAM_API_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
      lookupHmacPreviousId: raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_ID,
      lookupHmacPreviousSecret: raw.IAM_API_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET,
    },
    integrations: {
      orcas: {
        url: raw.IAM_API_ORCAS_URL,
      },
      sms: {
        url: raw.IAM_API_SMS_URL,
        signatureKey: raw.IAM_API_SMS_SIGNATURE_KEY,
      },
      wechat: {
        corpId: raw.IAM_API_WECHAT_CORP_ID,
        corpSecret: raw.IAM_API_WECHAT_CORP_SECRET,
      },
    },
    sso: {
      loginEndpoint: raw.IAM_API_LOGIN_ENDPOINT,
      internalOrigin: raw.IAM_API_SSO_INTERNAL_ORIGIN,
      externalOrigin: raw.IAM_API_SSO_EXTERNAL_ORIGIN,
      authorizationEndpoint: raw.IAM_API_AUTHORIZATION_ENDPOINT,
      logoutEndpoint: raw.IAM_API_LOGOUT_ENDPOINT,
      thirdPartyOAEndpoint: raw.IAM_API_THIRDPARTY_OA_ENDPOINT,
    },
  };
}

function exposeDatabaseUrlForDbPackage(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
}

export function parseApiEnv(source: NodeJS.ProcessEnv): Env {
  const env = toApiEnv(RawEnvSchema.parse(source));
  exposeDatabaseUrlForDbPackage(env.databaseUrl);
  return env;
}

const env = parseApiEnv(process.env);

export default env;
