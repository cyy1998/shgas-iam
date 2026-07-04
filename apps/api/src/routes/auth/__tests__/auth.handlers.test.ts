import * as resp from "@iam/api-core/http";
import * as HttpStatusCodes from "@iam/api-core/core/http-status-codes";
import { ClientStatus } from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createAuthHandlers } from "../auth.handlers";

type InternalTestClient = {
  clientCode: string;
  clientSecret: string;
  isDelete: boolean;
  status: ClientStatus;
};

const parseLoginPasswordCredential = mock(async () => ({
  username: "138550",
  password: "1234",
}));
const loginPasswordService = mock(async () => ({
  token: "session-id",
  isMobileSet: true,
}));
const loginMobileService = mock(async () => ({
  token: "mobile-session-id",
  isMobileSet: true,
}));
const authzService = mock(async () => "user-info");
const getClientByCode = mock(async (_code: string): Promise<InternalTestClient | null> => null);
const getClientBySecret = mock(async (_secret: string): Promise<InternalTestClient | null> => null);
const loggerInfo = mock(() => undefined);

function createHandlers() {
  return createAuthHandlers({
    authService: {
      authz: authzService,
      loginMobile: loginMobileService,
      loginPassword: loginPasswordService,
    },
    clientService: {
      getClientByCode,
      getClientBySecret,
    },
    loginCredentialParser: {
      parseLoginPasswordCredential,
    },
    logger: {
      info: loggerInfo,
    },
    config: {
      redisExpireSeconds: 3600,
    },
  } as any);
}

function makeLoginContext() {
  const responseHeaders: unknown[][] = [];
  return {
    responseHeaders,
    req: {
      raw: new Request("https://iam.example.test/auth/login/password"),
      valid: mock(() => ({
        credential: "iam-login-v1.payload",
        capToken: "cap-token",
      })),
      header: mock((name: string) => {
        const headers: Record<string, string> = {
          "Client": "iam",
          "traceparent": "00-11111111111111111111111111111111-2222222222222222-01",
          "user-agent": "api-handler-test",
          "x-forwarded-for": "203.0.113.9",
        };
        return headers[name];
      }),
      method: "POST",
      path: "/auth/login/password",
    },
    header: mock((...args: unknown[]) => {
      responseHeaders.push(args);
    }),
    json: mock((body: unknown) => body),
    get: mock((key: string) => key === "requestId" ? "req-1" : undefined),
  };
}

function makeHeaderContext(headers: Record<string, string>) {
  return {
    req: {
      raw: new Request("https://iam.example.test/authz", {
        headers,
      }),
      header: mock((name: string) => headers[name] ?? headers[name.toLowerCase()]),
    },
    json: mock((body: unknown) => body),
    get: mock((key: string) => key === "requestId" ? "req-1" : undefined),
  };
}

beforeEach(() => {
  parseLoginPasswordCredential.mockClear();
  loginPasswordService.mockClear();
  loginMobileService.mockClear();
  authzService.mockClear();
  getClientByCode.mockClear();
  getClientBySecret.mockClear();
  loggerInfo.mockClear();
  getClientByCode.mockImplementation(async () => null);
  getClientBySecret.mockImplementation(async () => null);
});

describe("createAuthHandlers", () => {
  test("authz writes encoded user info response header", async () => {
    const handlers = createHandlers();
    const responseHeaders: unknown[][] = [];
    getClientByCode.mockImplementation(async () => ({
      clientCode: "portal",
      clientSecret: "secret-1",
      isDelete: false,
      status: ClientStatus.Enable,
    }));
    const context = {
      ...makeHeaderContext({
        "Authorization": "local-session-token",
        "Client": "portal",
        "X-Forwarded-Uri": "/app",
      }),
      header: mock((...args: unknown[]) => {
        responseHeaders.push(args);
      }),
    };

    const result: unknown = await handlers.authz(context as never, undefined as never);

    expect(result).toEqual(resp.ok("user-info"));

    expect(getClientByCode).toHaveBeenCalledWith("portal");
    expect(authzService).toHaveBeenCalledWith("local-session-token", expect.objectContaining({
      clientCode: "portal",
    }));
    expect(context.json).toHaveBeenCalledWith(resp.ok("user-info"), HttpStatusCodes.OK);
    expect(responseHeaders).toContainEqual(["X-User-Info", "user-info"]);
  });

  test("password login decrypts credential before calling auth service", async () => {
    const handlers = createHandlers();
    const context = makeLoginContext();

    const result: unknown = await handlers.loginPassword(context as never, undefined as never);

    expect(result).toEqual(resp.ok({
      token: "session-id",
      isMobileSet: true,
    }));

    expect(parseLoginPasswordCredential).toHaveBeenCalledWith("iam-login-v1.payload");
    expect(loginPasswordService).toHaveBeenCalledWith("138550", "1234", {
      capToken: "cap-token",
      requestContext: {
        sourceApp: "iam",
        requestId: "req-1",
        traceId: "11111111111111111111111111111111",
        ip: "203.0.113.9",
        userAgent: "api-handler-test",
        route: "/auth/login/password",
        method: "POST",
      },
    });
    expect(context.responseHeaders[0]?.[0]).toBe("Set-Cookie");
    expect(context.responseHeaders[0]?.[1]).toContain("global_session=session-id");
  });

  test("internal authz rejects requests without an apikey", async () => {
    const handlers = createHandlers();
    const context = makeHeaderContext({
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    await expect(handlers.internalAuthz(context as never, undefined as never)).rejects.toThrow("非法访问");

    expect(getClientBySecret).not.toHaveBeenCalled();
  });

  test("internal authz returns boolean success for an active client apikey", async () => {
    const handlers = createHandlers();
    getClientBySecret.mockImplementation(async () => ({
      clientCode: "portal",
      clientSecret: "secret-1",
      isDelete: false,
      status: ClientStatus.Enable,
    }));
    const context = makeHeaderContext({
      "apikey": "secret-1",
      "IP-Chain": "10.0.0.1, 192.168.93.10",
    });

    const result: unknown = await handlers.internalAuthz(context as never, undefined as never);

    expect(result).toEqual(resp.ok(true));

    expect(getClientBySecret).toHaveBeenCalledWith("secret-1");
  });
});
