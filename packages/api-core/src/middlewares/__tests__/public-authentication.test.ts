import { expect, test } from "bun:test";
import { mapCustomSsoRetryableError } from "@iam/api-core/http/custom-sso-retryable";
import { createErrorHandler } from "@iam/api-core/middlewares";
import { createPublicAuthenticationHandler } from "@iam/api-core/middlewares/public-authentication";
import type { PublicBindings } from "@iam/api-core/types";
import { ApiErrorCode } from "@iam/contracts";
import { AuthzUnauthorizedError } from "@iam/runtime/errors";
import { createSubjectAccessOperations, SubjectAccessUnavailableError } from "@iam/subject-access";
import { Hono } from "hono";
import pino from "pino";

const subjectIdentifier = "00000000-0000-4000-8000-000000001001";
const transitionId = "00000000-0000-4000-8000-000000001002";

function fixture() {
  const mismatch = new AuthzUnauthorizedError("Client or purpose mismatch");
  const noRevocation = async () => ({
    userSessionsTerminated: 0,
    clientSessionsTerminated: 0,
    results: [],
    unfinished: [],
  });
  let blocked = false;
  const operations = createSubjectAccessOperations({
    barrier: {
      async readCommittedTransitionId() {
        if (blocked) throw new SubjectAccessUnavailableError();
        return transitionId;
      },
    },
    revocation: { revokePrincipalSession: noRevocation, revokeUserSessions: noRevocation },
  });
  type DeliverSubject = () => Promise<string>;
  const app = new Hono<PublicBindings>();
  const capabilities = new WeakMap<object, DeliverSubject>();
  app.onError(createErrorHandler(pino({ level: "silent" })));
  app.use(
    createPublicAuthenticationHandler<DeliverSubject>({
      runWithAuthentication: (token, clientCode, deliver) =>
        operations.run(async (operation) => {
          if (token === "wrong-purpose") throw mismatch;
          if (token !== (clientCode === "iam" ? "root" : "local") && token !== "raw header token") {
            throw new AuthzUnauthorizedError("未登录");
          }
          await operation.acquireForAuthentication(subjectIdentifier);
          // The barrier becomes unavailable after authentication and before projection.
          blocked = true;
          return await deliver({
            authenticationContext: { subjectIdentifier, authenticatedClientCode: clientCode },
            subjectDeliveryCapability: async () => {
              await operation.acquireForAuthentication(subjectIdentifier);
              return subjectIdentifier;
            },
          });
        }),
      async runWithCapability(context, capability, next) {
        capabilities.set(context, capability);
        try {
          await next();
        } finally {
          capabilities.delete(context);
        }
      },
      shouldPreserveSessionCookie: (error) => error === mismatch,
      mapRetryableError: mapCustomSsoRetryableError,
      retryAfterSeconds: 7,
    }),
  );
  app.get("/", async (c) => {
    const project = capabilities.get(c);
    if (!project) throw new Error("Delivery capability is unavailable");
    return c.json({ ...c.var, projected: await project() });
  });
  return app;
}

test.each(["iam", "gateway"])(
  "uses the %s session cookie before Authorization and projects with the same permission",
  async (client) => {
    const app = fixture();
    const headers = {
      Client: client,
      Cookie: "global_session=root; local_gateway_session=local",
      Authorization: "stale-header",
    };
    const response = await app.request("/", { headers });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual({
      subjectIdentifier,
      authenticatedClientCode: client,
      projected: subjectIdentifier,
    });

    const nextResponse = await app.request("/", { headers });
    const nextBody = await nextResponse.json();
    expect(nextResponse.status).toBe(503);
    expect(nextBody).toMatchObject({ code: ApiErrorCode.SubjectAccessUnavailable });
    expect(nextResponse.headers.get("Retry-After")).toBe("7");
    expect(nextResponse.headers.getSetCookie()).toEqual([]);
  },
);

test("uses the raw Authorization header when the requested Client has no session cookie", async () => {
  const response = await fixture().request("/", {
    headers: { Client: "gateway", Cookie: "global_session=root", Authorization: "raw header token" },
  });
  expect(response.status).toBe(200);
});

test("clears the invalid source cookie without falling back to a valid header", async () => {
  const response = await fixture().request("/", {
    headers: {
      Client: "gateway",
      Cookie: "global_session=root; local_gateway_session=invalid",
      Authorization: "raw header token",
    },
  });
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([
    "local_gateway_session=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ]);
});

test("preserves the source cookie when its Client or purpose does not match", async () => {
  const response = await fixture().request("/", {
    headers: { Client: "gateway", Cookie: "local_gateway_session=wrong-purpose" },
  });
  expect(response.status).toBe(401);
  expect(response.headers.getSetCookie()).toEqual([]);
});
