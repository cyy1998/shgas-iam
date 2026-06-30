import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import { AfterCommitRequiredTaskError } from "@iam/api-core/uow";
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

function createAfterCommitLogger() {
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

function oidcConfig() {
  return {
    clientType: OidcClientType.Confidential as const,
    redirectUris: ["https://portal.example.com/oidc/callback"],
    postLogoutRedirectUris: ["https://portal.example.com/logout"],
    allowedScopes: [OidcScope.OpenId, OidcScope.Profile],
    tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.ClientSecretBasic as const,
  };
}

function createService(options: { afterCommitLogger?: ReturnType<typeof createAfterCommitLogger> } = {}) {
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
    sessionRevocation: {
      revokeClientAllProtocols: mock(async () => revokeSummary()),
      revokeClientProtocol: mock(async () => revokeSummary()),
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow: createImmediateUnitOfWork(tx, { logger: options.afterCommitLogger }),
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

  test("reports required cache failures after creating a client", async () => {
    const { service, deps, tx } = createService();
    deps.clientCache.setClient.mockRejectedValueOnce(new Error("cache down"));

    await expect(service.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret",
      url: "https://portal.example.com",
      status: ClientStatus.Enable,
      description: null,
      extAttributes: client().extAttributes,
    } as any)).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(tx.clientRepository.createClient).toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).toHaveBeenCalled();
    expect(deps.clientCache.setClient).toHaveBeenCalled();
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

  test("disable status updates sync cache and revoke all protocols", async () => {
    const { service, deps, tx } = createService();

    await expect(service.updateClientStatus("portal", ClientStatus.Disable)).resolves.toBe(true);

    expect(tx.clientRepository.updateClientByCodeWithOidcVersion).toHaveBeenCalledWith("portal", {
      status: ClientStatus.Disable,
    });
    expect(deps.clientCache.syncUpdatedClient).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalledWith({
      clientCode: "portal",
      reason: "client_disabled",
      auditContext: undefined,
      oidcInvalidationClient: expect.objectContaining({
        clientCode: "portal",
        oidcConfigVersion: 2,
      }),
    });
  });

  test("keeps status update successful when best-effort session revoke fails", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps } = createService({ afterCommitLogger });
    const revocationFailure = new Error("session revoke down");
    const auditContext = {
      actorType: "admin" as const,
      actorUserId: 100,
      requestId: "req-client-revoke",
      traceId: "11111111111111111111111111111111",
    };
    deps.sessionRevocation.revokeClientAllProtocols.mockRejectedValueOnce(revocationFailure);

    await expect(service.updateClientStatus("portal", ClientStatus.Disable, auditContext)).resolves.toBe(true);

    expect(deps.clientCache.syncUpdatedClient).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalled();
    expect(afterCommitLogger.warn).toHaveBeenCalledWith({
      afterCommit: "admin.session_revoke.client_all_protocols",
      mode: "bestEffort",
      err: revocationFailure,
      requestId: "req-client-revoke",
      traceId: "11111111111111111111111111111111",
    }, "best-effort afterCommit task failed");
    expect(afterCommitLogger.error).not.toHaveBeenCalled();
  });

  test("maintenance status revokes only OIDC protocol", async () => {
    const { service, deps } = createService();

    await expect(service.updateClientStatus("portal", ClientStatus.Maintance)).resolves.toBe(true);

    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      auditContext: undefined,
      oidcInvalidationClient: expect.objectContaining({
        clientCode: "portal",
        oidcConfigVersion: 2,
      }),
    });
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("soft delete keeps required cache delete and revokes all protocols", async () => {
    const { service, deps } = createService();

    await expect(service.deleteClient("portal")).resolves.toBe(true);

    expect(deps.clientCache.deleteClient).toHaveBeenCalledWith(expect.objectContaining({ clientCode: "portal" }));
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalledWith({
      clientCode: "portal",
      reason: "client_deleted",
      auditContext: undefined,
      oidcInvalidationClient: expect.objectContaining({ clientCode: "portal" }),
    });
  });

  test("custom SSO session config changes revoke custom-sso protocol", async () => {
    const { service, deps, tx } = createService();

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      clientSecret: "rotated-secret",
      extAttributes: client().extAttributes,
    } as any)).resolves.toMatchObject({ clientCode: "portal" });

    expect(tx.clientRepository.updateClientById).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith({
      clientCode: "portal",
      protocol: "custom-sso",
      reason: "client_config_changed",
      auditContext: undefined,
      oidcInvalidationClient: undefined,
    });
  });

  test("presentation-only client updates do not revoke sessions", async () => {
    const { service, deps } = createService();

    await expect(service.updateClient("portal", { clientName: "Portal New" } as any))
      .resolves
      .toMatchObject({ clientName: "Portal New" });

    expect(deps.clientCache.syncUpdatedClient).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("configures confidential OIDC clients with a generated secret", async () => {
    const { service, deps, tx } = createService();
    const input = {
      ...oidcConfig(),
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
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
      auditContext: undefined,
      oidcInvalidationClient: expect.objectContaining({
        clientCode: "portal",
        oidcConfigVersion: 2,
      }),
    });
  });

  test("OIDC enable and disable revoke OIDC protocol with expected reasons", async () => {
    const enableCase = createService();
    (enableCase.tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));

    await expect(enableCase.service.enableClientOidc("portal")).resolves.toMatchObject({
      client: { clientCode: "portal" },
    });

    expect(enableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_config_changed",
    }));

    const disableCase = createService();
    (disableCase.tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
    }));

    await expect(disableCase.service.disableClientOidc("portal")).resolves.toMatchObject({
      client: { clientCode: "portal" },
    });

    expect(disableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_protocol_disabled",
    }));
  });

  test("OIDC remove and rotate secret revoke OIDC protocol without leaking secret material", async () => {
    const removeCase = createService();
    (removeCase.tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));

    await expect(removeCase.service.removeClientOidc("portal")).resolves.toMatchObject({
      client: { clientCode: "portal" },
    });

    expect(removeCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_protocol_disabled",
    }));

    const rotateCase = createService();
    (rotateCase.tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
    }));

    await expect(rotateCase.service.rotateClientOidcSecret("portal")).resolves.toMatchObject({
      client: { clientCode: "portal" },
      clientSecret: "iam_oidc_test_secret",
    });

    const [input] = rotateCase.deps.sessionRevocation.revokeClientProtocol.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
    });
    expect(JSON.stringify(input)).not.toContain("iam_oidc_test_secret");
    expect(JSON.stringify(input)).not.toContain("hashed-secret");
  });
});
