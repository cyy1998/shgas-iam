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
    IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_SECRET: "c".repeat(32),
  };
}

describe("oIDC provider environment", () => {
  it("accepts a same-origin /oidc issuer", () => {
    const env = parseOidcProviderEnv(validEnv());
    assert.equal(env.oidc.issuer, "https://iam.example.com/oidc");
    assert.equal(env.oidc.authorizationCodeTtlSeconds, 300);
    assert.equal(env.log.format, "auto");
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

  it("requires previous Session Kernel HMAC id and secret to be configured together", () => {
    const env = parseOidcProviderEnv({
      ...validEnv(),
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID: "",
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: "",
    });
    assert.equal(env.sessionKernel.lookupHmacPreviousId, undefined);
    assert.equal(env.sessionKernel.lookupHmacPreviousSecret, undefined);

    assert.throws(() => parseOidcProviderEnv({
      ...validEnv(),
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID: "previous",
    }), /must be configured together/);
    assert.throws(() => parseOidcProviderEnv({
      ...validEnv(),
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: "p".repeat(32),
    }), /must be configured together/);
  });

  it("rejects ambiguous previous Session Kernel HMAC rotation config", () => {
    const duplicateId = parseOidcProviderEnv({
      ...validEnv(),
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_CURRENT_ID: "same",
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID: "same",
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: "p".repeat(32),
    });
    assert.throws(() => createOidcProviderSessionKernelConfig(duplicateId), /ids must be different/);

    const duplicateSecret = parseOidcProviderEnv({
      ...validEnv(),
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_ID: "previous",
      IAM_OIDC_PROVIDER_SESSION_LOOKUP_HMAC_PREVIOUS_SECRET: "c".repeat(32),
    });
    assert.throws(() => createOidcProviderSessionKernelConfig(duplicateSecret), /secrets must be different/);
  });
});
