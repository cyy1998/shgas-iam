import { ClientManagementLevel, ClientStatus } from "@iam/contracts";
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
  updateClientById: mock(),
};

const redis = {
  del: mock(async () => 1),
  set: mock(async () => "OK"),
};

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
    ...overrides,
  };
}

beforeEach(() => {
  transaction.mockReset();
  transaction.mockImplementation(async (callback: (txArg: unknown) => Promise<unknown>) => callback(tx));
  redis.del.mockClear();
  redis.set.mockClear();
  auditService.recordAuditLog.mockReset();
  clientRepository.createClient.mockReset();
  clientRepository.getAnyClientByCode.mockReset();
  clientRepository.getClientByCode.mockReset();
  clientRepository.getClientById.mockReset();
  clientRepository.searchClientsPaged.mockReset();
  clientRepository.softDeleteClientByCode.mockReset();
  clientRepository.updateClientByCode.mockReset();
  clientRepository.updateClientById.mockReset();

  clientRepository.createClient.mockResolvedValue(makeClient());
  clientRepository.getAnyClientByCode.mockResolvedValue(null);
  clientRepository.getClientByCode.mockResolvedValue(makeClient());
  clientRepository.getClientById.mockResolvedValue(makeClient());
  clientRepository.searchClientsPaged.mockResolvedValue({ rows: [makeClient()], total: 1 });
  clientRepository.softDeleteClientByCode.mockResolvedValue(makeClient({ isDelete: true }));
  clientRepository.updateClientByCode.mockResolvedValue(makeClient());
  clientRepository.updateClientById.mockResolvedValue(makeClient());
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
      result: [{ clientCode: "portal", clientSecret: "hidden" }],
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

  test("rejects renaming to an existing client code", async () => {
    clientRepository.getAnyClientByCode.mockResolvedValue(makeClient({ clientCode: "taken" }));

    await expect(clientService.updateClient("portal", { clientCode: "taken" })).rejects.toThrow(
      "重命名客户端编码失败",
    );

    expect(clientRepository.updateClientByCode).not.toHaveBeenCalled();
  });

  test("deletes old code and secret cache when identifiers change", async () => {
    clientRepository.getClientByCode.mockResolvedValue(makeClient({
      clientCode: "old-portal",
      clientSecret: "old-secret",
    }));
    clientRepository.updateClientByCode.mockResolvedValue(makeClient({
      clientCode: "new-portal",
      clientSecret: "new-secret",
    }));

    await expect(clientService.updateClient("old-portal", {
      clientCode: "new-portal",
      clientSecret: "new-secret",
    })).resolves.toMatchObject({ clientCode: "new-portal" });

    expect(redis.del).toHaveBeenCalledWith("cache:client:code:old-portal");
    expect(redis.del).toHaveBeenCalledWith("cache:client:secret:old-secret");
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:new-portal", expect.any(String));
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

describe("admin clientService.updateClientStatus", () => {
  test("updates status through updateClient and refreshes cache", async () => {
    clientRepository.updateClientByCode.mockResolvedValue(makeClient({ status: ClientStatus.Disable }));

    await expect(clientService.updateClientStatus("portal", ClientStatus.Disable)).resolves.toBe(true);

    expect(clientRepository.updateClientByCode).toHaveBeenCalledWith("portal", { status: ClientStatus.Disable }, tx);
    expect(auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.status_update",
      details: expect.objectContaining({
        patch: { status: ClientStatus.Disable },
      }),
    }), tx);
    expect(redis.set).toHaveBeenCalledWith("cache:client:code:portal", expect.any(String));
    expect(redis.set).toHaveBeenCalledWith("cache:client:secret:secret-1", expect.any(String));
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
