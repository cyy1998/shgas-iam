import { z } from "@hono/zod-openapi";
import { isRootRelativeNavigation } from "@iam/contracts";
import { booleanString, optionalNonEmptyString } from "@iam/runtime/env-schema";
import { redisUrlString } from "@iam/runtime/redis/config";

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

const RawEnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  IAM_SSO_API_WECHAT_QR_ENABLED: booleanString(false),
  IAM_SSO_API_DATABASE_URL: z.string().min(1),
  IAM_SSO_API_CUSTOM_SSO_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_SSO_API_AUTH_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  IAM_SSO_API_PORT: z.coerce.number().int().min(1).max(65535).default(30002),
  IAM_SSO_API_HOSTNAME: optionalNonEmptyString(),
  IAM_SSO_API_REDIS_URL: redisUrlString(),
  IAM_SSO_API_LOGIN_ENDPOINT: z
    .string()
    .refine(isRootRelativeNavigation, {
      message: "IAM_SSO_API_LOGIN_ENDPOINT must be a safe root-relative path",
    })
    .default("/portal/login"),
  IAM_SSO_API_SSO_INTERNAL_ORIGIN: originString(),
  IAM_SSO_API_SSO_EXTERNAL_ORIGIN: originString(),
  IAM_SSO_API_AUTHORIZATION_ENDPOINT: z.string().min(1).default("/sso/authorize"),
  IAM_SSO_API_LOGOUT_ENDPOINT: z.string().min(1).default("/sso/logout"),
  IAM_SSO_API_THIRDPARTY_OA_ENDPOINT: z.string().min(1).default("/sso/thirdparty/oa"),
  IAM_SSO_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS: z.coerce.number().int().positive().default(3),
  IAM_SSO_API_LOG_LEVEL: z.string().default("info"),
  IAM_SSO_API_LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  IAM_SSO_API_SESSION_KERNEL_NAMESPACE: z
    .string()
    .regex(/^[\w:-]+$/u)
    .default("iam:session"),
  IAM_SSO_API_USER_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_SSO_API_CLIENT_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(86400),
  IAM_SSO_API_OIDC_CURRENT_JWK_JSON: z.string().min(1),
  IAM_SSO_API_OIDC_PREVIOUS_JWK_JSON: optionalNonEmptyString(),
  IAM_SSO_API_OIDC_NAMESPACE: z
    .string()
    .regex(/^[\w:-]+$/u)
    .default("iam:oidc"),
  IAM_SSO_API_OIDC_TRUST_PROXY: booleanString(true),
  IAM_SSO_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  IAM_SSO_API_OIDC_CONTINUATION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  IAM_SSO_API_OIDC_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  IAM_SSO_API_OIDC_LOGOUT_CONFIRMATION_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  IAM_SSO_API_OIDC_COOKIE_SECURE: z
    .string()
    .optional()
    .transform((value) =>
      value === undefined || value.trim() === ""
        ? undefined
        : ["1", "true", "yes", "on"].includes(value.trim().toLowerCase()),
    ),
});

export type Env = ReturnType<typeof parseSsoApiEnv>;

export function parseSsoApiEnv(source: NodeJS.ProcessEnv) {
  const raw = RawEnvSchema.parse(source);
  return {
    databaseUrl: raw.IAM_SSO_API_DATABASE_URL,
    port: raw.IAM_SSO_API_PORT,
    hostname: raw.IAM_SSO_API_HOSTNAME,
    nodeEnv: raw.NODE_ENV,
    redis: raw.IAM_SSO_API_REDIS_URL,
    log: { level: raw.IAM_SSO_API_LOG_LEVEL, format: raw.IAM_SSO_API_LOG_FORMAT },
    wechatQrEnabled: raw.IAM_SSO_API_WECHAT_QR_ENABLED,
    customSso: {
      authCodeTtlSeconds: raw.IAM_SSO_API_AUTH_CODE_TTL_SECONDS,
      tokenTtlSeconds: raw.IAM_SSO_API_CUSTOM_SSO_TOKEN_TTL_SECONDS,
      projectionRetryAfterSeconds: raw.IAM_SSO_API_CUSTOM_SSO_PROJECTION_RETRY_AFTER_SECONDS,
    },
    sessionKernel: {
      namespace: raw.IAM_SSO_API_SESSION_KERNEL_NAMESPACE,
      userSessionTtlSeconds: raw.IAM_SSO_API_USER_SESSION_TTL_SECONDS,
      clientSessionTtlSeconds: raw.IAM_SSO_API_CLIENT_SESSION_TTL_SECONDS,
    },
    oidc: {
      currentJwkJson: raw.IAM_SSO_API_OIDC_CURRENT_JWK_JSON,
      previousJwkJson: raw.IAM_SSO_API_OIDC_PREVIOUS_JWK_JSON,
      namespace: raw.IAM_SSO_API_OIDC_NAMESPACE,
      trustProxy: raw.IAM_SSO_API_OIDC_TRUST_PROXY,
      authorizationCodeTtlSeconds: raw.IAM_SSO_API_OIDC_AUTHORIZATION_CODE_TTL_SECONDS,
      continuationTtlSeconds: raw.IAM_SSO_API_OIDC_CONTINUATION_TTL_SECONDS,
      tokenTtlSeconds: raw.IAM_SSO_API_OIDC_TOKEN_TTL_SECONDS,
      logoutConfirmationTtlSeconds: raw.IAM_SSO_API_OIDC_LOGOUT_CONFIRMATION_TTL_SECONDS,
      cookieSecure: raw.IAM_SSO_API_OIDC_COOKIE_SECURE ?? raw.NODE_ENV === "production",
    },
    sso: {
      loginEndpoint: raw.IAM_SSO_API_LOGIN_ENDPOINT,
      internalOrigin: raw.IAM_SSO_API_SSO_INTERNAL_ORIGIN,
      externalOrigin: raw.IAM_SSO_API_SSO_EXTERNAL_ORIGIN,
      authorizationEndpoint: raw.IAM_SSO_API_AUTHORIZATION_ENDPOINT,
      logoutEndpoint: raw.IAM_SSO_API_LOGOUT_ENDPOINT,
      thirdPartyOAEndpoint: raw.IAM_SSO_API_THIRDPARTY_OA_ENDPOINT,
    },
  };
}
