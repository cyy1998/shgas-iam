import { expect, test } from "bun:test";
import { createIntegrationApiApp } from "@integration-api/app";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";

test("OpenAPI covers the standalone probes, M2M contracts and root-only personal delegation", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const api = await createIntegrationApiApp({ env: testEnvironment(pg.databaseUrl), logger: pino({ enabled: false }) });
  try {
    const response = await api.app.request("/doc");
    const doc = await response.json();
    expect(response.status).toBe(200);
    expect(doc).toMatchObject({
      openapi: "3.1.0",
      info: { title: "IAM Integration API" },
      components: {
        securitySchemes: {
          InternalApiSecret: { type: "apiKey", in: "header", name: "apikey" },
          IamRootSessionAuthorization: { type: "apiKey", in: "header", name: "Authorization" },
          IamRootSessionCookie: { type: "apiKey", in: "cookie", name: "global_session" },
        },
      },
    });

    const internal = { security: [{ InternalApiSecret: [] }] };
    const personal = {
      description: expect.stringContaining("Client: iam"),
      security: [{ IamRootSessionAuthorization: [] }, { IamRootSessionCookie: [] }],
    };
    expect(doc.paths).toMatchObject({
      "/health": { get: expect.any(Object) },
      "/ready": { get: expect.any(Object) },
      "/internal/authz": { get: internal },
      "/internal/users/{username}": { get: internal },
      "/internal/users/search-dsl": { post: internal },
      "/internal/users/purveyor/contacts": { post: internal },
      "/internal/organizations/{orgCode}": { get: internal, put: internal },
      "/internal/organizations/search-dsl": { post: internal },
      "/internal/organizations/purveyors": { post: internal },
      "/internal/delegations": { post: internal },
      "/internal/delegations/{id}": { patch: internal },
      "/internal/delegations/search": { post: internal },
      "/internal/delegations/resolve": { post: internal },
      "/delegations": { post: personal },
      "/delegations/{id}": { patch: personal },
      "/delegations/search": { post: personal },
      "/delegations/choices/users": { get: personal },
      "/delegations/choices/clients": { get: personal },
      "/delegations/choices/organizations": { get: personal },
    });
  } finally {
    await api.close();
    await pg.close();
  }
});
