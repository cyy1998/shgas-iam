import type { CustomSsoExchangeResult } from "@iam/custom-sso";
import { randomUUID } from "node:crypto";
import * as routes from "@api/routes/sso/sso.routes";
import { createUnifiedCallbackHandler } from "@api/routes/sso/unified-callback.handler";
import { createUnifiedTokenHandler } from "@api/routes/sso/unified-token.handler";
import {
  customSsoLocalSessionCookieName,
  encodeCustomSsoClientCode,
} from "@api/services/sso/transport/custom-sso-client-code.transport";
import { createRouter } from "@iam/api-core/core/create-router";
import { BadRequestError } from "@iam/api-core/errors";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createSubjectAccessOperations, SubjectAccessUnavailableError } from "@iam/api-core/subject-access";
import { SubjectProjectionNotReadyError } from "@iam/client-subject-projection";
import { expect, mock, test } from "bun:test";
import pino from "pino";

type CustomSsoManagedResult = {
  token: string;
  ttl: number;
  redirectUrl: string;
  state?: string;
  orcasSessionId: string | null;
};

function fixture() {
  const calls: unknown[] = [];
  const exchange = mock(async (): Promise<CustomSsoExchangeResult> => ({
    sid: "token",
    ttl: 37,
    subject: { version: 2, subjectIdentifier: randomUUID() },
  }));
  const callback = mock(async (): Promise<CustomSsoManagedResult> => ({
    token: "managed-token",
    ttl: 37,
    redirectUrl: "https://app.example/complete",
    state: "trusted state",
    orcasSessionId: "orcas-token",
  }));
  const operations = createSubjectAccessOperations({
    barrier: { readCommittedTransitionId: async () => randomUUID() },
    revocation: {
      revokePrincipalSession: async () => ({
        userSessionsTerminated: 0,
        clientSessionsTerminated: 0,
        results: [],
        unfinished: [],
      }),
      revokeUserSessions: async () => ({
        userSessionsTerminated: 0,
        clientSessionsTerminated: 0,
        results: [],
        unfinished: [],
      }),
    },
  });
  const custom = {
    forOperation: () => ({
      async exchange<T = CustomSsoExchangeResult>(
        input: { clientCode: string; invalidParameters?: boolean },
        deliver?: (value: CustomSsoExchangeResult) => T | Promise<T>,
      ) {
        calls.push(input);
        if (input.invalidParameters)
          throw new BadRequestError();
        const value = await exchange();
        return deliver ? await deliver(value) : value;
      },
      async completeCallback<T = CustomSsoManagedResult>(
        _input: unknown,
        deliver?: (value: CustomSsoManagedResult) => T | Promise<T>,
      ) {
        const value = await callback();
        return deliver ? await deliver(value) : value;
      },
    }),
  };
  const app = createRouter();
  app.onError(createErrorHandler(pino({ level: "silent" })));
  app.openAPIRegistry.registerComponent("securitySchemes", "CustomSsoBasic", {
    type: "http",
    scheme: "basic",
  });
  app.openAPIRegistry.registerPath(routes.token);
  app.post("/token", createUnifiedTokenHandler({ custom, operations, retryAfterSeconds: 7 }));
  app.openapi(routes.callback, createUnifiedCallbackHandler({ custom, operations, retryAfterSeconds: 7 }));
  app.doc31("/doc", { openapi: "3.1.0", info: { title: "SSO", version: "1" } });
  const request = (
    client = "client",
    body: BodyInit = new URLSearchParams({ code: "code", redirect_uri: "https://app.example/complete" }),
    contentType = "application/x-www-form-urlencoded",
  ) => ({
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`${encodeCustomSsoClientCode(client)}:secret`).toString("base64")}`,
      "Content-Type": contentType,
    },
    body,
  });
  return { app, calls, exchange, callback, request };
}

test.each(["client", "legacy:client/中文", "legacy%3Aclient", "😀".repeat(33)])(
  "Basic transports opaque client %s and emits only the narrow envelope",
  async (client) => {
    const f = fixture();
    const response = await f.app.request("/token", f.request(client));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      sid: "token",
      ttl: 37,
      subject: { version: 2, subjectIdentifier: expect.any(String) },
    });
    expect(f.calls[0]).toMatchObject({
      clientCode: client,
      clientSecret: "secret",
      code: "code",
      redirectUri: "https://app.example/complete",
      invalidParameters: false,
    });
    expect(response.headers.getSetCookie()).toEqual([]);
  },
);

test.each(["legacy:client/中文", "😀".repeat(33)])(
  "managed callback encodes cookie %s and only renders accepted state",
  async (client) => {
    const f = fixture();
    const response = await f.app.request(
      `/callback?${new URLSearchParams({ client, code: "code", redirectUrl: "https://app.example/complete", state: "attacker" })}`,
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("state")).toBe("trusted state");
    expect(location.searchParams.get("orcasToken")).toBe("orcas-token");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toContainEqual(
      expect.stringContaining(`${customSsoLocalSessionCookieName(client)}=managed-token`),
    );
    for (const cookie of cookies) {
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("SameSite=Lax");
      expect(cookie).toContain("Max-Age=37");
    }
  },
);

test("form endpoint rejects GET, query, JSON, duplicate parameters and preflight", async () => {
  const f = fixture();
  for (const [path, init] of [
    ["/token", { method: "GET" }],
    ["/token", { method: "OPTIONS" }],
    ["/token?code=attacker", f.request()],
    ["/token", f.request("client", "{}", "application/json")],
    ["/token", f.request("client", "code=a&code=b&redirect_uri=https://app.example/complete")],
  ] as const) {
    const response = await f.app.request(path, init);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.getSetCookie()).toEqual([]);
  }
  expect(f.exchange).not.toHaveBeenCalled();
});

test.each([new SubjectProjectionNotReadyError(), new SubjectAccessUnavailableError()])(
  "temporary failures preserve cookies with sanitized Retry-After",
  async (error) => {
    const f = fixture();
    f.exchange.mockRejectedValueOnce(error);
    const response = await f.app.request("/token", f.request());
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("7");
    expect(response.headers.getSetCookie()).toEqual([]);
    const body = await response.text();
    expect(body).not.toContain("stack");
  },
);

test("OpenAPI retains POST Basic and form token contract", async () => {
  const f = fixture();
  const response = await f.app.request("/doc");
  const document = await response.json();
  expect(document.components.securitySchemes.CustomSsoBasic).toMatchObject({ type: "http", scheme: "basic" });
  expect(document.paths["/token"].post.security).toEqual([{ CustomSsoBasic: [] }]);
  expect(document.paths["/token"].post.requestBody.content).toHaveProperty(
    "application/x-www-form-urlencoded",
  );
  expect(document.paths["/token"]).not.toHaveProperty("get");
});
