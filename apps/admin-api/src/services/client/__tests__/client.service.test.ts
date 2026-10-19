import { describe, expect, mock, test } from "bun:test";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createClientService } from "@admin-api/services/client/client.service";
import { createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { ClientSsoCallbackType, ClientSsoProtocol, ClientStatus } from "@iam/contracts";

function client(overrides: Record<string, unknown> = {}) {
  const record = {
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

  return record;
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async (_input: unknown) => undefined) },
    clientRepository: {
      createClient: mock(async (input: Record<string, unknown>) => client(input)),
      getAnyClientByCode: mock(async () => null),
      getClientByCode: mock(async () => client()),
      lockClientByCode: mock(async () => client()),
      getClientById: mock(async () => client()),
      updateClientByCode: mock(async (_clientCode: string, data: Record<string, unknown>) => client(data)),
    },
  };
  const deps = {
    clientRepository: {
      getClientByCode: mock(async () => client()),
      getClientById: mock(async () => client()),
      searchClientsPaged: mock(async () => ({ rows: [client()], total: 1 })),
    },
    clientCache: {
      invalidateClient: mock(async () => undefined),
      invalidateUpdatedClient: mock(async () => undefined),
    },
    clientRuntimeInvalidation: {
      invalidateClient: mock(async () => undefined),
    },
    clientMutationLogger: {
      error: mock((_fields: Record<string, unknown>, _message: string) => undefined),
    },
    management: {
      save: mock(async () => ({ changed: false, result: null })),
      deleteClient: mock(async () => ({ changed: true, result: null })),
    },
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createClientService(deps), deps, tx };
}

describe("createClientService", () => {
  test("maps paged client search results", async () => {
    const { service } = createService();

    await expect(
      service.searchClientsForAdmin({
        exactConditions: {},
        fuzzyConditions: {},
        pageNum: 1,
        pageSize: 10,
      } as any),
    ).resolves.toMatchObject({
      result: [{ clientCode: "portal", hasSsoSecret: false }],
      total: 1,
      pages: 1,
    });
  });

  test("creates a client in a unit of work and invalidates stale cache afterwards", async () => {
    const { service, deps, tx } = createService();
    const input = {
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret",
      url: "https://portal.example.com",
      status: ClientStatus.Enable,
      description: null,
      extAttributes: client().extAttributes,
    };

    await expect(service.createClient(input as any)).resolves.toMatchObject({
      changed: true,
      result: { clientCode: "portal" },
    });

    expect(tx.clientRepository.createClient).toHaveBeenCalledWith(input);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.client.create",
        targetCode: "portal",
      }),
    );
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(expect.objectContaining({ clientCode: "portal" }));
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(tx.clientRepository.createClient.mock.invocationCallOrder[0]).toBeLessThan(
      deps.clientCache.invalidateClient.mock.invocationCallOrder[0]!,
    );
  });

  test("reports required cache failures after creating a client", async () => {
    const { service, deps, tx } = createService();
    deps.clientCache.invalidateClient.mockRejectedValueOnce(new Error("cache down"));

    await expect(
      service.createClient({
        clientCode: "portal",
        clientName: "Portal",
        clientSecret: "secret",
        url: "https://portal.example.com",
        status: ClientStatus.Enable,
        description: null,
        extAttributes: client().extAttributes,
      } as any),
    ).rejects.toBeInstanceOf(AdminMutationCommittedError);

    expect(tx.clientRepository.createClient).toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).toHaveBeenCalled();
    expect(deps.clientCache.invalidateClient).toHaveBeenCalled();
  });

  test("rejects duplicate client codes before creating", async () => {
    const { service, tx } = createService();
    (tx.clientRepository.getAnyClientByCode as any).mockResolvedValue(client());

    await expect(
      service.createClient({
        clientCode: "portal",
        clientName: "Portal",
        clientSecret: "secret",
        extAttributes: client().extAttributes,
      } as any),
    ).rejects.toThrow("客户端编码已存在");

    expect(tx.clientRepository.createClient).not.toHaveBeenCalled();
  });

  test("Internal API secret updates submit only the independent credential patch", async () => {
    const { service, deps, tx } = createService();
    const existing = client({
      ssoEnabled: true,
      hasSsoSecret: true,
      ssoConfig: {
        protocol: ClientSsoProtocol.CustomSso,
        callbackType: ClientSsoCallbackType.Business,
        callbackEndpoint: "https://portal.example.com/sso/callback",
        validRedirectUrls: ["https://portal.example.com/*"],
        subjectClaims: ["subjectIdentifier"],
      },
    });
    deps.clientRepository.getClientById.mockResolvedValue(existing);
    tx.clientRepository.lockClientByCode.mockResolvedValue(existing);

    const result = await service.updateClientById({
      id: existing.id,
      clientCode: existing.clientCode,
      clientSecret: "rotated-secret",
      extAttributes: {},
    });

    expect(result).toEqual({ changed: true, result: null });
    expect(tx.clientRepository.updateClientByCode.mock.calls).toEqual([
      ["portal", { clientSecret: "rotated-secret", extAttributes: {} }],
    ]);
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal", clientSecret: "secret" }),
      expect.objectContaining({ clientCode: "portal", clientSecret: "rotated-secret" }),
    );
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.client.rotate_secret",
        details: expect.objectContaining({
          changed: true,
          patch: { extAttributes: {}, clientSecretRotated: true },
        }),
      }),
    );
  });
});
