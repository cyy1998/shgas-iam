import { expect, mock, test } from "bun:test";
import { createAuthorizeSsoUseCase } from "../authorize-sso.use-case";

test("delegates authorization-code issuance after resolving the client and validating the redirect", async () => {
  const requestContext = {
    sourceApp: "iam",
    requestId: "req-authorize",
    traceId: null,
    ip: null,
    userAgent: null,
    route: null,
    method: null,
  };
  const getClientByCode = mock(async () => {
    return { extAttributes: { validRedirectUrls: ["https://app.example.com"] } };
  });
  const isAllowed = mock(() => true);
  const issueAuthorizationCode = mock(async () => ({ isLogin: true as const, code: "auth-code" }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { getClientByCode },
    redirectUrls: { isAllowed },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    globalSessionToken: "principal-token",
    redirectUrl: "https://app.example.com",
    tokenSource: "authorization_header",
  }, {
    requestContext,
  })).resolves.toEqual({
    isLogin: true,
    code: "auth-code",
  });

  expect(isAllowed).toHaveBeenCalledTimes(1);
  expect(isAllowed).toHaveBeenCalledWith(
    "portal",
    "https://app.example.com",
    ["https://app.example.com"],
    { requestContext },
  );
  expect(issueAuthorizationCode).toHaveBeenCalledTimes(1);
  expect(issueAuthorizationCode).toHaveBeenCalledWith({
    clientCode: "portal",
    redirectUrl: "https://app.example.com",
    requestContext,
    token: "principal-token",
    tokenSource: "authorization_header",
  });
});

test("rejects an unknown client before redirect validation or authorization-code issuance", async () => {
  const isAllowed = mock(() => true);
  const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: { getClientByCode: mock(async () => null) },
    redirectUrls: { isAllowed },
  });

  await expect(useCase.execute({
    clientCode: "missing",
    redirectUrl: "https://app.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法client代码");

  expect(isAllowed).not.toHaveBeenCalled();
  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});

test("rejects a disallowed redirect before authorization-code issuance", async () => {
  const issueAuthorizationCode = mock(async () => ({ isLogin: false as const, code: null }));
  const useCase = createAuthorizeSsoUseCase({
    authorizationGrants: { issueAuthorizationCode },
    clients: {
      getClientByCode: mock(async () => ({
        extAttributes: { validRedirectUrls: ["https://allowed.example.com"] },
      })),
    },
    redirectUrls: { isAllowed: mock(() => false) },
  });

  await expect(useCase.execute({
    clientCode: "portal",
    redirectUrl: "https://blocked.example.com",
    tokenSource: "none",
  })).rejects.toThrow("非法重定向地址");

  expect(issueAuthorizationCode).not.toHaveBeenCalled();
});
