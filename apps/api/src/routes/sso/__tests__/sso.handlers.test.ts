import { ApiErrorCode } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const logger = {
  warn: mock(() => undefined),
};

mock.module("@api/env", () => ({
  default: {
    AUTHORIZATION_ENDPOINT: "/sso/authorize",
    LOGIN_ENDPOINT: "/login",
    LOGOUT_ENDPOINT: "/sso/logout",
    REDIS_EXPIRE_TIME: 3600,
    SSO_EXTERNAL_ORIGIN: "https://iam.example.com/",
    SSO_INTERNAL_ORIGIN: "https://iam.internal.example.com/",
    THIRDPARTY_OA_ENDPOINT: "/sso/thirdparty/oa",
  },
}));
mock.module("@api/lib/logger", () => ({ logger }));
mock.module("@api/services/client/client.service", () => ({}));
mock.module("@api/services/session/session.service", () => ({}));
mock.module("../sso.service", () => ({}));

const { endpointsConfiguration } = await import("../sso.handlers");

function createContext(entryNetwork?: string) {
  return {
    req: {
      header: mock((name: string) => name.toLowerCase() === "x-iam-entry-network" ? entryNetwork : undefined),
      url: "https://untrusted.example.test/sso/.well-known/authentication-configuration",
    },
    json: mock((body: unknown, status = 200) => ({ body, status })),
  };
}

beforeEach(() => {
  logger.warn.mockClear();
});

describe("SSO endpointsConfiguration handler", () => {
  test("returns external endpoints for external entry network", async () => {
    const context = createContext("external");

    await expect(endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
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
    const context = createContext("internal");

    await expect(endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
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
    const context = createContext();

    await expect(endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: undefined }, "invalid sso entry network header");
  });

  test("rejects invalid entry network", async () => {
    const context = createContext("private");

    await expect(endpointsConfiguration(context as never, async () => {})).resolves.toMatchObject({
      status: 400,
      body: {
        code: ApiErrorCode.BadRequest,
        message: "非法 SSO 入口",
      },
    });
    expect(logger.warn).toHaveBeenCalledWith({ entryNetwork: "private" }, "invalid sso entry network header");
  });
});
