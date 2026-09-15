import { createOidcHttpRouter } from "@api/routes/oidc/oidc.http";
import { createSubjectAccessOperations } from "@iam/api-core/subject-access";
import { expect, test } from "bun:test";

test("OIDC HTTP reports safe protocol and dependency failure classifications without request secrets", async () => {
  const failures: unknown[] = [];
  const operations = createSubjectAccessOperations({ barrier: { readCommittedTransitionId: async () => {
    throw new Error("unexpected");
  } }, revocation: { revokePrincipalSession: async () => {
    throw new Error("unexpected");
  }, revokeUserSessions: async () => {
    throw new Error("unexpected");
  } } });
  const router = createOidcHttpRouter({
    authorization: { forOperation() {
      throw new Error("redis://secret@internal/private");
    } } as never,
    operations,
    issuer: "https://iam.example/oidc",
    loginEndpoint: "https://iam.example/login",
    secureCookies: true,
    reportProtocolFailure: failure => failures.push(failure),
  });
  const traceId = "1234567890abcdef1234567890abcdef";
  const headers = { "X-Request-Id": "oidc-error-request", "traceparent": `00-${traceId}-1234567890abcdef-01` };
  const protocol = await router.request("/auth?state=secret-state", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "{}" });
  expect(protocol.status).toBe(400);
  expect(protocol.headers.get("X-Request-Id")).toBe("oidc-error-request");
  const unavailable = await router.request("/auth?client_id=secret-client&state=secret-state", { headers });
  expect(unavailable.status).toBe(503);
  expect(unavailable.headers.get("Retry-After")).toBe("3");
  expect(failures).toEqual([
    { requestId: "oidc-error-request", traceId, errorCode: "invalid_request", outcome: "protocol", path: "/auth", statusCode: 400 },
    { requestId: "oidc-error-request", traceId, errorCode: "temporarily_unavailable", outcome: "unavailable", path: "/auth", statusCode: 503 },
  ]);
  expect(JSON.stringify(failures)).not.toContain("secret");
  const body = await unavailable.text();
  expect(body).not.toContain("redis");
  expect(body).not.toContain("secret");
});
