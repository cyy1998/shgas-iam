import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { createOidcProviderSessionKernelConfig } from "../composition/session/index.ts";
import { parseOidcProviderEnv } from "../env.ts";

function validEnv(): NodeJS.ProcessEnv {
  return {
    IAM_OIDC_PROVIDER_DATABASE_URL: "postgresql://iam:password@localhost/iam",
    IAM_OIDC_PROVIDER_REDIS_HOST: "localhost",
    IAM_OIDC_PROVIDER_ISSUER: "https://iam.example.com/oidc",
    IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: "https://iam.example.com",
    IAM_OIDC_PROVIDER_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
    IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: "{}",
  };
}

describe("oIDC provider environment", () => {
  it("accepts a same-origin /oidc issuer", () => {
    const env = parseOidcProviderEnv(validEnv());
    assert.equal(env.oidc.issuer, "https://iam.example.com/oidc");
    assert.equal(env.oidc.authorizationCodeTtlSeconds, 300);
    assert.equal(env.oidc.cookieSecure, false);
    assert.equal(env.log.format, "auto");
  });

  it("defaults secure cookies for production and allows an explicit HTTP deployment override", () => {
    const secureProduction = parseOidcProviderEnv({ ...validEnv(), NODE_ENV: "production" });
    assert.equal(secureProduction.oidc.cookieSecure, true);

    const httpProduction = parseOidcProviderEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_OIDC_PROVIDER_ISSUER: "http://iam.example.com/oidc",
      IAM_OIDC_PROVIDER_PUBLIC_ORIGIN: "http://iam.example.com",
      IAM_OIDC_PROVIDER_COOKIE_SECURE: "false",
    });
    assert.equal(httpProduction.oidc.cookieSecure, false);
  });

  it("accepts only known log format values", () => {
    const env = parseOidcProviderEnv({ ...validEnv(), IAM_OIDC_PROVIDER_LOG_FORMAT: "pretty" });
    assert.equal(env.log.format, "pretty");

    assert.throws(() => parseOidcProviderEnv({ ...validEnv(), IAM_OIDC_PROVIDER_LOG_FORMAT: "text" }), /LOG_FORMAT/);
  });

  it("rejects an issuer outside /oidc", () => {
    const source = validEnv();
    source.IAM_OIDC_PROVIDER_ISSUER = "https://iam.example.com/auth";
    assert.throws(() => parseOidcProviderEnv(source), /IAM_OIDC_PROVIDER_ISSUER must use the \/oidc path/);
  });

  it("rejects a public origin that differs from the issuer", () => {
    const source = validEnv();
    source.IAM_OIDC_PROVIDER_PUBLIC_ORIGIN = "https://login.example.com";
    assert.throws(() => parseOidcProviderEnv(source), /must use the same origin/);
  });

  it("requires two sufficiently long cookie keys", () => {
    const source = validEnv();
    source.IAM_OIDC_PROVIDER_COOKIE_KEYS = "short";
    assert.throws(() => parseOidcProviderEnv(source), /at least two comma-separated keys/);
  });

  it("builds the production Session Kernel without lookup secrets", () => {
    const env = parseOidcProviderEnv({ ...validEnv(), NODE_ENV: "production" });
    const config = createOidcProviderSessionKernelConfig(env);

    assert.equal(config.namespace, "sess:v2:");
    assert.deepEqual(env.oidc.cookieKeys, ["a".repeat(32), "b".repeat(32)]);
    assert.equal(env.oidc.currentJwkJson, "{}");
  });

  it("still requires Cookie keys and a signing key in production", () => {
    assert.throws(() => parseOidcProviderEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_OIDC_PROVIDER_COOKIE_KEYS: "short",
    }), /at least two comma-separated keys/);
    assert.throws(() => parseOidcProviderEnv({
      ...validEnv(),
      NODE_ENV: "production",
      IAM_OIDC_PROVIDER_CURRENT_JWK_JSON: "",
    }), /IAM_OIDC_PROVIDER_CURRENT_JWK_JSON/);
  });
});
