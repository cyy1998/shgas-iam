import { expect, mock, test } from "bun:test";
import { createAuthorizeSsoUseCase } from "../authorize-sso.use-case";

test("authorizes after resolving the client and validating the redirect", async () => {
  const events: string[] = [];
  const getClientByCode = mock(async () => {
    events.push("client");
    return { extAttributes: { validRedirectUrls: ["https://app.example.com"] } };
  });
  const isAllowed = mock(() => {
    events.push("redirect");
    return true;
  });
  const authorize = mock(async () => {
    events.push("session");
    return { isLogin: true as const, code: "auth-code" };
  });
  const useCase = createAuthorizeSsoUseCase({
    clients: { getClientByCode },
    principalSessions: { authorize },
    redirectUrls: { isAllowed },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://app.example.com",
    tokenSource: "authorization_header",
  }, {
    requestContext: {
      sourceApp: "iam",
      requestId: "req-authorize",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
  })).resolves.toEqual({
    isLogin: true,
    code: "auth-code",
  });

  expect(events).toEqual(["client", "redirect", "session"]);
  expect(authorize).toHaveBeenCalledWith({
    clientCode: "portal",
    redirectUrl: "https://app.example.com",
    requestContext: {
      sourceApp: "iam",
      requestId: "req-authorize",
      traceId: null,
      ip: null,
      userAgent: null,
      route: null,
      method: null,
    },
    token: "principal-token",
    tokenSource: "authorization_header",
  });
});

test("rejects an unknown client before redirect or session work", async () => {
  const isAllowed = mock(() => true);
  const authorize = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    clients: { getClientByCode: mock(async () => null) },
    principalSessions: { authorize },
    redirectUrls: { isAllowed },
  });

  await expect(useCase.execute({
    clientCode: "missing",
    redirectUrl: "https://app.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法client代码");

  expect(isAllowed).not.toHaveBeenCalled();
  expect(authorize).not.toHaveBeenCalled();
});

test("rejects a disallowed redirect before session authorization", async () => {
  const authorize = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    clients: {
      getClientByCode: mock(async () => ({
        extAttributes: { validRedirectUrls: ["https://allowed.example.com"] },
      })),
    },
    principalSessions: { authorize },
    redirectUrls: { isAllowed: mock(() => false) },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    redirectUrl: "https://blocked.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法重定向地址");

  expect(authorize).not.toHaveBeenCalled();
});
