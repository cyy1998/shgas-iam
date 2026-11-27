import { expect, test } from "bun:test";
import { clients } from "@iam/db/schema";
import { createIntegrationApiApp } from "../../src/app";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";

const production = {
  NODE_ENV: "production",
  IAM_INTEGRATION_API_SMS_URL: "https://sms.example.test/send",
  IAM_INTEGRATION_API_SMS_SIGNATURE_KEY: "smoke-test-key",
};

test("the HTTP routes use independent pools and keep OpenAPI closed in production", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  try {
    await pg.db.insert(clients).values({
      clientCode: "smoke-entry",
      clientName: "Smoke",
      clientSecret: "smoke-query-key",
      extAttributes: {},
    });
    const { app, close } = await createIntegrationApiApp({
      env: testEnvironment(pg.databaseUrl, production),
    });
    try {
      const requests = [
        ["/internal/users/search-dsl", {}],
        ["/internal/organizations/search-dsl", {}],
        ["/internal/delegations/resolve", { usernames: ["missing"], orgCode: "MISSING" }],
      ] as const;
      const queryStatuses = await Promise.all(
        requests.map(async ([path, body]) => {
          const response = await app.request(path, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: "smoke-query-key" },
            body: JSON.stringify(body),
          });
          await response.body?.cancel();
          return response.status;
        }),
      );
      const connections = await pg.sql`
          SELECT DISTINCT application_name FROM pg_stat_activity
          WHERE datname = current_database() AND application_name LIKE 'iam-integration-api%'
        `;
      const docs = await app.request("/doc");
      await docs.body?.cancel();
      expect(queryStatuses).toEqual([200, 200, 404]);
      expect(connections).toHaveLength(4);
      expect(docs.status).toBe(404);
    } finally {
      await close();
    }
  } finally {
    await pg.close();
  }
});

test("health remains available when PostgreSQL cannot open the database", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  try {
    const missingDatabase = new URL(pg.databaseUrl);
    missingDatabase.pathname += "_missing";
    const { app, close } = await createIntegrationApiApp({
      env: testEnvironment(missingDatabase.href, production),
    });
    try {
      const deadline = performance.now() + 5_000;
      while (true) {
        const health = await app.request("/health");
        const body = await health.json();
        if (health.ok) {
          expect(body).toEqual({ status: "ok" });
          break;
        }
        if (performance.now() >= deadline) throw new Error("Redis did not become healthy");
        await Bun.sleep(25);
      }
      const ready = await app.request("/ready");
      expect(ready.status).toBe(503);
      expect(await ready.json()).toEqual({ status: "unavailable" });
    } finally {
      await close();
    }
  } finally {
    await pg.close();
  }
}, 20_000);
