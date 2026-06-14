import type { ClientOidcConfigureDto } from "../client.type";
import {
  ClientManagementLevel,
  ClientStatus,
  OidcClientState,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const tx = { name: "admin-client-service-test-tx" };
const transaction = mock(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));

const clientRepository = {
  createClient: mock(),
  getAnyClientByCode: mock(),
  getClientByCode: mock(),
  getClientById: mock(),
  searchClientsPaged: mock(),
  softDeleteClientByCode: mock(),
  updateClientByCode: mock(),
  updateClientByCodeWithOidcVersion: mock(),
  updateClientById: mock(),
  updateClientByIdWithOidcVersion: mock(),
  updateClientOidcByCode: mock(),
};

const redis = {
  del: mock(async () => 1),
  publish: mock(async () => 1),
  set: mock(async () => "OK"),
};

const hashSecret = mock(async () => "oidc-secret-hash");
const logger = { warn: mock(() => undefined) };

const auditService = {
  recordAuditLog: mock(),
};

mock.module("@iam/db", () => ({
  default: {
    transaction,
  },
}));

mock.module("@admin-api/lib/infra/redis", () => ({
  default: redis,
}));
mock.module("@admin-api/lib/logger", () => ({ logger }));
mock.module("@iam/api-core/security", () => ({ hashSecret }));

mock.module("@admin-api/services/audit/audit.service", () => auditService);
mock.module("@admin-api/services/client/client.repository", () => clientRepository);

const clientService = await import("../client.service");

const fixedDate = new Date("2026-01-01T00:00:00.000Z");

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientCode: "portal",
    clientName: "Portal",
    clientSecret: "secret-1",
    url: "https://portal.example.com",
    status: ClientStatus.Enable,
    description: null,
    isDelete: false,
    createTime: fixedDate,
    updateTime: fixedDate,
    extAttributes: {
      userExcluding: [],
      requireOrcas: false,
      validRedirectUrls: ["https://portal.example.com"],
      managementLevel: ClientManagementLevel.Gateway,
      logoutEndpoint: "https://portal.example.com/logout",
      callbackEndpoint: "https://portal.example.com/sso/callback",
    },
    oidcEnabled: false,
    oidcConfig: null,
    oidcSecretHash: null,
    oidcConfigVersion: 0,
    ...overrides,
  };
}

beforeEach(() => {
  transaction.mockReset();
  transaction.mockImplementation(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));
  redis.del.mockClear();
  redis.publish.mockClear();
  redis.set.mockClear();
  hashSecret.mockClear();
  hashSecret.mockResolvedValue("oidc-secret-hash");
  logger.warn.mockClear();
  auditService.recordAuditLog.mockReset();
  clientRepository.createClient.mockReset();
  clientRepository.getAnyClientByCode.mockReset();
  clientRepository.getClientByCode.mockReset();
  clientRepository.getClientById.mockReset();
  clientRepository.searchClientsPaged.mockReset();
  clientRepository.softDeleteClientByCode.mockReset();
  clientRepository.updateClientByCode.mockReset();
  clientRepository.updateClientByCodeWithOidcVersion.mockReset();
  clientRepository.updateClientById.mockReset();
  clientRepository.updateClientByIdWithOidcVersion.mockReset();
  clientRepository.updateClientOidcByCode.mockReset();

  clientRepository.createClient.mockResolvedValue(makeClient());
  clientRepository.getAnyClientByCode.mockResolvedValue(null);
  clientRepository.getClientByCode.mockResolvedValue(makeClient());
  clientRepository.getClientById.mockResolvedValue(makeClient());
  clientRepository.searchClientsPaged.mockResolvedValue({ rows: [makeClient()], total: 1 });
  clientRepository.softDeleteClientByCode.mockResolvedValue(makeClient({ isDelete: true }));
  clientRepository.updateClientByCode.mockResolvedValue(makeClient());
  clientRepository.updateClientByCodeWithOidcVersion.mockResolvedValue(makeClient({ oidcConfigVersion: 1 }));
  clientRepository.updateClientById.mockResolvedValue(makeClient());
  clientRepository.updateClientByIdWithOidcVersion.mockResolvedValue(makeClient({ oidcConfigVersion: 1 }));
  clientRepository.updateClientOidcByCode.mockImplementation(
    async (_clientCode: string, data: Record<string, unknown>) => makeClient({
      ...data,
      oidcConfigVersion: 1,
    }),
  );
  auditService.recordAuditLog.mockResolvedValue(undefined);
});

