import {
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { describe, expect, it, vi } from "vitest";
import { requestNeedsReauthentication } from "../../src/interaction/global-session.ts";
import { createOidcInteractionHandler } from "../../src/interaction/handler.ts";
import { validateAuthorizationRequest } from "../../src/interaction/policy.ts";
import {
  createOpaqueValue,
  secureStringEqual,
} from "../../src/interaction/return-handle.ts";
import { createOidcClientTrafficGate } from "../../src/provider/client-traffic-gate.ts";

describe("oIDC login return handle", () => {
  it("creates opaque browser binding values", () => {
    const handle = createOpaqueValue();

    expect(handle).toMatch(/^[\w-]{43}$/);
    expect(createOpaqueValue()).not.toBe(handle);
  });

  it("compares browser bindings in constant-time-safe shape", () => {
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

  it("accepts a valid authorization code request without nonce", () => {
    expect(() => validateAuthorizationRequest({ ...valid, nonce: undefined }, client)).not.toThrow();
  });
});

describe("oIDC interaction Subject Access protocol boundary", () => {
  it("temporarily blocks resume without consuming the return handle", async () => {
    const { response, result } = createNodeResponseCapture();
    const payload = {
      browserBinding: "browser-binding",
      clientId: "client-a",
      interactionUid: "interaction-a",
      oidcConfigVersion: 1,
      returnTarget: "https://issuer.example/oidc/interaction/interaction-a",
    };
    const consume = vi.fn(async () => payload);
    let trafficOutcome = "maintenance" as "enabled" | "maintenance";
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: {
        nodeEnv: "test",
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
          interactionTtlSeconds: 600,
          issuer: "https://issuer.example/oidc",
          publicOrigin: "https://issuer.example",
          ssoLoginPath: "/portal/login",
        },
      },
      globalSessions: {
        renew: vi.fn(),
        resolve: vi.fn(async () => ({
          accountId: "subject-a",
          authTime: 123,
          sessionId: "principal-a",
        })),
      },
      provider: {},
      providerSessions: { stage: vi.fn() },
      returnHandles: {
        consume,
        create: vi.fn(),
        resolveReturnHandle: vi.fn(async () => payload),
      },
      trafficGate: createOidcClientTrafficGate({
        gate: { check: async () => ({ outcome: trafficOutcome }) },
      }),
    } as never);

    await handler.handleResume({
      headers: { cookie: "oidc_interaction_binding=browser-binding" },
      url: "/oidc/resume?oidcReturn=return-handle",
    } as never, response as never);

    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "temporarily_unavailable" });
    expect(result.headers).not.toHaveProperty("set-cookie");
    expect(consume).not.toHaveBeenCalled();

    trafficOutcome = "enabled";
    const { response: recoveredResponse, result: recovered } = createNodeResponseCapture();
    await handler.handleResume({
      headers: { cookie: "oidc_interaction_binding=browser-binding" },
      url: "/oidc/resume?oidcReturn=return-handle",
    } as never, recoveredResponse as never);

    expect(recovered.statusCode).toBe(302);
    expect(recovered.headers.location).toBe("https://issuer.example/oidc/interaction/interaction-a");
    expect(consume).toHaveBeenCalledOnce();
  });

  it("returns login_required and expires the matching global cookie for a disabled subject", async () => {
    const { handler, request, response, result } = createSubjectAccessInteraction(
      new SubjectAccessSessionInvalidHttpError(),
      "global_session=principal-token",
    );

    await handler.handleInteraction(request, response);

    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "login_required" });
    expect(result.headers["set-cookie"]).toMatch(
      /^global_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT$/u,
    );
  });

  it("returns temporarily_unavailable without clearing cookies or leaking the cause", async () => {
    const secret = "redis://admin:secret@private-host";
    const unavailable = new SubjectAccessUnavailableError(new Error(secret));
    const { handler, request, response, result } = createSubjectAccessInteraction(
      unavailable,
      "global_session=principal-token",
    );

    await handler.handleInteraction(request, response);

    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "temporarily_unavailable" });
    expect(result.headers).not.toHaveProperty("set-cookie");
    expect(result.body).not.toContain(secret);
  });
});

