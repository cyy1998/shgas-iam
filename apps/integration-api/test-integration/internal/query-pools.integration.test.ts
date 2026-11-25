import { expect, test } from "bun:test";
import { clients } from "@iam/db/schema";
import { createIntegrationApiApp } from "@integration-api/app";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";

test("the dedicated query deadlines fail closed and the remaining service stays available", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const api = await createIntegrationApiApp({ env: testEnvironment(pg.databaseUrl), logger: pino({ enabled: false }) });
  const locked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let holder: Promise<unknown> | undefined;
  try {
    await pg.db.insert(clients).values({
      clientCode: "queries",
      clientName: "Queries",
      clientSecret: "query-test-key",
      extAttributes: {},
    });
    const headers = { apikey: "query-test-key", "Content-Type": "application/json" };
    const checks = [
      { path: "/internal/users/search-dsl", body: {}, code: "USER_SEARCH_UNAVAILABLE" },
      { path: "/internal/organizations/search-dsl", body: {}, code: "ORGANIZATION_DOCUMENT_UNAVAILABLE" },
      {
        path: "/internal/delegations/resolve",
        body: { usernames: ["alice"], orgCode: "LEFT" },
        code: "CLIENT_DELEGATION.RESOLUTION_UNAVAILABLE",
      },
    ];
    const request = (query: (typeof checks)[number]) =>
      api.app.request(query.path, { method: "POST", headers, body: JSON.stringify(query.body) });

    for (const [index, query] of checks.entries()) {
      const response = await request(query);
      expect(response.status).toBe(index === 2 ? 404 : 200);
    }
    holder = pg.sql.begin(async (tx) => {
      await tx`LOCK TABLE user_document, organization_document, client_delegation IN ACCESS EXCLUSIVE MODE`;
      locked.resolve();
      await release.promise;
    });
    await Promise.race([locked.promise, holder]);
    const started = performance.now();
    const results = await Promise.all(
      checks.map(async (query) => {
        const response = await request(query);
        return { status: response.status, body: await response.json(), code: query.code };
      }),
    );
    expect(performance.now() - started).toBeLessThan(4_500);
    for (const result of results) {
      expect(result.status).toBe(503);
      expect(result.body).toMatchObject({ code: result.code, data: null });
      expect(JSON.stringify(result.body)).not.toContain("statement timeout");
    }
    const authz = await api.app.request("/internal/authz", { headers });
    expect(authz.status).toBe(200);
    release.resolve();
    await holder;
    const recovered = await request(checks[0]!);
    expect(recovered.status).toBe(200);
  } finally {
    release.resolve();
    await holder?.catch(() => undefined);
    await api.close();
    await pg.close();
  }
}, 10_000);
