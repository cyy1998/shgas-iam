import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { OIDC_LOG_REDACT_PATHS } from "../lib/logger.ts";

describe("OIDC logger", () => {
  it("keeps the IAM sensitive-field redact baseline", () => {
    for (const path of [
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
      assert.ok(OIDC_LOG_REDACT_PATHS.includes(path), `missing redact path: ${path}`);
    }
  });
});
