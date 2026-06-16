import { z } from "zod";

const positiveSeconds = z.coerce.number().int().positive();

export const OidcProviderEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional().transform(value => value || undefined),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  PORT: z.coerce.number().int().min(1).max(65535).default(30002),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  LOG_FORMAT: z.enum(["auto", "json", "pretty"]).default("auto"),
  OIDC_ISSUER: z.string().url().refine(value => new URL(value).pathname === "/oidc", {
    message: "OIDC_ISSUER must use the /oidc path",
  }),
  OIDC_PUBLIC_ORIGIN: z.string().url().refine(value => new URL(value).pathname === "/", {
    message: "OIDC_PUBLIC_ORIGIN must not contain a path",
  }),
  OIDC_SSO_LOGIN_PATH: z.string().startsWith("/").default("/portal/login"),
  OIDC_COOKIE_KEYS: z.string().transform((value, ctx) => {
    const keys = value.split(",").map(key => key.trim()).filter(Boolean);
    if (keys.length < 2 || keys.some(key => key.length < 32)) {
      ctx.addIssue({
        code: "custom",
        message: "OIDC_COOKIE_KEYS must contain at least two comma-separated keys of 32 characters",
      });
      return z.NEVER;
    }
    return keys;
  }),
  OIDC_CURRENT_JWK_JSON: z.string().min(1),
  OIDC_PREVIOUS_JWK_JSON: z.string().optional().transform(value => value || undefined),
  OIDC_GLOBAL_SESSION_COOKIE: z.string().min(1).default("global_session"),
  OIDC_GLOBAL_SESSION_TTL_SECONDS: positiveSeconds.default(86400),
  OIDC_AUTHORIZATION_CODE_TTL_SECONDS: positiveSeconds.default(300),
  OIDC_INTERACTION_TTL_SECONDS: positiveSeconds.default(600),
  OIDC_ACCESS_TOKEN_TTL_SECONDS: positiveSeconds.default(3600),
  OIDC_ID_TOKEN_TTL_SECONDS: positiveSeconds.default(3600),
  OIDC_CLIENT_CACHE_TTL_SECONDS: positiveSeconds.default(60),
  OIDC_BCRYPT_COST: z.coerce.number().int().min(10).max(16).default(12),
  OIDC_CLIENT_AUTH_FAILURE_LIMIT: z.coerce.number().int().positive().default(5),
  OIDC_CLIENT_AUTH_FAILURE_WINDOW_SECONDS: positiveSeconds.default(60),
  OIDC_TRUST_PROXY: z.coerce.boolean().default(true),
});

export type OidcProviderEnv = z.infer<typeof OidcProviderEnvSchema>;

export function parseOidcProviderEnv(source: NodeJS.ProcessEnv): OidcProviderEnv {
  const env = OidcProviderEnvSchema.parse(source);
  const issuer = new URL(env.OIDC_ISSUER);
  const publicOrigin = new URL(env.OIDC_PUBLIC_ORIGIN);
  if (issuer.origin !== publicOrigin.origin) {
    throw new Error("OIDC_ISSUER and OIDC_PUBLIC_ORIGIN must use the same origin");
  }
  return env;
}