describe("admin clientService.searchClientsForAdmin", () => {
  test("maps rows and calculates pages", async () => {
    const query = {
      conditions: {
        fuzzyConditions: { text: "portal" },
        exactConditions: { statuses: [ClientStatus.Enable] },
      },
      pageNum: 2,
      pageSize: 10,
    };
    clientRepository.searchClientsPaged.mockResolvedValue({
      rows: [makeClient({ clientSecret: "hidden" })],
      total: 21,
    });

    await expect(clientService.searchClientsForAdmin(query)).resolves.toMatchObject({
      result: [{
        clientCode: "portal",
        clientSecret: "hidden",
        oidcState: OidcClientState.Unconfigured,
        hasOidcSecret: false,
      }],
      total: 21,
      pageNum: 2,
      pageSize: 10,
      pages: 3,
    });
  });
});

describe("admin clientService.getClientDetailByCode", () => {
  test("rejects missing clients", async () => {
    clientRepository.getClientByCode.mockResolvedValue(null);

    await expect(clientService.getClientDetailByCode("missing")).rejects.toThrow("客户端不存在");
  });
});

describe("admin clientService.createClient", () => {
  test("rejects duplicate client codes", async () => {
    clientRepository.getAnyClientByCode.mockResolvedValue(makeClient());

    await expect(clientService.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret-1",
      status: ClientStatus.Enable,
      extAttributes: makeClient().extAttributes,
    })).rejects.toThrow("客户端编码已存在");

    expect(clientRepository.createClient).not.toHaveBeenCalled();
  });

  test("creates clients and writes code and secret cache", async () => {
    await expect(clientService.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret-1",
      status: ClientStatus.Enable,
      extAttributes: {
        ...makeClient().extAttributes,
        validRedirectUrls: ["https://portal.example.com", "https://*.example.com/app/*"],
      },
    })).resolves.toMatchObject({ clientCode: "portal" });

    expect(clientRepository.createClient).toHaveBeenCalledWith(expect.objectContaining({ clientCode: "portal" }), tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.create",
      outcome: "success",
      actorType: "system",
      targetType: "client",
      targetCode: "portal",
      details: expect.objectContaining({
        clientSecretProvided: true,
      }),
    }), tx);
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:portal", expect.any(String));
    expect(redis.set).toHaveBeenCalledWith("cache:client:secret:secret-1", expect.any(String));
  });

  test("rejects invalid redirect URL patterns before writing or refreshing cache", async () => {
    await expect(clientService.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret-1",
      status: ClientStatus.Enable,
      extAttributes: {
        ...makeClient().extAttributes,
        validRedirectUrls: ["https://portal.example.com/*/callback"],
      },
    })).rejects.toThrow("存在非法 redirect URL pattern");

    expect(transaction).not.toHaveBeenCalled();
    expect(clientRepository.createClient).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("admin clientService.updateClient", () => {
  test("rejects missing clients", async () => {
    clientRepository.getClientByCode.mockResolvedValue(null);

    await expect(clientService.updateClient("missing", { clientName: "New" })).rejects.toThrow("客户端不存在");

    expect(clientRepository.updateClientByCode).not.toHaveBeenCalled();
  });

  test("deletes the old secret cache when the custom SSO secret changes", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      clientSecret: "old-secret",
    }));
    clientRepository.updateClientByCode.mockResolvedValue(makeClient({
      clientSecret: "new-secret",
    }));

    await expect(clientService.updateClient("portal", {
      clientSecret: "new-secret",
    })).resolves.toMatchObject({ clientCode: "portal" });

    expect(redis.del).toHaveBeenCalledWith("cache:client:secret:old-secret");
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:portal", expect.any(String));
    expect(redis.set).toHaveBeenCalledWith("cache:client:secret:new-secret", expect.any(String));
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.rotate_secret",
      details: expect.objectContaining({
        patch: expect.objectContaining({
          clientSecretRotated: true,
        }),
      }),
    }), tx);
  });

  test("accepts valid redirect URL patterns on update", async () => {
    await expect(clientService.updateClient("portal", {
      extAttributes: {
        ...makeClient().extAttributes,
        validRedirectUrls: ["https://*.example.com/sso/*", "http://localhost:8080"],
      },
    })).resolves.toMatchObject({ clientCode: "portal" });

    expect(clientRepository.updateClientByCode).toHaveBeenCalledWith("portal", expect.objectContaining({
      extAttributes: expect.objectContaining({
        validRedirectUrls: ["https://*.example.com/sso/*", "http://localhost:8080"],
      }),
    }), tx);
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:portal", expect.any(String));
    expect(clientRepository.updateClientByCodeWithOidcVersion).not.toHaveBeenCalled();
  });

  test("rejects invalid redirect URL patterns on update without refreshing cache", async () => {
    await expect(clientService.updateClient("portal", {
      extAttributes: {
        ...makeClient().extAttributes,
        validRedirectUrls: ["https://*.com/callback"],
      },
    })).rejects.toThrow("存在非法 redirect URL pattern");

    expect(transaction).not.toHaveBeenCalled();
    expect(clientRepository.updateClientByCode).not.toHaveBeenCalled();
    expect(redis.del).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe("admin clientService.updateClientById", () => {
  test("rejects clientCode changes from the legacy REST update contract", async () => {
    await expect(clientService.updateClientById({
      id: 1,
      clientCode: "renamed-client",
    })).rejects.toThrow("客户端编码创建后不可修改");

    expect(clientRepository.updateClientById).not.toHaveBeenCalled();
  });
});

describe("admin clientService.updateClientStatus", () => {
  test("updates status through updateClient and refreshes cache", async () => {
    clientRepository.updateClientByCodeWithOidcVersion.mockResolvedValue(makeClient({
      status: ClientStatus.Disable,
      oidcConfigVersion: 1,
    }));

    await expect(clientService.updateClientStatus("portal", ClientStatus.Disable)).resolves.toBe(true);

    expect(clientRepository.updateClientByCodeWithOidcVersion).toHaveBeenCalledWith(
      "portal",
      { status: ClientStatus.Disable },
      tx,
    );
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.status_update",
      details: expect.objectContaining({
        patch: { status: ClientStatus.Disable },
      }),
    }), tx);
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:portal", expect.any(String));
    expect(redis.set).toHaveBeenCalledWith("cache:client:secret:secret-1", expect.any(String));
    expect(redis.del).toHaveBeenCalledWith("oidc:client-runtime:portal");
    expect(redis.publish).toHaveBeenCalledWith("oidc:client-invalidation", expect.any(String));
  });
});

