import { expect, test } from "bun:test";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { eq } from "drizzle-orm";
import { createGatewayComposition } from "../../src/composition";
import { parseGatewayEnv } from "../../src/env";
import { createGatewayPostgresTestHarness } from "../support/postgres-test-harness";

test("Gateway HTTP observes current PostgreSQL credentials, lifecycle and datasource failure", async () => {
  const database = await createGatewayPostgresTestHarness();
  const composition = createGatewayComposition(
    parseGatewayEnv({
      IAM_GATEWAY_DATABASE_URL: database.databaseUrl,
      IAM_GATEWAY_APISIX_ADMIN_URL: "http://127.0.0.1:1/apisix/admin",
      IAM_GATEWAY_APISIX_ADMIN_KEY: "synthetic-admin-key",
    }),
  );
  const request = (scope = "test:tender", secret?: string) =>
    composition.app.request("/validate", {
      method: "POST",
      headers: { "content-type": "application/json", ...(secret ? { apikey: secret } : {}) },
      body: JSON.stringify({ scope, yaml: "service: {}" }),
    });
  try {
    await database.db.insert(clients).values([
      {
        clientCode: "tender",
        clientName: "Tender",
        clientSecret: "old-secret",
        extAttributes: {},
        status: ClientStatus.Enable,
      },
      {
        clientCode: "other",
        clientName: "Other",
        clientSecret: "same-secret",
        extAttributes: {},
        status: ClientStatus.Enable,
      },
      {
        clientCode: "also",
        clientName: "Also",
        clientSecret: "same-secret",
        extAttributes: {},
        status: ClientStatus.Enable,
      },
    ]);
    const accepted = await request("test:tender", "old-secret");
    expect(accepted.status).toBe(200);
    for (const [scope, secret] of [
      ["test:tender", undefined],
      ["test:tender", "wrong"],
      ["test:other", "old-secret"],
      ["test:missing", "old-secret"],
    ]) {
      const response = await request(scope, secret);
      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body).toEqual({ code: "GATEWAY_UNAUTHORIZED", message: "Client authentication failed", data: null });
    }
    for (const code of ["other", "also"]) {
      const response = await request(`test:${code}`, "same-secret");
      expect(response.status).toBe(200);
    }
    await database.db.update(clients).set({ clientSecret: "new-secret" }).where(eq(clients.clientCode, "tender"));
    const rotated = await request("test:tender", "old-secret");
    expect(rotated.status).toBe(401);
    const current = await request("test:tender", "new-secret");
    expect(current.status).toBe(200);
    for (const status of [ClientStatus.Maintenance, ClientStatus.Disable]) {
      await database.db.update(clients).set({ status }).where(eq(clients.clientCode, "tender"));
      const response = await request("test:tender", "new-secret");
      expect(response.status).toBe(401);
    }
    await database.db
      .update(clients)
      .set({ status: ClientStatus.Enable, isDelete: true })
      .where(eq(clients.clientCode, "tender"));
    const deleted = await request("test:tender", "new-secret");
    expect(deleted.status).toBe(401);
    await database.sql.unsafe("ALTER TABLE client RENAME TO unavailable_client");
    const unavailable = await request("test:tender", "new-secret");
    expect(unavailable.status).toBe(503);
    const unavailableBody = await unavailable.json();
    expect(unavailableBody.code).toBe("GATEWAY_AUTH_UNAVAILABLE");
  } finally {
    await composition.close();
    const sessions = await database.sql<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM pg_stat_activity WHERE application_name = 'iam-gateway' AND datname = current_database()`;
    expect(sessions[0]?.count).toBe(0);
    await database.close();
  }
}, 45_000);
