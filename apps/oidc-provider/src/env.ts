import {
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID,
  DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
} from "@iam/session-kernel";
import { z } from "zod";

const positiveSeconds = z.coerce.number().int().positive();

function booleanString(defaultValue: boolean) {
  return z.string().optional().transform((value) => {
    if (value === undefined || value.trim() === "")
      return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });
}

function optionalBooleanString() {
  return z.string().optional().transform((value) => {
    if (value === undefined || value.trim() === "")
      return undefined;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  });
}

function optionalNonEmptyString() {
  return z.string().optional().transform(value => value?.trim() || undefined);
}

const RawOidcProviderEnvSchema = z.object({
  IAM_OIDC_PROVIDER_DATABASE_URL: z.string().min(1),
  IAM_OIDC_PROVIDER_REDIS_HOST: z.string().min(1),
  IAM_OIDC_PROVIDER_REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  IAM_OIDC_PROVIDER_REDIS_PASSWORD: optionalNonEmptyString(),
  IAM_OIDC_PROVIDER_REDIS_DB: z.coerce.number().int().min(0).default(0),
  IAM_OIDC_PROVIDER_PORT: z.coerce.number().int().min(1).max(65535).default(30002),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  IAM_OIDC_PROVIDER_LOG_LEVEL: z.string().default("info"),
  IAM_OIDC_PROVIDER_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_OIDC_PROVIDER_ISSUER: z.string().url().refine(value => new URL(value).pathname === "/oidc", {
    message: "IAM_OIDC_PROVIDER_ISSUER must use the /oidc path",
  }),
  IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: z.string().url().refine(value => new URL(value).pathname === "/", {
    message: "IAM_OIDC_PROVIDER_PUBLIC_ORIGIN must not contain a path",
  }),
  IAM_OIDC_PROVIDER_SSO_LOGIN_PATH: z.string().startsWith("/").default("/portal/login"),
  IAM_OIDC_PROVIDER_COOKIE_KEYS: z.string().transform((value, ctx) => {
    const keys = value.split(",").map(key => key.trim()).filter(Boolean);
    if (keys.length < 2 || keys.some(key => key.length < 32)) {
      ctx.addIssue({
        code: "custom",
        message: "IAM_OIDC_PROVIDER_COOKIE_KEYS must contain at least two comma-separated keys of 32 characters",
      });
      return z.NEVER;
    }
    return keys;
  }),
  IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: z.string().min(1),
  IAM_OIDC_PROVIDER_PREVIOUS_JWK_JSON: optionalNonEmptyString(),
  IAM_OIDC_PROVIDER_GLOBAL_SESSION_COOKIE: z.string().min(1).default("global_session"),
  IAM_OIDC_PROVIDER_GLOBAL_SESSION_TTL_SECONDS: positiveSeconds.default(86400),
  IAM_OIDC_PROVIDER_AUTHORIZATION_CODE_TTL_SECONDS: positiveSeconds.default(300),
  IAM_OIDC_PROVIDER_INTERACTION_TTL_SECONDS: positiveSeconds.default(600),
  IAM_OIDC_PROVIDER_ACCESS_TOKEN_TTL_SECONDS: positiveSeconds.default(3600),
  IAM_OIDC_PROVIDER_ID_TOKEN_TTL_SECONDS: positiveSeconds.default(3600),
  IAM_OIDC_PROVIDER_CLIENT_CACHE_TTL_SECONDS: positiveSeconds.default(60),
  IAM_OIDC_PROVIDER_BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),
  IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_LIMIT: z.coerce.number().int().positive().default(5),
  IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_WINDOW_SECONDS: positiveSeconds.default(60),
  IAM_OIDC_PROVIDER_TRUST_PROXY: booleanString(true),
  IAM_OIDC_PROVIDER_COOKIE_SECURE: optionalBooleanString(),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE: z.string().default("sess:v2:"),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS: positiveSeconds.optional(),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS: positiveSeconds.optional(),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS: positiveSeconds.default(86400),
  IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS: positiveSeconds.default(300),
  IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID: z.string().min(1).default(DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_ID),
  IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET: z.string().min(32).default(
    DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
  ),
  IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID: optionalNonEmptyString(),
  IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: optionalNonEmptyString(),
}).superRefine((raw, ctx) => {
  const hasPreviousId = raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID !== undefined;
  const hasPreviousSecret = raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined;
  if (hasPreviousId !== hasPreviousSecret) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID"],
      message: "IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID and IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be configured together",
    });
  }
  if (
    raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET !== undefined
    && raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET.length < 32
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET"],
      message: "IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET must be at least 32 characters",
    });
  }
  if (
    raw.NODE_ENV === "production"
    && raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET === DEFAULT_SESSION_LOOKUP_HMAC_CURRENT_SECRET
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET"],
      message: "IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET must be set in production",
    });
  }
});

type RawOidcProviderEnv = z.infer<typeof RawOidcProviderEnvSchema>;

