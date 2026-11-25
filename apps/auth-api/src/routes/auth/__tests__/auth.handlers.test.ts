import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createRootAuthHandlers } from "@auth-api/routes/auth/auth.handlers";
import * as resp from "@iam/api-core/http";

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
function createHandlers() {
  return createRootAuthHandlers({
    authentication: {
      loginWithMobile: { execute: loginMobileService },
      loginWithPassword: { execute: loginPasswordService },
    },
    loginCredentialParser: { parseLoginPasswordCredential },
    config: { userSessionTtlSeconds: 3600 },
  });
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
          Client: "iam",
          traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
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
    get: mock((key: string) => (key === "requestId" ? "req-1" : undefined)),
  };
}

function makeMobileLoginContext() {
  const context = makeLoginContext();
  return {
    ...context,
    req: {
      ...context.req,
      raw: new Request("https://iam.example.test/auth/login/mobile"),
      valid: mock(() => ({
        capToken: "cap-token",
        code: "123456",
        phoneNumber: "17721462865",
      })),
      path: "/auth/login/mobile",
    },
  };
}

beforeEach(() => {
  parseLoginPasswordCredential.mockClear();
  loginPasswordService.mockClear();
  loginMobileService.mockClear();
});

describe("authentication HTTP handlers", () => {
  test("password login decrypts credential before calling the use case", async () => {
    const handlers = createHandlers();
    const context = makeLoginContext();

    const result: unknown = await handlers.loginPassword(context as never, undefined as never);

    expect(result).toEqual(
      resp.ok({
        token: "session-id",
        isMobileSet: true,
      }),
    );

    expect(parseLoginPasswordCredential).toHaveBeenCalledWith("iam-login-v1.payload");
    expect(loginPasswordService).toHaveBeenCalledWith(
      {
        capToken: "cap-token",
        password: "1234",
        username: "138550",
      },
      {
        requestContext: {
          sourceApp: "auth-api",
          requestId: "req-1",
          traceId: "11111111111111111111111111111111",
          ip: "203.0.113.9",
          userAgent: "api-handler-test",
          route: "/auth/login/password",
          method: "POST",
        },
      },
    );
    expect(context.responseHeaders[0]?.[0]).toBe("Set-Cookie");
    expect(context.responseHeaders[0]?.[1]).toContain("global_session=session-id");
  });

  test("password login stops before the workflow when credential parsing fails", async () => {
    const handlers = createHandlers();
    const context = makeLoginContext();
    parseLoginPasswordCredential.mockRejectedValueOnce(new Error("登录凭证无效"));

    await expect(handlers.loginPassword(context as never, undefined as never)).rejects.toThrow("登录凭证无效");

    expect(loginPasswordService).not.toHaveBeenCalled();
    expect(context.responseHeaders).toHaveLength(0);
  });

  test("mobile login dispatches validated input and writes the global session cookie", async () => {
    const handlers = createHandlers();
    const context = makeMobileLoginContext();

    const result: unknown = await handlers.loginMobile(context as never, undefined as never);

    expect(result).toEqual(
      resp.ok({
        token: "mobile-session-id",
        isMobileSet: true,
      }),
    );
    expect(loginMobileService).toHaveBeenCalledWith(
      {
        capToken: "cap-token",
        code: "123456",
        phoneNumber: "17721462865",
      },
      {
        requestContext: expect.objectContaining({
          requestId: "req-1",
          route: "/auth/login/mobile",
        }),
      },
    );
    expect(context.responseHeaders[0]?.[0]).toBe("Set-Cookie");
    expect(context.responseHeaders[0]?.[1]).toContain("global_session=mobile-session-id");
  });
});
