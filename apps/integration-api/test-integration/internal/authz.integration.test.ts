import { expect, test } from "bun:test";
import { ClientStatus } from "@iam/contracts";
import { clients } from "@iam/db/schema";
import { createIntegrationApiApp } from "@integration-api/app";
import pino from "pino";
import { createIntegrationPostgresTestHarness, testEnvironment } from "../support/resources.fixture";

test("checks the current Internal Client and rejects missing, unknown, disabled and deleted credentials", async () => {
  const pg = await createIntegrationPostgresTestHarness();
  const logLines: string[] = [];
  const api = await createIntegrationApiApp({
    env: testEnvironment(pg.databaseUrl),
    logger: pino({ level: "info" }, { write: (line) => logLines.push(line) }),
  });
  try {
    await pg.db.insert(clients).values([
      { clientCode: "active", clientName: "Active", extAttributes: {}, clientSecret: "allowed-test-key" },
      {
        clientCode: "disabled",
        clientName: "Disabled",
        extAttributes: {},
        clientSecret: "disabled-test-key",
        status: ClientStatus.Disable,
      },
      {
        clientCode: "deleted",
        clientName: "Deleted",
        extAttributes: {},
        clientSecret: "deleted-test-key",
        isDelete: true,
      },
    ]);
    const ok = await api.app.request("/internal/authz", {
      headers: { apikey: "allowed-test-key", "IP-Chain": "192.0.2.10" },
    });
    const data = await ok.json();
    expect(ok.status).toBe(200);
    expect(data).toMatchObject({ data: true });
    for (const key of [undefined, "unknown-test-key", "disabled-test-key", "deleted-test-key"]) {
      const denied = await api.app.request("/internal/authz", { headers: key ? { apikey: key } : {} });
      expect(denied.status).toBe(401);
    }
    const checks = logLines.filter((line) => line.includes("auth.internal_authorization.checked"));
    expect(checks).toHaveLength(5);
    expect(checks[0]).toContain('"sourceIp":"192.0.2.10"');
    expect(checks[0]).toContain('"hasClientSecret":true');
    expect(logLines.join("")).not.toContain("allowed-test-key");
  } finally {
    await api.close();
    await pg.close();
  }
});
