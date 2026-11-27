import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { createClientSnapshots } from "@iam/client-snapshot/composition";
import { ApiErrorCode, ClientStatus } from "@iam/contracts";
import { createClientSnapshotRepository } from "@iam/db/client-snapshot";
import { clients, users } from "@iam/db/schema";
import { createExclusiveRedisTestHarness } from "@iam/test-support/external-test-resources";
import { createIntegrationApiApp } from "@integration-api/app";
import { eq } from "drizzle-orm";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";
import { createSessionFixture } from "../support/session.fixture";
import { personalDelegationClient } from "./personal-delegation.fixture";

test("personal delegation accepts the root cookie and token while enforcing Client and Subject Access", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const env = testEnvironment(pg.databaseUrl);
  const redisHarness = createExclusiveRedisTestHarness({
    environment: process.env,
    name: "IAM_TEST_REDIS_URL",
  });
  const api = await createIntegrationApiApp({ env, logger: pino({ enabled: false }) });
  try {
    const { first: redis } = await redisHarness.openPair();
    const subjectIdentifier = randomUUID();
    await pg.db.insert(clients).values(personalDelegationClient);
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

    const snapshots = createClientSnapshots({ redis, source: createClientSnapshotRepository(pg.db) });
    const headers = { Client: "iam", Cookie: `global_session=${root.bearer}` };
    for (const [status, expectedStatus, expectedCode] of [
      [ClientStatus.Disable, 401, ApiErrorCode.Unauthorized],
      [ClientStatus.Maintenance, 503, ApiErrorCode.Maintenance],
      [ClientStatus.Enable, 200, undefined],
    ] as const) {
      await pg.db.update(clients).set({ status }).where(eq(clients.clientCode, "iam"));
      await snapshots.invalidateClient("iam");
      const response = await search(headers);
      const result = await response.json();
      expect(response.status).toBe(expectedStatus);
      if (expectedCode !== undefined) expect(result.code).toBe(expectedCode);
      if (status === ClientStatus.Maintenance) expect(response.headers.get("Retry-After")).toBe("3");
      expect(response.headers.get("Set-Cookie")).toBeNull();
    }

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
