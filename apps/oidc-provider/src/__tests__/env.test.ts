import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseOidcProviderEnv } from "../env.ts";

function validEnv(): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: "postgresql://iam:password@localhost/iam",
    REDIS_URL: "localhost",
    OIDC_ISSUER: "https://iam.example.com/oidc",
    OIDC_PUBLIC_ORIGIN: "https://iam.example.com",
    OIDC_COOKIE_KEYS: `${"a".repeat(32)},${"b".repeat(32)}`,
    OIDC_CURRENT_JWK_JSON: "{}",
    SESSION_LOOKUP_HMAC_CURRENT_SECRET: "c".repeat(32),
  };
}

describe("oIDC provider environment", () => {
  it("accepts a same-origin /oidc issuer", () => {
    const env = parseOidcProviderEnv(validEnv());
    assert.equal(env.OIDC_ISSUER, "https://iam.example.com/oidc");
    assert.equal(env.OIDC_AUTHORIZATION_CODE_TTL_SECONDS, 300);
    assert.equal(env.LOG_FORMAT, "auto");
  });

  it("accepts only known LOG_FORMAT values", () => {
    const env = parseOidcProviderEnv({ ...validEnv(), LOG_FORMAT: "pretty" });
    assert.equal(env.LOG_FORMAT, "pretty");

    assert.throws(() => parseOidcProviderEnv({ ...validEnv(), LOG_FORMAT: "text" }), /LOG_FORMAT/);
  });

  it("rejects an issuer outside /oidc", () => {
    const source = validEnv();
    source.OIDC_ISSUER = "https://iam.example.com/auth";
    assert.throws(() => parseOidcProviderEnv(source), /OIDC_ISSUER must use the \/oidc path/);
  });

  it("rejects a public origin that differs from the issuer", () => {
    const source = validEnv();
    source.OIDC_PUBLIC_ORIGIN = "https://login.example.com";
    assert.throws(() => parseOidcProviderEnv(source), /must use the same origin/);
  });

  it("requires two sufficiently long cookie keys", () => {
    const source = validEnv();
    source.OIDC_COOKIE_KEYS = "short";
    assert.throws(() => parseOidcProviderEnv(source), /at least two comma-separated keys/);
  });
});
