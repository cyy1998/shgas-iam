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

const RawEnvSchema = z.object({
  IAM_API_DATABASE_URL: z.string().min(1),
  IAM_API_PASSWORD_HASH_ROUNDS: z.coerce.number().int().positive().default(10),
  IAM_API_SMS_SIGNATURE_KEY: z.string().min(1),
  IAM_API_SMS_URL: z.string().min(1),
  IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
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
  IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS:
    z.coerce.number().int().positive().default(3),
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
  IAM_API_SESSION_KERNEL_NAMESPACE: z.string().regex(/^[\w:-]+$/u).default("iam:session"),
  IAM_API_USER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_API_CLIENT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_API_OIDC_ISSUER: z.url().refine(value => new URL(value).pathname === "/oidc", {
    message: "IAM_API_OIDC_ISSUER must use the /oidc path",
  }),
  IAM_API_OIDC_PUBLIC_ORIGIN: z.url().refine(value => new URL(value).pathname === "/", {
    message: "IAM_API_OIDC_PUBLIC_ORIGIN must not contain a path",
  }),
  IAM_API_OIDC_CURRENT_JWK_JSON: z.string().min(1),
  IAM_API_OIDC_PREVIOUS_JWK_JSON: optionalNonEmptyString(),
  IAM_API_OIDC_NAMESPACE: z.string().regex(/^[\w:-]+$/u).default("iam:oidc"),
  IAM_API_OIDC_TRUST_PROXY: booleanString(true),
  IAM_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  IAM_API_OIDC_CONTINUATION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  IAM_API_OIDC_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  IAM_API_OIDC_LOGOUT_CONFIRMATION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  IAM_API_OIDC_COOKIE_SECURE: z.string().optional().transform(value =>
    value === undefined || value.trim() === "" ? undefined : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase())),
  IAM_API_USER_PROFILE_DSL_MAX_LIMIT: z.coerce.number().int().positive().max(500).default(100),
}).superRefine((raw, ctx) => {
  if (new URL(raw.IAM_API_OIDC_ISSUER).origin !== new URL(raw.IAM_API_OIDC_PUBLIC_ORIGIN).origin) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_OIDC_ISSUER"],
      message: "IAM_API_OIDC_ISSUER and IAM_API_OIDC_PUBLIC_ORIGIN must use the same origin",
    });
  }
  if (raw.IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON[raw.IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID] === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID"],
      message: "IAM_API_LOGIN_CREDENTIAL_ACTIVE_KID must exist in IAM_API_LOGIN_CREDENTIAL_PRIVATE_KEYS_JSON",
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
    customSsoTokenTtlSeconds: number;
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
    userSessionTtlSeconds: number;
    clientSessionTtlSeconds: number;
  };
  oidc: {
    issuer: string;
    publicOrigin: string;
    currentJwkJson: string;
    previousJwkJson?: string;
    namespace: string;
    authorizationCodeTtlSeconds: number;
    trustProxy: boolean;
    continuationTtlSeconds: number;
    tokenTtlSeconds: number;
    logoutConfirmationTtlSeconds: number;
    cookieSecure: boolean;
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
    projectionRetryAfterSeconds: number;
  };
  userProfile: {
    dslMaxLimit: number;
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
      customSsoTokenTtlSeconds: raw.IAM_API_CUSTOM_SSO_TOKEN_TTL_SECONDS,
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
      userSessionTtlSeconds: raw.IAM_API_USER_SESSION_TTL_SECONDS,
      clientSessionTtlSeconds: raw.IAM_API_CLIENT_SESSION_TTL_SECONDS,
    },
    oidc: {
      issuer: raw.IAM_API_OIDC_ISSUER,
      publicOrigin: new URL(raw.IAM_API_OIDC_PUBLIC_ORIGIN).origin,
      currentJwkJson: raw.IAM_API_OIDC_CURRENT_JWK_JSON,
      previousJwkJson: raw.IAM_API_OIDC_PREVIOUS_JWK_JSON,
      namespace: raw.IAM_API_OIDC_NAMESPACE,
      trustProxy: raw.IAM_API_OIDC_TRUST_PROXY,
      authorizationCodeTtlSeconds: raw.IAM_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS,
      continuationTtlSeconds: raw.IAM_API_OIDC_CONTINUATION_TTL_SECONDS,
      tokenTtlSeconds: raw.IAM_API_OIDC_TOKEN_TTL_SECONDS,
      logoutConfirmationTtlSeconds: raw.IAM_API_OIDC_LOGOUT_CONFIRMATION_TTL_SECONDS,
      cookieSecure: raw.IAM_API_OIDC_COOKIE_SECURE ?? (raw.NODE_ENV === "production"),
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
      projectionRetryAfterSeconds:
        raw.IAM_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS,
    },
    userProfile: {
      dslMaxLimit: raw.IAM_API_USER_PROFILE_DSL_MAX_LIMIT,
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