const publicOidcConfig = {
  clientType: OidcClientType.Public,
  redirectUris: ["https://portal.example.com/oidc/callback"],
  postLogoutRedirectUris: ["https://portal.example.com/logout"],
  allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
  tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
} satisfies ClientOidcConfigureDto;

const confidentialOidcConfig = {
  ...publicOidcConfig,
  clientType: OidcClientType.Confidential,
  tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic,
} satisfies ClientOidcConfigureDto;

describe("admin clientService OIDC management", () => {
  test("configures a confidential client disabled and returns the generated secret once", async () => {
    clientRepository.updateClientOidcByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "oidc-secret-hash",
      oidcConfigVersion: 1,
    }));

    const result = await clientService.configureClientOidc("portal", confidentialOidcConfig);

    expect(result.clientSecret).toStartWith("iam_oidc_");
    expect(result.client.hasOidcSecret).toBe(true);
    expect(result.client).not.toHaveProperty("oidcSecretHash");
    expect(hashSecret).toHaveBeenCalledWith(result.clientSecret, 10);
    expect(clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", expect.objectContaining({
      oidcEnabled: false,
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "oidc-secret-hash",
    }), tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.oidc.configure",
      details: expect.objectContaining({
        clientType: OidcClientType.Confidential,
        oidcConfigVersion: 1,
      }),
    }), tx);
    expect(JSON.stringify(auditService.recordAuditLog.mock.calls)).not.toContain(result.clientSecret!);
    expect(JSON.stringify(auditService.recordAuditLog.mock.calls)).not.toContain("oidc-secret-hash");
  });

  test("switches confidential to public by clearing the hash without returning a secret", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "old-hash",
    }));
    clientRepository.updateClientOidcByCode.mockResolvedValue(makeClient({
      oidcConfig: publicOidcConfig,
      oidcSecretHash: null,
      oidcConfigVersion: 2,
    }));

    const result = await clientService.configureClientOidc("portal", publicOidcConfig);

    expect(result.clientSecret).toBeUndefined();
    expect(result.client.hasOidcSecret).toBe(false);
    expect(clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", expect.objectContaining({
      oidcSecretHash: null,
    }), tx);
  });

  test("enables only a configured client with a valid secret state", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "hash",
    }));
    clientRepository.updateClientOidcByCode.mockResolvedValue(makeClient({
      oidcEnabled: true,
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "hash",
      oidcConfigVersion: 1,
    }));

    const result = await clientService.enableClientOidc("portal");

    expect(result.client.oidcState).toBe(OidcClientState.Enabled);
    expect(clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", { oidcEnabled: true }, tx);
  });

  test("requires disable before removing configuration", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      oidcEnabled: true,
      oidcConfig: publicOidcConfig,
    }));

    await expect(clientService.removeClientOidc("portal")).rejects.toThrow("请先禁用 OIDC");
    expect(clientRepository.updateClientOidcByCode).not.toHaveBeenCalled();
  });

  test("removes disabled configuration and clears the secret hash", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "hash",
    }));
    clientRepository.updateClientOidcByCode.mockResolvedValue(makeClient({ oidcConfigVersion: 2 }));

    const result = await clientService.removeClientOidc("portal");

    expect(result.client.oidcState).toBe(OidcClientState.Unconfigured);
    expect(clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", {
      oidcEnabled: false,
      oidcConfig: null,
      oidcSecretHash: null,
    }, tx);
  });

  test("rotates confidential secret and never exposes its hash", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "old-hash",
    }));
    clientRepository.updateClientOidcByCode.mockResolvedValue(makeClient({
      oidcConfig: confidentialOidcConfig,
      oidcSecretHash: "oidc-secret-hash",
      oidcConfigVersion: 3,
    }));

    const result = await clientService.rotateClientOidcSecret("portal");

    expect(result.clientSecret).toStartWith("iam_oidc_");
    expect(result.client).not.toHaveProperty("oidcSecretHash");
    expect(clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", {
      oidcSecretHash: "oidc-secret-hash",
    }, tx);
    expect(redis.del).toHaveBeenCalledWith("oidc:client-runtime:portal");
    expect(redis.publish).toHaveBeenCalledWith("oidc:client-invalidation", expect.any(String));
  });
});

describe("admin clientService.deleteClient", () => {
  test("soft deletes clients and removes current cache keys", async () => {
    await expect(clientService.deleteClient("portal")).resolves.toBe(true);

    expect(clientRepository.softDeleteClientByCode).toHaveBeenCalledWith("portal", tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.delete",
      details: expect.objectContaining({
        deleted: true,
      }),
    }), tx);
    expect(redis.del).toHaveBeenCalledWith("cache:client:code:portal");
    expect(redis.del).toHaveBeenCalledWith("cache:client:secret:secret-1");
  });
});