describe("oIDC interaction browser binding cookie", () => {
  it("temporarily blocks maintenance before creating a return handle", async () => {
    const { response, result } = createNodeResponseCapture();
    const resolveSession = vi.fn(async () => null);
    const createReturnHandle = vi.fn(async () => "return-handle");
    const stageBinding = vi.fn();
    const handler = createOidcInteractionHandler({
      clients: {
        findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })),
      },
      env: {
        nodeEnv: "test",
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
          interactionTtlSeconds: 600,
          issuer: "https://issuer.example/oidc",
          publicOrigin: "https://issuer.example",
          ssoLoginPath: "/portal/login",
        },
      },
      globalSessions: {
        renew: vi.fn(),
        resolve: resolveSession,
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
      },
      providerSessions: { stage: stageBinding },
      returnHandles: {
        consume: vi.fn(),
        create: createReturnHandle,
      },
      trafficGate: createOidcClientTrafficGate({
        gate: { check: async () => ({ outcome: "maintenance" }) },
      }),
    } as never);

    await handler.handleInteraction(
      { headers: {}, url: "/oidc/interaction/interaction-a" } as never,
      response as never,
    );

    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "temporarily_unavailable" });
    expect(result.headers).not.toHaveProperty("set-cookie");
    expect(resolveSession).not.toHaveBeenCalled();
    expect(stageBinding).not.toHaveBeenCalled();
    expect(createReturnHandle).not.toHaveBeenCalled();
  });

  it("honors the explicit local HTTP cookie setting while retaining the OIDC path contract", async () => {
    const { response, result } = createNodeResponseCapture();
    const handler = createOidcInteractionHandler({
      clients: {
        findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })),
      },
      env: {
        nodeEnv: "production",
        oidc: {
          cookieSecure: false,
          globalSessionCookie: "global_session",
          interactionTtlSeconds: 600,
          issuer: "http://127.0.0.1:43123/oidc",
          publicOrigin: "http://127.0.0.1:43123",
          ssoLoginPath: "/portal/login",
        },
      },
      globalSessions: {
        renew: vi.fn(),
        resolve: vi.fn(async () => null),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
      },
      providerSessions: {
        stage: vi.fn(),
      },
      returnHandles: {
        consume: vi.fn(),
        create: vi.fn(async () => "return-handle"),
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    await handler.handleInteraction(
      { headers: {}, url: "/oidc/interaction/interaction-a" } as never,
      response as never,
    );

    expect(result.statusCode).toBe(302);
    expect(result.headers["set-cookie"]).toMatch(
      /^oidc_interaction_binding=[\w-]{43}; Path=\/oidc; HttpOnly; SameSite=Lax; Max-Age=600$/u,
    );
  });
});

function createSubjectAccessInteraction(error: Error, cookie: string) {
  const { response, result } = createNodeResponseCapture();
  const request = {
    headers: { cookie },
    url: "/oidc/interaction/interaction-a",
  };
  const handler = createOidcInteractionHandler({
    clients: {
      findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })),
    },
    env: {
      nodeEnv: "test",
      oidc: {
        cookieSecure: false,
        globalSessionCookie: "global_session",
        interactionTtlSeconds: 600,
        issuer: "https://issuer.example/oidc",
        publicOrigin: "https://issuer.example",
        ssoLoginPath: "/portal/login",
      },
    },
    globalSessions: {
      renew: vi.fn(),
      resolve: vi.fn(async () => {
        throw error;
      }),
    },
    provider: {
      interactionDetails: vi.fn(async () => ({
        params: { client_id: "client-a" },
        prompt: { name: "login" },
        uid: "interaction-a",
      })),
    },
    providerSessions: {
      stage: vi.fn(),
    },
    returnHandles: {
      consume: vi.fn(),
      create: vi.fn(),
    },
    trafficGate: { assertIssuanceAllowed: async () => undefined },
  } as never);
  return {
    handler,
    request: request as never,
    response: response as never,
    result,
  };
}

function createNodeResponseCapture() {
  const result = {
    body: "",
    headers: {} as Record<string, string>,
    statusCode: 200,
  };
  const response = {
    end(body = "") {
      result.body = String(body);
      result.statusCode = response.statusCode;
    },
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
    },
    statusCode: 200,
  };
  return { response, result };
}