export interface OidcProviderEnv {
  databaseUrl: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  port: number;
  nodeEnv: "development" | "test" | "production";
  log: {
    level: string;
    format: "auto" | "json" | "pretty";
  };
  oidc: {
    issuer: string;
    publicOrigin: string;
    ssoLoginPath: string;
    cookieKeys: string[];
    currentJwkJson: string;
    previousJwkJson?: string;
    globalSessionCookie: string;
    globalSessionTtlSeconds: number;
    authorizationCodeTtlSeconds: number;
    interactionTtlSeconds: number;
    accessTokenTtlSeconds: number;
    idTokenTtlSeconds: number;
    clientCacheTtlSeconds: number;
    bcryptCost: number;
    clientAuthFailureLimit: number;
    clientAuthFailureWindowSeconds: number;
    trustProxy: boolean;
    cookieSecure: boolean;
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
}

function toOidcProviderEnv(raw: RawOidcProviderEnv): OidcProviderEnv {
  return {
    databaseUrl: raw.IAM_OIDC_PROVIDER_DATABASE_URL,
    redis: {
      host: raw.IAM_OIDC_PROVIDER_REDIS_HOST,
      port: raw.IAM_OIDC_PROVIDER_REDIS_PORT,
      password: raw.IAM_OIDC_PROVIDER_REDIS_PASSWORD,
      db: raw.IAM_OIDC_PROVIDER_REDIS_DB,
    },
    port: raw.IAM_OIDC_PROVIDER_PORT,
    nodeEnv: raw.NODE_ENV,
    log: {
      level: raw.IAM_OIDC_PROVIDER_LOG_LEVEL,
      format: raw.IAM_OIDC_PROVIDER_LOG_FORMAT,
    },
    oidc: {
      issuer: raw.IAM_OIDC_PROVIDER_ISSUER,
      publicOrigin: new URL(raw.IAM_OIDC_PROVIDER_PUBLIC_ORIGIN).origin,
      ssoLoginPath: raw.IAM_OIDC_PROVIDER_SSO_LOGIN_PATH,
      cookieKeys: raw.IAM_OIDC_PROVIDER_COOKIE_KEYS,
      currentJwkJson: raw.IAM_OIDC_PROVIDER_CURRENT_JWK_JSON,
      previousJwkJson: raw.IAM_OIDC_PROVIDER_PREVIOUS_JWK_JSON,
      globalSessionCookie: raw.IAM_OIDC_PROVIDER_GLOBAL_SESSION_COOKIE,
      globalSessionTtlSeconds: raw.IAM_OIDC_PROVIDER_GLOBAL_SESSION_TTL_SECONDS,
      authorizationCodeTtlSeconds: raw.IAM_OIDC_PROVIDER_AUTHORIZATION_CODE_TTL_SECONDS,
      interactionTtlSeconds: raw.IAM_OIDC_PROVIDER_INTERACTION_TTL_SECONDS,
      accessTokenTtlSeconds: raw.IAM_OIDC_PROVIDER_ACCESS_TOKEN_TTL_SECONDS,
      idTokenTtlSeconds: raw.IAM_OIDC_PROVIDER_ID_TOKEN_TTL_SECONDS,
      clientCacheTtlSeconds: raw.IAM_OIDC_PROVIDER_CLIENT_CACHE_TTL_SECONDS,
      bcryptCost: raw.IAM_OIDC_PROVIDER_BCRYPT_COST,
      clientAuthFailureLimit: raw.IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_LIMIT,
      clientAuthFailureWindowSeconds: raw.IAM_OIDC_PROVIDER_CLIENT_AUTH_FAILURE_WINDOW_SECONDS,
      trustProxy: raw.IAM_OIDC_PROVIDER_TRUST_PROXY,
      cookieSecure: raw.IAM_OIDC_PROVIDER_COOKIE_SECURE ?? (raw.NODE_ENV === "production"),
    },
    sessionKernel: {
      namespace: raw.IAM_OIDC_PROVIDER_SESSION_KERNEL_NAMESPACE,
      principalIdleTtlSeconds: raw.IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_IDLE_TTL_SECONDS,
      principalAbsoluteTtlSeconds: raw.IAM_OIDC_PROVIDER_SESSION_KERNEL_PRINCIPAL_ABSOLUTE_TTL_SECONDS,
      tombstoneTtlSeconds: raw.IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_TTL_SECONDS,
      tombstoneGraceSeconds: raw.IAM_OIDC_PROVIDER_SESSION_KERNEL_TOMBSTONE_GRACE_SECONDS,
      lookupHmacCurrentId: raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID,
      lookupHmacCurrentSecret: raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET,
      lookupHmacPreviousId: raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID,
      lookupHmacPreviousSecret: raw.IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET,
    },
  };
}

function exposeDatabaseUrlForDbPackage(databaseUrl: string) {
  process.env.DATABASE_URL = databaseUrl;
}

export function parseOidcProviderEnv(source: NodeJS.ProcessEnv): OidcProviderEnv {
  const env = toOidcProviderEnv(RawOidcProviderEnvSchema.parse(source));
  const issuer = new URL(env.oidc.issuer);
  const publicOrigin = new URL(env.oidc.publicOrigin);
  if (issuer.origin !== publicOrigin.origin) {
    throw new Error("IAM_OIDC_PROVIDER_ISSUER and IAM_OIDC_PROVIDER_PUBLIC_ORIGIN must use the same origin");
  }
  exposeDatabaseUrlForDbPackage(env.databaseUrl);
  return env;
}
