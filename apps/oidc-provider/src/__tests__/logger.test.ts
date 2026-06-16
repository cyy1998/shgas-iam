import assert from "node:assert/strict";
import { LoggerSourceApp, mergeRedactPaths } from "@iam/api-core/logger";
import { describe, it } from "vitest";
import { createLogger, OIDC_EXTRA_LOG_REDACT_PATHS } from "../lib/logger.ts";

describe("oIDC logger", () => {
  it("keeps IAM baseline redaction and OIDC sensitive-field extensions", () => {
    const redactPaths = mergeRedactPaths(OIDC_EXTRA_LOG_REDACT_PATHS);

    for (const path of [
      "*.password",
      "*.accessToken",
      "*.idToken",
      "*.refreshToken",
      "*.authorizationCode",
      "*.clientSecret",
      "*.privateKey",
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ]) {
      assert.ok(redactPaths.includes(path), `missing redact path: ${path}`);
    }
  });

  it("uses the shared sourceApp binding", () => {
    const logger = createLogger({
      NODE_ENV: "test",
      LOG_LEVEL: "info",
      LOG_FORMAT: "json",
    });

    assert.equal(logger.bindings().sourceApp, LoggerSourceApp.OidcProvider);
  });
});
