import type { Redis } from "ioredis";
import { describe, expect, it } from "vitest";
import { requestNeedsReauthentication } from "../interaction/global-session.ts";
import { validateAuthorizationRequest } from "../interaction/policy.ts";
import {
  consumeOidcReturnHandle,
  createOidcReturnHandle,
  secureStringEqual,
} from "../interaction/return-handle.ts";

class ReturnHandleRedis {
  values = new Map<string, string>();

  async set(key: string, value: string) {
    this.values.set(key, value);
    return "OK";
  }

  async eval(_script: string, _keyCount: number, key: string) {
    const value = this.values.get(key);
    if (!value)
      return null;
    this.values.delete(key);
    return value;
  }
}

describe("oIDC login return handle", () => {
  it("is opaque and can only be consumed once", async () => {
    const redis = new ReturnHandleRedis();
    const payload = {
      interactionUid: "interaction-1",
      clientId: "client-a",
      oidcConfigVersion: 3,
      browserBinding: "binding-a",
    };
    const handle = await createOidcReturnHandle(redis as unknown as Redis, payload, 600);

    expect(handle).toMatch(/^[\w-]{43}$/);
    await expect(consumeOidcReturnHandle(redis as unknown as Redis, handle)).resolves.toEqual(payload);
    await expect(consumeOidcReturnHandle(redis as unknown as Redis, handle)).resolves.toBeNull();
  });

  it("rejects malformed handles and mismatched browser bindings", async () => {
    const redis = new ReturnHandleRedis();
    await expect(consumeOidcReturnHandle(redis as unknown as Redis, "https://evil.example/callback")).resolves.toBeNull();
    expect(secureStringEqual("binding-a", "binding-b")).toBe(false);
    expect(secureStringEqual("binding-a", "binding-a")).toBe(true);
  });
});

describe("oIDC reauthentication policy", () => {
  it("supports default prompt, prompt login, max_age, and max_age zero", () => {
    const authTime = 1_000;
    expect(requestNeedsReauthentication({}, authTime, 1_100)).toBe(false);
    expect(requestNeedsReauthentication({ prompt: "login" }, authTime, 1_001)).toBe(true);
    expect(requestNeedsReauthentication({ max_age: "200" }, authTime, 1_100)).toBe(false);
    expect(requestNeedsReauthentication({ max_age: "50" }, authTime, 1_100)).toBe(true);
    expect(requestNeedsReauthentication({ max_age: "0" }, authTime, 1_000)).toBe(true);
  });
});

describe("oIDC authorization request validation", () => {
  const client = {
    redirectUris: ["https://client.example/callback?from=iam"],
    allowed_scopes: ["openid", "profile"],
  };
  const valid = {
    state: "state",
    nonce: "nonce",
    code_challenge: "challenge",
    code_challenge_method: "S256",
    redirect_uri: client.redirectUris[0],
    scope: "openid profile",
  };

  it.each([
    [{ ...valid, state: undefined }, "state is required"],
    [{ ...valid, code_challenge: undefined }, "code_challenge is required"],
    [{ ...valid, code_challenge_method: "plain" }, "code_challenge_method must be S256"],
    [{ ...valid, redirect_uri: "https://client.example/callback" }, "redirect_uri must exactly match"],
    [{ ...valid, scope: "openid phone" }, "requested scopes are not allowed"],
  ])("rejects invalid request input", (params, message) => {
    try {
      validateAuthorizationRequest(params, client);
      throw new Error("expected validation to reject the request");
    }
    catch (error) {
      expect(error).toMatchObject({ error_description: expect.stringContaining(message) });
    }
  });

  it("accepts a complete request with exact redirect URI and allowed scopes", () => {
    expect(() => validateAuthorizationRequest(valid, client)).not.toThrow();
  });

  it("accepts authorization code requests without nonce", () => {
    expect(() => validateAuthorizationRequest({ ...valid, nonce: undefined }, client)).not.toThrow();
  });
});
