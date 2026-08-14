import {
  SubjectAccessSessionInvalidHttpError,
  SubjectAccessUnavailableError,
} from "@iam/api-core/subject-access";
import { LoginPageGuardDecision } from "@iam/contracts";
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

describe("oIDC login page continuation guard", () => {
  it("finishes an existing-session reauthentication request with login_required", async () => {
    const { response } = createNodeResponseCapture();
    const request = { headers: {}, url: "/oidc/interaction/interaction-a" };
    const interactionFinished = vi.fn(async () => undefined);
    const createReturnHandle = vi.fn();
    const renew = vi.fn();
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: createInteractionEnv(),
      globalSessions: {
        inspect: vi.fn(),
        renew,
        resolve: vi.fn(async () => ({
          accountId: "subject-a",
          authTime: 123,
          sessionId: "principal-a",
        })),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a", prompt: "login" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
        interactionFinished,
      },
      providerSessions: {
        isStagedPrincipal: vi.fn(async () => false),
        stage: vi.fn(),
      },
      returnHandles: {
        consume: vi.fn(),
        create: createReturnHandle,
        resolveReturnHandle: vi.fn(),
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    await handler.handleInteraction(request as never, response as never);

    expect(interactionFinished).toHaveBeenCalledWith(
      request,
      response,
      { error: "login_required" },
      { mergeWithLastSubmission: false },
    );
    expect(createReturnHandle).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
  });

  it("accepts prompt login after this interaction completed its first authentication", async () => {
    const { response } = createNodeResponseCapture();
    const request = {
      headers: {
        cookie: "oidc_interaction_binding=browser-binding; oidc_login_completion=login-completion",
      },
      url: "/oidc/interaction/interaction-a",
    };
    const interactionFinished = vi.fn(async () => undefined);
    const renew = vi.fn(async () => true);
    const stage = vi.fn(async () => ({ bindingId: "pending" }));
    const resolveReturnHandle = vi.fn(async () => {
      throw new SubjectAccessUnavailableError(new Error("return handle unavailable"));
    });
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: createInteractionEnv(),
      globalSessions: {
        inspect: vi.fn(),
        renew,
        resolve: vi.fn(async () => ({
          accountId: "subject-a",
          authTime: 123,
          sessionId: "principal-a",
        })),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a", prompt: "login" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
        interactionFinished,
      },
      providerSessions: {
        isStagedPrincipal: vi.fn(async () => true),
        stage,
      },
      returnHandles: {
        consume: vi.fn(),
        create: vi.fn(),
        resolveReturnHandle,
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    await handler.handleInteraction(request as never, response as never);

    expect(renew).toHaveBeenCalledWith("principal-a");
    expect(stage).toHaveBeenCalledOnce();
    expect(resolveReturnHandle).not.toHaveBeenCalled();
    expect(interactionFinished).toHaveBeenCalledWith(
      request,
      response,
      {
        login: {
          accountId: "subject-a",
          amr: ["iam"],
          ts: 123,
        },
      },
    );
  });

  it("keeps login completion retryable when provider-session staging is unavailable", async () => {
    const session = {
      accountId: "subject-a",
      authTime: 123,
      sessionId: "principal-a",
    };
    const loginCompletion = {
      browserBinding: "browser-binding",
      clientId: "client-a",
      interactionUid: "interaction-a",
      oidcConfigVersion: 1,
      returnTarget: "urn:iam:oidc-login-completion",
    };
    const request = {
      headers: {
        cookie: "oidc_interaction_binding=browser-binding; oidc_login_completion=login-completion",
      },
      url: "/oidc/interaction/interaction-a",
    };
    const stage = vi.fn()
      .mockRejectedValueOnce(
        new SubjectAccessUnavailableError(new Error("session store unavailable")),
      )
      .mockResolvedValueOnce({ bindingId: "pending" });
    const consume = vi.fn(async () => loginCompletion);
    const interactionFinished = vi.fn(async () => undefined);
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: createInteractionEnv(),
      globalSessions: {
        inspect: vi.fn(),
        renew: vi.fn(async () => true),
        resolve: vi.fn(async () => session),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a", prompt: "login" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
        interactionFinished,
      },
      providerSessions: {
        isStagedPrincipal: vi.fn(async () => false),
        stage,
      },
      returnHandles: {
        consume,
        create: vi.fn(),
        resolveReturnHandle: vi.fn(async () => loginCompletion),
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    const first = createNodeResponseCapture();
    await handler.handleInteraction(request as never, first.response as never);

    expect(first.result.statusCode).toBe(503);
    expect(JSON.parse(first.result.body)).toEqual({
      error: "temporarily_unavailable",
    });
    expect(consume).not.toHaveBeenCalled();
    expect(first.result.headers).not.toHaveProperty("set-cookie");
    expect(interactionFinished).not.toHaveBeenCalled();

    const retry = createNodeResponseCapture();
    await handler.handleInteraction(request as never, retry.response as never);

    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith("login-completion");
    expect(interactionFinished).toHaveBeenCalledOnce();
    expect(retry.result.headers["set-cookie"]).toMatch(
      /^oidc_login_completion=; Path=\/oidc;/u,
    );
  });

  it.each([
    [null, LoginPageGuardDecision.Login],
    [{ accountId: "subject-a", authTime: 123, sessionId: "principal-a" }, LoginPageGuardDecision.Continue],
  ])("inspects a bound return handle without consuming or renewing it", async (session, decision) => {
    const { response, result } = createNodeResponseCapture();
    const consume = vi.fn();
    const create = vi.fn(async () => "login-completion");
    const renew = vi.fn();
    const stage = vi.fn();
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: createInteractionEnv(),
      globalSessions: {
        inspect: vi.fn(async () => session
          ? { status: "valid" }
          : { status: "absent" }),
        renew,
        resolve: vi.fn(async () => session),
      },
      interactionArtifacts: {
        find: vi.fn(async () => ({
          clientId: "client-a",
          promptName: "login",
          uid: "interaction-a",
        })),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
      },
      providerSessions: { isStagedPrincipal: vi.fn(), stage },
      returnHandles: {
        consume,
        create,
        resolveReturnHandle: vi.fn(async () => ({
          browserBinding: "browser-binding",
          clientId: "client-a",
          interactionUid: "interaction-a",
          oidcConfigVersion: 1,
          returnTarget: "https://issuer.example/oidc/resume",
        })),
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    await handler.handleLoginGuard({
      headers: { cookie: "oidc_interaction_binding=browser-binding" },
      url: "/oidc/login-guard?oidcReturn=return-handle",
    } as never, response as never);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ decision });
    expect(consume).not.toHaveBeenCalled();
    if (decision === LoginPageGuardDecision.Login)
      expect(create).toHaveBeenCalledOnce();
    else
      expect(create).not.toHaveBeenCalled();
    expect(renew).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
  });

  it("clears an explicitly invalid global session before showing login", async () => {
    const { response, result } = createNodeResponseCapture();
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn(async () => ({ oidc_config_version: 1 })) },
      env: createInteractionEnv(),
      globalSessions: {
        inspect: vi.fn(async () => ({ status: "invalid" })),
        renew: vi.fn(),
        resolve: vi.fn(),
      },
      interactionArtifacts: {
        find: vi.fn(async () => ({
          clientId: "client-a",
          promptName: "login",
          uid: "interaction-a",
        })),
      },
      provider: {},
      providerSessions: { isStagedPrincipal: vi.fn(), stage: vi.fn() },
      returnHandles: {
        consume: vi.fn(),
        create: vi.fn(async () => "login-completion"),
        resolveReturnHandle: vi.fn(async () => ({
          browserBinding: "browser-binding",
          clientId: "client-a",
          interactionUid: "interaction-a",
          oidcConfigVersion: 1,
          returnTarget: "https://issuer.example/oidc/resume",
        })),
      },
      trafficGate: { assertIssuanceAllowed: async () => undefined },
    } as never);

    await handler.handleLoginGuard({
      headers: {
        cookie: "oidc_interaction_binding=browser-binding; global_session=expired-token",
      },
      url: "/oidc/login-guard?oidcReturn=return-handle",
    } as never, response as never);

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      decision: LoginPageGuardDecision.Login,
    });
    expect(result.headers["set-cookie"]).toEqual(expect.arrayContaining([
      expect.stringMatching(
        /^global_session=; Path=\/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT$/u,
      ),
      expect.stringMatching(/^oidc_login_completion=login-completion;/u),
    ]));
  });

  it("rejects a login-completion artifact before inspecting the global session", async () => {
    const { response, result } = createNodeResponseCapture();
    const inspect = vi.fn();
    const handler = createOidcInteractionHandler({
      clients: { findRuntime: vi.fn() },
      env: createInteractionEnv(),
      globalSessions: { inspect, renew: vi.fn(), resolve: vi.fn() },
      interactionArtifacts: { find: vi.fn() },
      provider: {},
      providerSessions: { isStagedPrincipal: vi.fn(), stage: vi.fn() },
      returnHandles: {
        consume: vi.fn(),
        create: vi.fn(),
        resolveReturnHandle: vi.fn(async () => ({
          browserBinding: "browser-binding",
          clientId: "client-a",
          interactionUid: "interaction-a",
          oidcConfigVersion: 1,
          returnTarget: "urn:iam:oidc-login-completion",
        })),
      },
      trafficGate: { assertIssuanceAllowed: vi.fn() },
    } as never);

    await handler.handleLoginGuard({
      headers: { cookie: "oidc_interaction_binding=browser-binding" },
      url: "/oidc/login-guard?oidcReturn=login-completion",
    } as never, response as never);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_request" });
    expect(inspect).not.toHaveBeenCalled();
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
      returnTarget: "https://issuer.example/oidc/resume",
    };
    const consume = vi.fn(async () => payload);
    let trafficOutcome = "maintenance" as "enabled" | "maintenance";
    const interactionFinished = vi.fn(async () => undefined);
    const stage = vi.fn(async () => true);
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
        inspect: vi.fn(),
        renew: vi.fn(),
        resolve: vi.fn(async () => ({
          accountId: "subject-a",
          authTime: 123,
          sessionId: "principal-a",
        })),
      },
      interactionArtifacts: {
        find: vi.fn(async () => ({
          clientId: "client-a",
          promptName: "login",
          uid: "interaction-a",
        })),
      },
      provider: {
        interactionDetails: vi.fn(async () => ({
          params: { client_id: "client-a" },
          prompt: { name: "login" },
          uid: "interaction-a",
        })),
        interactionFinished,
      },
      providerSessions: {
        isStagedPrincipal: vi.fn(),
        stage,
      },
      returnHandles: {
        consume,
        create: vi.fn(),
        resolveReturnHandle: vi.fn(async handle => handle === "login-completion"
          ? { ...payload, returnTarget: "urn:iam:oidc-login-completion" }
          : payload),
      },
      trafficGate: createOidcClientTrafficGate({
        gate: { check: async () => ({ outcome: trafficOutcome }) },
      }),
    } as never);

    await handler.handleResume({
      headers: {
        cookie: "oidc_interaction_binding=browser-binding; oidc_login_completion=login-completion",
      },
      url: "/oidc/resume?oidcReturn=return-handle",
    } as never, response as never);

    expect(result.statusCode).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "temporarily_unavailable" });
    expect(result.headers).not.toHaveProperty("set-cookie");
    expect(consume).not.toHaveBeenCalled();

    trafficOutcome = "enabled";
    const { response: recoveredResponse, result: recovered } = createNodeResponseCapture();
    await handler.handleResume({
      headers: {
        cookie: "oidc_interaction_binding=browser-binding; oidc_login_completion=login-completion",
      },
      url: "/oidc/resume?oidcReturn=return-handle",
    } as never, recoveredResponse as never);

    expect(recovered.statusCode).toBe(302);
    expect(recovered.headers.location).toBe(
      "https://issuer.example/oidc/interaction/interaction-a",
    );
    expect(interactionFinished).not.toHaveBeenCalled();
    expect(stage).not.toHaveBeenCalled();
    expect(consume).toHaveBeenCalledOnce();
    expect(consume).toHaveBeenCalledWith("return-handle");
    expect(recovered.headers).not.toHaveProperty("set-cookie");

    stage.mockClear();
    consume.mockClear();
    const { response: continuedResponse, result: continued } = createNodeResponseCapture();
    await handler.handleResume({
      headers: { cookie: "oidc_interaction_binding=browser-binding" },
      url: "/oidc/resume?oidcReturn=return-handle",
    } as never, continuedResponse as never);

    expect(continued.statusCode).toBe(302);
    expect(stage).not.toHaveBeenCalled();
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
        inspect: vi.fn(),
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
      providerSessions: {
        isStagedPrincipal: vi.fn(),
        stage: stageBinding,
      },
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
        inspect: vi.fn(),
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
        isStagedPrincipal: vi.fn(),
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
      inspect: vi.fn(),
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
      isStagedPrincipal: vi.fn(),
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

function createInteractionEnv() {
  return {
    nodeEnv: "test",
    oidc: {
      cookieSecure: false,
      globalSessionCookie: "global_session",
      interactionTtlSeconds: 600,
      issuer: "https://issuer.example/oidc",
      publicOrigin: "https://issuer.example",
      ssoLoginPath: "/portal/login",
    },
  } as const;
}

function createNodeResponseCapture() {
  const result = {
    body: "",
    headers: {} as Record<string, string | string[]>,
    statusCode: 200,
  };
  const response = {
    end(body = "") {
      result.body = String(body);
      result.statusCode = response.statusCode;
    },
    getHeader(name: string) {
      return result.headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string | string[]) {
      result.headers[name.toLowerCase()] = value;
    },
    statusCode: 200,
  };
  return { response, result };
}
