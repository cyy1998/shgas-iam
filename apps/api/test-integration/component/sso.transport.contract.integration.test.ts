import type { AuthorizeSsoResult } from "@api/use-cases/sso/authorize-sso/authorize-sso.type";
import { createSsoHandlers } from "@api/routes/sso/sso.handlers";
import { createSsoRoute } from "@api/routes/sso/sso.index";
import {
  encodeCustomSsoClientCode,
} from "@api/services/sso/custom-sso-client-code.transport";
import createApp from "@iam/api-core/core/create-app";
import { defineConfig } from "@iam/api-core/core/define-config";
import { InvalidRedirectUriError } from "@iam/api-core/errors/InvalidRedirectUriError";
import { SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import {
  ApiErrorCode,
  CustomSsoClientMode,
  LoginPageGuardDecision,
} from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import pino from "pino";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";

function createMemoryLogger(lines: unknown[]) {
  const stream = {
    write(line: string) {
      lines.push(JSON.parse(line));
    },
  };
  return pino({ level: "info" }, stream).child({ sourceApp: "iam-api-test" });
}

function createHarness() {
  const logs: unknown[] = [];
  const logger = createMemoryLogger(logs);
  const authorize = mock(async (input: {
    clientCode: string;
    redirectUrl: string;
    state?: string;
  }): Promise<AuthorizeSsoResult> => ({
    isLogin: true as const,
    code: "auth-code",
    callbackEndpoint: "https://client.example.com/sso/callback",
    clientCode: input.clientCode,
    mode: CustomSsoClientMode.Independent,
    redirectUrl: input.redirectUrl,
    ...(input.state === undefined ? {} : { state: input.state }),
  }));
  const exchangeCode = mock(async () => ({
    sid: "iam_ls_opaque",
    ttl: 3600,
    subject: {
      version: 1 as const,
      subjectIdentifier,
    },
  }));
  const completeCallback = mock(async () => ({
    token: "gateway-token",
    orcasSessionId: null,
  } as {
    token: string;
    orcasSessionId: string | null;
    state?: string;
  }));
  const loginWithOa = mock(async () => ({
    token: "principal-token",
    isMobileSet: true,
  }));
  const loginWithWechat = mock(async () => ({
    token: "principal-token",
    isMobileSet: true,
  }));
  const checkLoginContinuation = mock(async () => ({
    clearGlobalSessionCookie: false,
    decision: LoginPageGuardDecision.Continue,
  }));
  const handlers = createSsoHandlers({
    logger,
    sso: {
      authorize: { execute: authorize },
      checkLoginContinuation: { execute: checkLoginContinuation },
      completeCallback: {
        execute: completeCallback,
      },
      exchangeCode: { execute: exchangeCode },
      loginWithOa: {
        execute: loginWithOa,
      },
      loginWithWechat: {
        execute: loginWithWechat,
      },
      logout: { execute: mock(async () => true as const) },
    },
    config: {
      authCodeExpireSeconds: 60,
      authorizationEndpoint: "/sso/authorize",
      loginEndpoint: "/login",
      logoutEndpoint: "/sso/logout",
      projectionRetryAfterSeconds: 3,
      redisExpireSeconds: 3600,
      ssoExternalOrigin: "https://iam.example.com",
      ssoInternalOrigin: "https://iam.internal.example.com",
      thirdPartyOAEndpoint: "/sso/thirdparty/oa",
    },
  });
  const app = createApp(defineConfig({
    prefix: "",
    openapi: { enabled: true, docEndpoint: "/doc" },
    tiers: [{ name: "sso", title: "SSO" }],
  }), {
    env: { NODE_ENV: "test" },
    logger,
    routes: {
      "src/routes/sso/sso.index.ts": {
        default: createSsoRoute(handlers),
      },
    },
    middlewares: {},
  });
  return {
    app,
    authorize,
    checkLoginContinuation,
    completeCallback,
    exchangeCode,
    loginWithOa,
    loginWithWechat,
    logs,
  };
}

function tokenRequest(options: {
  authorization?: string;
  contentType?: string;
  body?: BodyInit;
} = {}) {
  return {
    method: "POST",
    headers: {
      "Authorization": options.authorization
        ?? `Basic ${Buffer.from("independent:custom-secret").toString("base64")}`,
      "Content-Type": options.contentType
        ?? "application/x-www-form-urlencoded",
    },
    body: options.body ?? new URLSearchParams({
      code: "auth-code",
      redirect_uri: "https://client.example.com/callback",
    }),
  };
}

describe("Custom SSO HTTP transport contract", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  test("exposes a narrow login continuation guard contract", async () => {
    const response = await harness.app.request(
      "/sso/login-guard?client=independent&redirectUrl=https%3A%2F%2Fclient.example.com%2Fcallback",
      { headers: { Cookie: "global_session=principal-token" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: 200,
      data: { decision: LoginPageGuardDecision.Continue },
      message: "success",
    });
    expect(harness.checkLoginContinuation).toHaveBeenCalledWith({
      clientCode: "independent",
      globalSessionToken: "principal-token",
      redirectUrl: "https://client.example.com/callback",
    });
  });

  test("accepts only Basic plus form and returns the narrow V1 response", async () => {
    const response = await harness.app.request("/sso/token", tokenRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: 200,
      message: "success",
      data: {
        sid: "iam_ls_opaque",
        ttl: 3600,
        subject: {
          version: 1,
          subjectIdentifier,
        },
      },
    });
    expect(harness.exchangeCode).toHaveBeenCalledWith({
      clientCode: "independent",
      clientSecret: "custom-secret",
      code: "auth-code",
      redirectUri: "https://client.example.com/callback",
    }, {
      requestContext: expect.objectContaining({
        method: "POST",
        route: "/sso/token",
      }),
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(JSON.stringify(harness.logs)).not.toContain("custom-secret");
  });

  test("decodes a transport-safe Basic username back to an opaque Client Code", async () => {
    const response = await harness.app.request(
      "/sso/token",
      tokenRequest({
        authorization: `Basic ${Buffer.from(
          "legacy%3Aclient:custom-secret",
        ).toString("base64")}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCode: "legacy:client",
        clientSecret: "custom-secret",
      }),
      expect.any(Object),
    );
  });

  test("keeps literal percent escapes distinct in Basic usernames", async () => {
    const response = await harness.app.request(
      "/sso/token",
      tokenRequest({
        authorization: `Basic ${Buffer.from(
          "legacy%253Aclient:custom-secret",
        ).toString("base64")}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCode: "legacy%3Aclient",
      }),
      expect.any(Object),
    );
  });

  test("accepts a database-valid non-BMP Client Code through Basic transport", async () => {
    const clientCode = "😀".repeat(33);
    const response = await harness.app.request(
      "/sso/token",
      tokenRequest({
        authorization: `Basic ${Buffer.from(
          `${encodeCustomSsoClientCode(clientCode)}:custom-secret`,
        ).toString("base64")}`,
      }),
    );

    expect(response.status).toBe(200);
    expect(harness.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCode,
        clientSecret: "custom-secret",
      }),
      expect.any(Object),
    );
  });

  test("sets an encoded local-session cookie for an opaque Client Code", async () => {
    const callbackUrl = new URL("http://localhost/sso/callback");
    callbackUrl.searchParams.set("client", "legacy:client/中文");
    callbackUrl.searchParams.set("code", "auth-code");
    callbackUrl.searchParams.set(
      "redirectUrl",
      "https://gateway.example.com/callback",
    );

    const response = await harness.app.request(callbackUrl);

    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "local_legacy%3Aclient%2F%E4%B8%AD%E6%96%87_session=gateway-token",
        ),
      ]),
    );
    expect(harness.completeCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        clientCode: "legacy:client/中文",
      }),
      expect.any(Object),
    );
  });

  test("sets a safe local-session cookie for a database-valid non-BMP Client Code", async () => {
    const clientCode = "😀".repeat(33);
    const callbackUrl = new URL("http://localhost/sso/callback");
    callbackUrl.searchParams.set("client", clientCode);
    callbackUrl.searchParams.set("code", "auth-code");
    callbackUrl.searchParams.set(
      "redirectUrl",
      "https://gateway.example.com/callback",
    );

    const response = await harness.app.request(callbackUrl);

    expect(response.status).toBe(302);
    expect(response.headers.getSetCookie()).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `local_${encodeCustomSsoClientCode(clientCode)}_session=gateway-token`,
        ),
      ]),
    );
    expect(harness.completeCallback).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode }),
      expect.any(Object),
    );
  });

  test("rejects GET, query parameters, JSON, and browser preflight", async () => {
    const get = await harness.app.request(
      "/sso/token?client=independent&clientSecret=query-secret&code=auth-code",
    );
    expect(get.status).toBe(404);

    const query = await harness.app.request(
      "/sso/token?clientSecret=query-secret",
      tokenRequest(),
    );
    expect(query.status).toBe(400);

    const json = await harness.app.request("/sso/token", tokenRequest({
      contentType: "application/json",
      body: JSON.stringify({
        code: "auth-code",
        redirect_uri: "https://client.example.com/callback",
      }),
    }));
    expect(json.status).toBe(422);

    const preflight = await harness.app.request("/sso/token", {
      method: "OPTIONS",
      headers: {
        "Origin": "https://browser.example",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(harness.exchangeCode).not.toHaveBeenCalled();
    expect(JSON.stringify(harness.logs)).not.toContain("query-secret");
  });

  test.each([
    ["missing", undefined],
    ["Bearer", "Bearer token"],
    ["invalid base64", "Basic !!!"],
    ["missing client", `Basic ${Buffer.from(":secret").toString("base64")}`],
    ["missing secret", `Basic ${Buffer.from("client:").toString("base64")}`],
    [
      "malformed encoded client",
      `Basic ${Buffer.from("legacy%:secret").toString("base64")}`,
    ],
  ])("rejects %s client authentication", async (_label, authorization) => {
    const request = tokenRequest({
      authorization: authorization ?? "",
    });
    if (authorization === undefined)
      delete (request.headers as { Authorization?: string }).Authorization;
    const response = await harness.app.request("/sso/token", request);

    expect([400, 422]).toContain(response.status);
    expect(harness.exchangeCode).not.toHaveBeenCalled();
  });

  test("maps Projection Not Ready to a stable retryable 503", async () => {
    harness.exchangeCode.mockRejectedValueOnce(
      new SubjectProjectionNotReadyError(),
    );

    const response = await harness.app.request("/sso/token", tokenRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SubjectProjectionNotReady,
      message: "主体信息暂未就绪",
      data: null,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test("maps Subject Access unavailable to the documented retryable 503", async () => {
    harness.exchangeCode.mockRejectedValueOnce(
      new SubjectAccessUnavailableError(),
    );

    const response = await harness.app.request("/sso/token", tokenRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("3");
    await expect(response.json()).resolves.toEqual({
      code: ApiErrorCode.SubjectAccessUnavailable,
      message: "账号访问状态暂时不可用",
      data: null,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  test.each([
    ["authorize", new SubjectProjectionNotReadyError()],
    ["authorize", new SubjectAccessUnavailableError()],
    ["callback", new SubjectProjectionNotReadyError()],
    ["callback", new SubjectAccessUnavailableError()],
  ] as const)(
    "maps retryable %s failures through the shared SSO transport boundary",
    async (endpoint, error) => {
      const response = endpoint === "authorize"
        ? await requestFailedAuthorize(harness, error)
        : await requestFailedCallback(harness, error);

      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("3");
      await expect(response.json()).resolves.toMatchObject({
        code: error instanceof SubjectProjectionNotReadyError
          ? ApiErrorCode.SubjectProjectionNotReady
          : ApiErrorCode.SubjectAccessUnavailable,
        data: null,
      });
      expect(response.headers.getSetCookie()).toEqual([]);
    },
  );

  test("round-trips opaque state while every ordinary HTTP log omits it", async () => {
    const state = "unique-state-sentinel !/?:&=%";
    const url = new URL("http://localhost/sso/authorize");
    url.searchParams.set("client", "independent");
    url.searchParams.set("redirectUrl", "https://client.example.com/callback");
    url.searchParams.set("state", state);

    const response = await harness.app.request(url, {
      headers: { Cookie: "global_session=principal-token" },
    });

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location")!);
    expect(location.searchParams.get("state")).toBe(state);
    expect(harness.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ state }),
      expect.any(Object),
    );
    expect(JSON.stringify(harness.logs)).not.toContain(state);
    expect(JSON.stringify(harness.logs)).not.toContain(encodeURIComponent(state));

    harness.authorize.mockRejectedValueOnce(
      new InvalidRedirectUriError("非法重定向地址"),
    );
    await harness.app.request(url, {
      headers: { Cookie: "global_session=principal-token" },
    });
    expect(JSON.stringify(harness.logs)).not.toContain(state);
    expect(JSON.stringify(harness.logs)).not.toContain(encodeURIComponent(state));
  });

  test("preserves state through login re-entry while callback trusts only Grant state", async () => {
    const state = "full-chain-state-sentinel !/?:&=%";
    const attackerState = "attacker-callback-state-sentinel";
    harness.authorize.mockResolvedValueOnce({
      isLogin: false,
      code: null,
    });
    const authorizeUrl = new URL("http://localhost/sso/authorize");
    authorizeUrl.searchParams.set("client", "independent");
    authorizeUrl.searchParams.set(
      "redirectUrl",
      "https://client.example.com/callback",
    );
    authorizeUrl.searchParams.set("state", state);

    const unauthenticated = await harness.app.request(authorizeUrl);
    expect(new URL(
      unauthenticated.headers.get("Location")!,
      "http://localhost",
    ).searchParams.get("state")).toBe(state);

    for (const path of [
      `/sso/thirdparty/oa?loginid=user&ts=1&token=signature&client=independent&redirectUrl=${encodeURIComponent("https://client.example.com/callback")}&state=${encodeURIComponent(state)}`,
      `/sso/third-party/wx?code=wechat-code&client=independent&redirectUrl=${encodeURIComponent("https://client.example.com/callback")}&state=${encodeURIComponent(state)}`,
    ]) {
      const response = await harness.app.request(path);
      const resumed = new URL(
        response.headers.get("Location")!,
        "http://localhost",
      );
      expect(resumed.pathname).toBe("/sso/authorize");
      expect(resumed.searchParams.get("state")).toBe(state);
    }

    harness.completeCallback.mockResolvedValueOnce({
      token: "gateway-token",
      orcasSessionId: null,
      state,
    });
    const callbackUrl = new URL("http://localhost/sso/callback");
    callbackUrl.searchParams.set("client", "gateway");
    callbackUrl.searchParams.set("code", "auth-code");
    callbackUrl.searchParams.set(
      "redirectUrl",
      "https://gateway.example.com/callback",
    );
    callbackUrl.searchParams.set("state", attackerState);
    const callbackResponse = await harness.app.request(callbackUrl);
    const callbackLocation = new URL(
      callbackResponse.headers.get("Location")!,
    );
    expect(callbackLocation.searchParams.get("state")).toBe(state);
    expect(harness.completeCallback).toHaveBeenCalledWith(
      expect.not.objectContaining({ state: attackerState }),
      expect.any(Object),
    );

    const observableLogs = JSON.stringify(harness.logs);
    for (const sentinel of [state, attackerState]) {
      expect(observableLogs).not.toContain(sentinel);
      expect(observableLogs).not.toContain(encodeURIComponent(sentinel));
    }
  });

  test("publishes only POST Basic/form in OpenAPI", async () => {
    const response = await harness.app.request("/sso/doc");
    const document = await response.json() as {
      components: {
        schemas: Record<string, unknown>;
        securitySchemes: Record<string, unknown>;
      };
      paths: Record<string, Record<string, unknown>>;
    };
    const tokenPath = document.paths["/sso/token"];
    if (tokenPath === undefined)
      throw new Error("expected /sso/token OpenAPI path");

    expect(tokenPath).toHaveProperty("post");
    expect(tokenPath).not.toHaveProperty("get");
    expect(tokenPath.post).toMatchObject({
      security: [{ CustomSsoBasic: [] }],
      requestBody: {
        content: {
          "application/x-www-form-urlencoded": {
            schema: {
              type: "object",
              required: ["code", "redirect_uri"],
              additionalProperties: false,
              properties: {
                code: { type: "string", minLength: 1 },
                redirect_uri: { type: "string", format: "uri" },
              },
            },
          },
        },
      },
    });
    expect(document.components.securitySchemes.CustomSsoBasic).toEqual({
      description:
        "Basic username is the UTF-8 percent-encoded Client Code; password is the Custom SSO Client Secret.",
      type: "http",
      scheme: "basic",
    });
    expect(tokenPath.post).not.toHaveProperty("parameters");
    expect(JSON.stringify(tokenPath)).not.toContain("clientSecret");
    expect(JSON.stringify(tokenPath)).not.toContain("userInfo");
    const authorizePath = document.paths["/sso/authorize"];
    const authorizeParameters = (
      authorizePath?.get as {
        parameters?: Array<{
          in: string;
          name: string;
          schema: unknown;
        }>;
      } | undefined
    )?.parameters;
    const authorizeClientParameter
      = authorizeParameters?.find(parameter =>
        parameter.in === "query" && parameter.name === "client");
    expect(authorizeClientParameter).toMatchObject({
      schema: {
        maxLength: 64,
        minLength: 1,
        type: "string",
      },
    });
    expect(authorizeClientParameter)
      .not
      .toHaveProperty("schema.pattern");
    const tokenPost = tokenPath.post as {
      responses: Record<string, unknown>;
    };
    const unavailable = tokenPost.responses["503"];
    expect(unavailable).toMatchObject({
      headers: {
        "Retry-After": {
          schema: {
            type: "string",
          },
        },
      },
    });
    const unavailableContract = JSON.stringify({
      response: unavailable,
      schema: document.components.schemas.CustomSsoUnavailableResponse,
    });
    expect(unavailableContract).toContain(ApiErrorCode.SubjectProjectionNotReady);
    expect(unavailableContract).toContain(ApiErrorCode.SubjectAccessUnavailable);
    expect(unavailableContract).toContain(ApiErrorCode.Maintenance);
    expect(unavailableContract).toContain(ApiErrorCode.InternalError);
    expect(unavailableContract).not.toContain("userInfo");
    for (const path of [
      authorizePath,
      document.paths["/sso/callback"],
      document.paths["/sso/logout"],
    ]) {
      expect((path?.get as {
        responses?: Record<string, unknown>;
      } | undefined)?.responses?.["503"]).toMatchObject({
        headers: {
          "Retry-After": {
            schema: {
              type: "string",
            },
          },
        },
      });
    }
  });
});

async function requestFailedAuthorize(
  harness: ReturnType<typeof createHarness>,
  error: Error,
) {
  harness.authorize.mockRejectedValueOnce(error);
  const url = new URL("http://localhost/sso/authorize");
  url.searchParams.set("client", "independent");
  url.searchParams.set(
    "redirectUrl",
    "https://client.example.com/callback",
  );
  return await harness.app.request(url);
}

async function requestFailedCallback(
  harness: ReturnType<typeof createHarness>,
  error: Error,
) {
  harness.completeCallback.mockRejectedValueOnce(error);
  const url = new URL("http://localhost/sso/callback");
  url.searchParams.set("client", "gateway");
  url.searchParams.set("code", "auth-code");
  url.searchParams.set(
    "redirectUrl",
    "https://gateway.example.com/callback",
  );
  return await harness.app.request(url);
}
