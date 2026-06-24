import { ApiErrorCode } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createSsoHandlers } from "../sso.handlers";

const logger = {
  warn: mock(() => undefined),
};

function createHandlers() {
  return createSsoHandlers({
    clientService: {
      getClientByCode: mock(async () => null),
    },
    logger,
    sessionService: {
      getGlobalSessionIdByLocalSession: mock(async () => null),
    },
    ssoService: {
      authorize: mock(async () => ({ isLogin: false, code: null })),
      callback: mock(async () => ({ token: "local-session", orcasSessionId: null })),
      loginOA: mock(async () => ({ token: "global-session", isMobileSet: true })),
      loginWX: mock(async () => ({ token: "global-session", isMobileSet: true })),
      logout: mock(async () => true),
      setToken: mock(async () => ({ sid: "local-session", ttl: 3600, userInfo: {} })),
    },
    config: {
      authCodeExpireSeconds: 60,
      authorizationEndpoint: "/sso/authorize",
      loginEndpoint: "/login",
      logoutEndpoint: "/sso/logout",
      redisExpireSeconds: 3600,
      ssoExternalOrigin: "https://iam.example.com/",
      ssoInternalOrigin: "https://iam.internal.example.com/",
      thirdPartyOAEndpoint: "/sso/thirdparty/oa",
    },
  } as any);
}

function createContext(entryNetwork?: string) {
  return {
    req: {
      header: mock((name: string) => name.toLowerCase() === "x-iam-entry-network" ? entryNetwork : undefined),
      raw: new Request("https://untrusted.example.test/sso/.well-known/authentication-configuration"),
      url: "https://untrusted.example.test/sso/.well-known/authentication-configuration",
    },
    json: mock((body: unknown, status = 200) => ({ body, status })),
  };
}

beforeEach(() => {
  logger.warn.mockClear();
});

describe("createSsoHandlers endpointsConfiguration", () => {
  test("returns external endpoints for external entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("external");

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          authorizationEndpoint: "https://iam.example.com/sso/authorize",
          logoutEndpoint: "https://iam.example.com/sso/logout",
          thirdPartyOAEndpoint: "https://iam.example.com/sso/thirdparty/oa",
        },
      },
    });

    expect(context.json.mock.calls[0]?.[0]).not.toHaveProperty("entryNetwork");
    expect(context.json.mock.calls[0]?.[0]).not.toHaveProperty("data.entryNetwork");
  });

  test("returns internal endpoints for internal entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("internal");

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          authorizationEndpoint: "https://iam.internal.example.com/sso/authorize",
          logoutEndpoint: "https://iam.internal.example.com/sso/logout",
          thirdPartyOAEndpoint: "https://iam.internal.example.com/sso/thirdparty/oa",
        },
      },
    });
  });

  test("rejects missing entry network", async () => {
    const handlers = createHandlers();
    const context = createContext();

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: undefined }, "invalid sso entry network header");
  });

  test("rejects invalid entry network", async () => {
    const handlers = createHandlers();
    const context = createContext("private");

    await expect(handlers.endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: "private" }, "invalid sso entry network header");
  });
});
