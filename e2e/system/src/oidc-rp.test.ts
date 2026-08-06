import { Buffer } from "node:buffer";
import { describe, expect, test } from "bun:test";
import {
  createPkceS256Pair,
  deriveS256CodeChallenge,
  receiveOidcAuthorizationCallback,
} from "./oidc-rp.ts";

describe("test-owned OIDC RP helper", () => {
  test("derives the RFC 7636 S256 challenge", () => {
    expect(deriveS256CodeChallenge(
      "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    )).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("generates an unpadded base64url verifier and its S256 challenge", () => {
    expect(createPkceS256Pair(() => Buffer.alloc(32))).toEqual({
      verifier: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      challenge: "DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo",
    });
  });

  test("receives only the registered callback with the matching state", () => {
    const callback = receiveOidcAuthorizationCallback(
      "http://127.0.0.1:43123/e2e/oidc/callback?code=issued-code&state=expected-state",
      {
        redirectUri: "http://127.0.0.1:43123/e2e/oidc/callback",
        state: "expected-state",
      },
    );

    expect(callback).toEqual({ code: "issued-code" });
    expect(() => receiveOidcAuthorizationCallback(
      "http://127.0.0.1:43123/e2e/oidc/other?code=issued-code&state=expected-state",
      {
        redirectUri: "http://127.0.0.1:43123/e2e/oidc/callback",
        state: "expected-state",
      },
    )).toThrow("registered OIDC callback");
    expect(() => receiveOidcAuthorizationCallback(
      "http://127.0.0.1:43123/e2e/oidc/callback?code=issued-code&state=wrong-state",
      {
        redirectUri: "http://127.0.0.1:43123/e2e/oidc/callback",
        state: "expected-state",
      },
    )).toThrow("OIDC callback state");
  });
});
