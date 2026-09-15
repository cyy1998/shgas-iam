import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createClientService } from "@admin-api/services/client/client.service";
import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { ClientStatus } from "@iam/contracts";

import { describe, expect, mock, test } from "bun:test";

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

function _createAfterCommitLogger() {
  return {
    warn: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
    error: mock((_obj: Record<string, unknown>, _msg: string) => undefined),
  };
}

function revokeSummary() {
  return {
    principalSessions: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    bindings: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    credentials: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    artifacts: { revoked: 0, alreadyRevoked: 0, missing: 0, excluded: 0 },
    cleanup: { attempted: 0, succeeded: 0, failed: 0, failures: [] },
  };
}

function createService(
  options: {
    afterCommitLogger?: ReturnType<typeof _createAfterCommitLogger>;
    uowFactory?: (tx: Record<string, unknown>) => unknown;
  } = {},
) {
  const tx = {
    auditService: { recordAuditLog: mock(async (_input: unknown) => undefined) },
    clientRepository: {
      createClient: mock(async (input: Record<string, unknown>) => client(input)),
      getAnyClientByCode: mock(async () => null),
      getClientByCode: mock(async () => client()),
      lockClientByCode: mock(async () => client()),
      lockClientById: mock(async () => client()),
      getClientById: mock(async () => client()),
      softDeleteClientByCode: mock(async () => client({ isDelete: true })),
      updateClientByCode: mock(async (_clientCode: string, data: Record<string, unknown>) => client(data)),
      updateClientByCodeWithProtocolEpochs: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({
          ...data,
          customSsoConfigVersion: 1,
          oidcConfigVersion: 2,
        }),
      ),
      updateClientById: mock(async (data: Record<string, unknown>) => client(data)),
      updateClientByIdWithProtocolEpochs: mock(async (data: Record<string, unknown>) =>
        client({
          ...data,
          customSsoConfigVersion: 1,
          oidcConfigVersion: 2,
        }),
      ),
      updateClientOidcByCode: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, oidcConfigVersion: 2 }),
      ),
      updateClientCustomSsoByCode: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, customSsoConfigVersion: 1 }),
      ),
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
    sessionRevocation: {
      revokeClientAllProtocols: mock(async () => revokeSummary()),
      revokeClientProtocol: mock(async () => revokeSummary()),
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow:
      options.uowFactory?.(tx)
      ?? createImmediateUnitOfWork(tx, {
        logger: options.afterCommitLogger,
      }),
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
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
    );
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

  test("generic client secret changes do not mutate or revoke Custom SSO configuration", async () => {
    const { service, deps, tx } = createService();

    await expect(
      service.updateClientById({
        id: 1,
        clientCode: "portal",
        clientSecret: "rotated-secret",
        extAttributes: {},
      } as any),
    ).resolves.toEqual({ changed: true, result: null });

    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalled();
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "custom-sso" }),
    );
  });
});
