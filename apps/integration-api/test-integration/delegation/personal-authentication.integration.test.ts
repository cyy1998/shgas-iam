import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { users } from "@iam/db/schema";
import { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import { createIntegrationApiApp } from "@integration-api/app";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";
import { createSessionFixture } from "../support/session.fixture";

test("personal delegation accepts the root cookie and token while enforcing Client and Subject Access", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const env = testEnvironment(pg.databaseUrl);
  const redisHarness = createExclusiveRedisTestHarness({
    environment: process.env,
    name: "IAM_INTEGRATION_API_TEST_REDIS_URL",
  });
  const api = await createIntegrationApiApp({ env, logger: pino({ enabled: false }) });
  try {
    const { first: redis } = await redisHarness.openPair();
    const subjectIdentifier = randomUUID();
    await pg.db.insert(users).values({ username: "root-owner", name: "Root Owner", subjectIdentifier });
    const sessions = createSessionFixture(redis, env);
    const root = await sessions.issueRoot(subjectIdentifier);
    const local = await sessions.openCustomSsoSession(root.observation);
    async function search(headers: Record<string, string>) {
      return await api.app.request("/delegations/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: "{}",
      });
    }

    const rootCredentials: Record<string, string>[] = [
      { Cookie: `global_session=${root.bearer}` },
      { Authorization: root.bearer },
    ];
    for (const credentials of rootCredentials) {
      const response = await search({ Client: "iam", ...credentials });
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ data: [] });
    }

    const rejectedCredentials: Record<string, string>[] = [
      { Client: "expenses", Authorization: root.bearer },
      { Client: "expenses", Cookie: `local_expenses_session=${local}; global_session=${root.bearer}` },
      { Client: "iam", Authorization: local },
      { Client: "iam", Cookie: `local_expenses_session=${local}` },
    ];
    for (const headers of rejectedCredentials) {
      const response = await search(headers);
      expect(response.status).toBe(401);
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }

    const deniedCreate = await api.app.request("/delegations", {
      method: "POST",
      headers: { Client: "expenses", Authorization: root.bearer, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(deniedCreate.status).toBe(401);

    await sessions.setAccess(subjectIdentifier, "disabled");
    const blocked = await search({ Client: "iam", Cookie: `global_session=${root.bearer}` });
    expect(blocked.status).toBe(401);
    expect(blocked.headers.get("Set-Cookie")).toContain("global_session=;");
  } finally {
    await api.close();
    await redisHarness.reset();
    await pg.close();
  }
});
