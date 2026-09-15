import { createClientRepository } from "@admin-api/services/client/client.repository";
import {
  ClientStatus,
} from "@iam/contracts";
import { expect, mock, test } from "bun:test";

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "secret",
    url: "https://portal.example.com",
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: new Date("2026-01-01T00:00:00Z"),
    updateTime: new Date("2026-01-01T00:00:00Z"),
    extAttributes: {},
    hasSsoSecret: false,
    ssoEnabled: false,
    ssoConfig: null,
    ssoSecret: null,
    ssoCredentialId: null,
    ssoSecretUpdatedAt: null,
    ...overrides,
  };
}

function createUpdateDb(returnedRow: Record<string, unknown> | null) {
  let updateValues: Record<string, unknown> = {};
  const returning = mock(async () => returnedRow === null ? [] : [returnedRow]);
  const where = mock(() => ({ returning }));
  const set = mock((values: Record<string, unknown>) => {
    updateValues = values;
    return { where };
  });
  const update = mock(() => ({ set }));
  return {
    db: { update } as never,
    get updateValues() {
      return updateValues;
    },
  };
}

test("generic basic writes report missing rows and preserve current SSO storage", async () => {
  const absent = createClientRepository(createUpdateDb(null).db);
  const missing = await absent.updateClientByCode("portal", { clientName: "Changed" });
  expect(missing).toBeNull();
  const fake = createUpdateDb(clientRow({ clientName: "Changed" }));
  const repository = createClientRepository(fake.db);
  const result = await repository.updateClientByCode("portal", { clientName: "Changed" });
  expect(result?.clientName).toBe("Changed");
  expect(fake.updateValues).not.toHaveProperty("ssoEnabled");
  expect(fake.updateValues).not.toHaveProperty("ssoConfig");
  expect(fake.updateValues).not.toHaveProperty("ssoSecret");
});
