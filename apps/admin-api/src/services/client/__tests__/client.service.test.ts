import { createFakeLogger, createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  ClientManagementLevel,
  ClientStatus,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import { createClientService } from "../client.service";

function client(overrides: Record<string, unknown> = {}) {
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
    extAttributes: {
      callbackEndpoint: "https://portal.example.com/sso/callback",
      logoutEndpoint: "https://portal.example.com/sso/logout",
      managementLevel: ClientManagementLevel.Gateway,
      requireOrcas: false,
      userExcluding: [],
      validRedirectUrls: ["https://portal.example.com"],
    },
    oidcEnabled: false,
    oidcConfig: null,
    oidcSecretHash: null,
    oidcConfigVersion: 1,
    ...overrides,
  };
}

function createService() {
  const tx = {
    auditService: { recordAuditLog: mock(async () => undefined) },
    clientRepository: {
      createClient: mock(async (input: Record<string, unknown>) => client(input)),
      getAnyClientByCode: mock(async () => null),
      getClientByCode: mock(async () => client()),
      getClientById: mock(async () => client()),
      softDeleteClientByCode: mock(async () => client({ isDelete: true })),
      updateClientByCode: mock(async (_clientCode: string, data: Record<string, unknown>) => client(data)),
      updateClientByCodeWithOidcVersion: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, oidcConfigVersion: 2 })),
      updateClientById: mock(async (data: Record<string, unknown>) => client(data)),
      updateClientByIdWithOidcVersion: mock(async (data: Record<string, unknown>) =>
        client({ ...data, oidcConfigVersion: 2 })),
      updateClientOidcByCode: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, oidcConfigVersion: 2 })),
    },
  };
  const deps = {
    clientRepository: {
      getClientByCode: mock(async () => client()),
      searchClientsPaged: mock(async () => ({ rows: [client()], total: 1 })),
    },
    clientCache: {
      deleteClient: mock(async () => undefined),
      setClient: mock(async () => undefined),
      syncUpdatedClient: mock(async () => undefined),
    },
    logger: createFakeLogger(),
    oidcInvalidation: {
      invalidateClient: mock(async () => undefined),
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow: createImmediateUnitOfWork(tx),
  } as any;
  return { service: createClientService(deps), deps, tx };
}

describe("createClientService", () => {
  test("maps paged client search results", async () => {
    const { service } = createService();

    await expect(service.searchClientsForAdmin({
      exactConditions: {},
      fuzzyConditions: {},
      pageNum: 1,
      pageSize: 10,
    } as any)).resolves.toMatchObject({
      result: [{ clientCode: "portal", hasOidcSecret: false }],
      total: 1,
      pages: 1,
    });
  });

  test("creates a client in a unit of work and populates cache afterwards", async () => {
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

    await expect(service.createClient(input as any)).resolves.toMatchObject({ clientCode: "portal" });

    expect(tx.clientRepository.createClient).toHaveBeenCalledWith(input);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.create",
      targetCode: "portal",
    }));
    expect(deps.clientCache.setClient).toHaveBeenCalledWith(expect.objectContaining({ clientCode: "portal" }));
  });

  test("rejects duplicate client codes before creating", async () => {
    const { service, tx } = createService();
    (tx.clientRepository.getAnyClientByCode as any).mockResolvedValue(client());

    await expect(service.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret",
      extAttributes: client().extAttributes,
    } as any)).rejects.toThrow("客户端编码已存在");

    expect(tx.clientRepository.createClient).not.toHaveBeenCalled();
  });

  test("status updates sync cache and invalidate OIDC runtime", async () => {
    const { service, deps, tx } = createService();

    await expect(service.updateClientStatus("portal", ClientStatus.Disable)).resolves.toBe(true);

    expect(tx.clientRepository.updateClientByCodeWithOidcVersion).toHaveBeenCalledWith("portal", {
      status: ClientStatus.Disable,
    });
    expect(deps.clientCache.syncUpdatedClient).toHaveBeenCalled();
    expect(deps.oidcInvalidation.invalidateClient).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      oidcConfigVersion: 2,
    }));
  });

  test("configures confidential OIDC clients with a generated secret", async () => {
    const { service, deps, tx } = createService();
    const input = {
      clientType: OidcClientType.Confidential as const,
      redirectUris: ["https://portal.example.com/oidc/callback"],
      postLogoutRedirectUris: ["https://portal.example.com/logout"],
      allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic as const,
    };

    await expect(service.configureClientOidc("portal", input)).resolves.toMatchObject({
      client: { clientCode: "portal", hasOidcSecret: true },
      clientSecret: "iam_oidc_test_secret",
    });

    expect(deps.passwordHasher.hashSecret).toHaveBeenCalledWith("iam_oidc_test_secret");
    expect(tx.clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", {
      oidcConfig: input,
      oidcEnabled: false,
      oidcSecretHash: "hashed-secret:iam_oidc_test_secret",
    });
    expect(deps.oidcInvalidation.invalidateClient).toHaveBeenCalled();
  });
});
