import type { SQL } from "drizzle-orm";
import { createClientRepository } from "@admin-api/services/client/client.repository";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";

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
    oidcEnabled: false,
    oidcConfig: null,
    oidcSecretHash: null,
    oidcConfigVersion: 4,
    customSsoEnabled: true,
    customSsoConfig: {
      mode: CustomSsoClientMode.Gateway,
      orcas: { enabled: false },
      subjectClaims: [SubjectClaim.SubjectIdentifier],
      validRedirectUrls: ["https://portal.example.com/sso/*"],
    },
    customSsoSecretHash: null,
    customSsoConfigVersion: 7,
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

function sqlText(value: unknown) {
  return new PgDialect().sqlToQuery(value as SQL).sql;
}

describe("client repository protocol epochs", () => {
  test("reports missing basic write rows explicitly", async () => {
    const repository = createClientRepository(createUpdateDb(null).db);
    const updated = await repository.updateClientByCode("portal", { clientName: "Changed" });
    const disabled = await repository.updateClientByCodeWithProtocolEpochs("portal", { status: ClientStatus.Disable });
    const deleted = await repository.softDeleteClientByCode("portal");
    expect(updated).toBeNull();
    expect(disabled).toBeNull();
    expect(deleted).toBeNull();
  });

  test("advances independent OIDC and Custom SSO epochs for a status change without changing Custom SSO intent", async () => {
    const fake = createUpdateDb(clientRow({
      status: ClientStatus.Disable,
      oidcConfigVersion: 5,
      customSsoConfigVersion: 8,
    }));
    const repository = createClientRepository(fake.db);

    await expect(
      repository.updateClientByCodeWithProtocolEpochs(
        "portal",
        { status: ClientStatus.Disable },
      ),
    ).resolves.toMatchObject({
      status: ClientStatus.Disable,
      oidcConfigVersion: 5,
      customSsoConfigVersion: 8,
      customSsoEnabled: true,
      customSsoConfig: expect.objectContaining({
        mode: CustomSsoClientMode.Gateway,
      }),
    });

    expect(fake.updateValues).toMatchObject({
      status: ClientStatus.Disable,
    });
    expect(sqlText(fake.updateValues.oidcConfigVersion))
      .toContain("\"oidc_config_version\" + 1");
    expect(sqlText(fake.updateValues.customSsoConfigVersion))
      .toContain("\"custom_sso_config_version\" + 1");
    expect(fake.updateValues).not.toHaveProperty("customSsoEnabled");
    expect(fake.updateValues).not.toHaveProperty("customSsoConfig");
  });

  test("advances both protocol epochs when soft deleting without rewriting protocol configuration", async () => {
    const fake = createUpdateDb(clientRow({
      isDelete: true,
      oidcConfigVersion: 5,
      customSsoConfigVersion: 8,
    }));
    const repository = createClientRepository(fake.db);

    await expect(
      repository.softDeleteClientByCode("portal"),
    ).resolves.toMatchObject({
      isDelete: true,
      oidcConfigVersion: 5,
      customSsoConfigVersion: 8,
    });

    expect(fake.updateValues).toMatchObject({ isDelete: true });
    expect(sqlText(fake.updateValues.oidcConfigVersion))
      .toContain("\"oidc_config_version\" + 1");
    expect(sqlText(fake.updateValues.customSsoConfigVersion))
      .toContain("\"custom_sso_config_version\" + 1");
    expect(fake.updateValues).not.toHaveProperty("oidcConfig");
    expect(fake.updateValues).not.toHaveProperty("customSsoConfig");
  });

  test("advances both protocol epochs through the legacy ID update path", async () => {
    const fake = createUpdateDb(clientRow({
      status: ClientStatus.Disable,
      oidcConfigVersion: 5,
      customSsoConfigVersion: 8,
    }));
    const repository = createClientRepository(fake.db);

    await repository.updateClientByIdWithProtocolEpochs({
      id: 1,
      clientCode: "portal",
      status: ClientStatus.Disable,
    });

    expect(sqlText(fake.updateValues.oidcConfigVersion))
      .toContain("\"oidc_config_version\" + 1");
    expect(sqlText(fake.updateValues.customSsoConfigVersion))
      .toContain("\"custom_sso_config_version\" + 1");
  });

  test("keeps protocol-specific configuration epochs independent", async () => {
    const oidcFake = createUpdateDb(clientRow({
      oidcConfigVersion: 5,
    }));
    const customSsoFake = createUpdateDb(clientRow({
      customSsoConfigVersion: 8,
    }));

    await createClientRepository(oidcFake.db)
      .updateClientOidcByCode("portal", {
        oidcEnabled: false,
      });
    await createClientRepository(customSsoFake.db)
      .updateClientCustomSsoByCode("portal", {
        customSsoEnabled: true,
      });

    expect(sqlText(oidcFake.updateValues.oidcConfigVersion))
      .toContain("\"oidc_config_version\" + 1");
    expect(oidcFake.updateValues)
      .not
      .toHaveProperty("customSsoConfigVersion");
    expect(sqlText(customSsoFake.updateValues.customSsoConfigVersion))
      .toContain("\"custom_sso_config_version\" + 1");
    expect(customSsoFake.updateValues)
      .not
      .toHaveProperty("oidcConfigVersion");
  });
});
