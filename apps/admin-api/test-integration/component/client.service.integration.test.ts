import type { ClientService } from "@admin-api/services/client/client.service";
import type { ClientCustomSsoConfigureDto } from "@admin-api/services/client/client.type";
import { AdminMutationCommittedError } from "@admin-api/services/admin-mutation/admin-mutation";
import { createClientService } from "@admin-api/services/client/client.service";
import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  ClientStatus,
  CustomSsoClientMode,
  OidcClientType,
  OidcScope,
  OidcTokenEndpointAuthMethod,
} from "@iam/contracts";
import {
  CustomSsoClientConfigurationError,
  CustomSsoClientStateError,
  OidcClientStateError,
} from "@iam/domain/client";
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
    oidcEnabled: false,
    oidcConfig: null,
    oidcSecretHash: null,
    oidcConfigVersion: 1,
    customSsoEnabled: false,
    customSsoConfig: null,
    customSsoSecretHash: null,
    customSsoConfigVersion: 0,
    ...overrides,
  };

  return record;
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

function independentCustomSsoConfig(): ClientCustomSsoConfigureDto {
  return {
    mode: CustomSsoClientMode.Independent,
    validRedirectUrls: ["https://portal.example.com/sso/*"],
    subjectClaims: ["profile:name", "subjectIdentifier"],
    callbackEndpoint: "https://portal.example.com/sso/callback",
    logoutEndpoint: "https://portal.example.com/logout",
  };
}

function gatewayCustomSsoConfig(): ClientCustomSsoConfigureDto {
  return {
    mode: CustomSsoClientMode.Gateway,
    validRedirectUrls: ["https://portal.example.com/sso/*"],
    subjectClaims: ["subjectIdentifier"],
    orcas: { enabled: false },
  };
}

function createService(options: {
  afterCommitLogger?: ReturnType<typeof createAfterCommitLogger>;
  uowFactory?: (tx: Record<string, unknown>) => unknown;
} = {}) {
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
      updateClientByCodeWithProtocolEpochs: mock(async (
        _clientCode: string,
        data: Record<string, unknown>,
      ) =>
        client({
          ...data,
          customSsoConfigVersion: 1,
          oidcConfigVersion: 2,
        })),
      updateClientById: mock(async (data: Record<string, unknown>) => client(data)),
      updateClientByIdWithProtocolEpochs: mock(async (
        data: Record<string, unknown>,
      ) =>
        client({
          ...data,
          customSsoConfigVersion: 1,
          oidcConfigVersion: 2,
        })),
      updateClientOidcByCode: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, oidcConfigVersion: 2 })),
      updateClientCustomSsoByCode: mock(async (_clientCode: string, data: Record<string, unknown>) =>
        client({ ...data, customSsoConfigVersion: 1 })),
    },
  };
  const deps = {
    clientRepository: {
      getClientByCode: mock(async () => client()),
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
    sessionRevocation: {
      revokeClientAllProtocols: mock(async () => revokeSummary()),
      revokeClientProtocol: mock(async () => revokeSummary()),
    },
    passwordHasher: createFakePasswordHasher(),
    random: createFakeRandom(),
    uow: options.uowFactory?.(tx)
      ?? createImmediateUnitOfWork(tx, {
        logger: options.afterCommitLogger,
      }),
  } as any;
  return { service: createClientService(deps), deps, tx };
}

describe("createClientService", () => {
  test("rejects empty profile updates before locking and keeps ordinary no-ops free of audit and writes", async () => {
    const { service, tx, deps } = createService();
    for (const invoke of [
      () => service.updateClient("portal", {}),
      () => service.updateClientById({ id: 1, clientCode: "portal" }),
    ]) {
      const failure = await invoke().catch(error => error);
      expect(failure).toMatchObject({ httpStatus: 400 });
    }
    expect(tx.clientRepository.lockClientByCode).not.toHaveBeenCalled();
    expect(tx.clientRepository.lockClientById).not.toHaveBeenCalled();
    const result = await service.updateClient("portal", { clientName: "Portal", description: null });
    expect(result).toEqual({ changed: false, result: null });
    expect(tx.clientRepository.updateClientByCode).not.toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalledTimes(1);
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("retains same-value status and credential intent without rewriting epochs or revoking", async () => {
    for (const invoke of [
      (service: ClientService) => service.updateClient("portal", { status: ClientStatus.Enable }),
      (service: ClientService) => service.updateClientById({ id: 1, status: ClientStatus.Enable }),
      (service: ClientService) => service.updateClientStatus("portal", ClientStatus.Enable),
      (service: ClientService) => service.updateClient("portal", { clientSecret: "secret" }),
      (service: ClientService) => service.updateClientById({ id: 1, clientSecret: "secret" }),
    ]) {
      const { service, tx, deps } = createService();
      const result = await invoke(service);
      expect(result).toEqual({ changed: false, result: null });
      expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        details: expect.objectContaining({ changed: false }),
      }));
      expect(tx.clientRepository.updateClientByCode).not.toHaveBeenCalled();
      expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs).not.toHaveBeenCalled();
      expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
      expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
      expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalledTimes(1);
      expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(tx.auditService.recordAuditLog.mock.calls)).not.toContain("\"clientSecret\":\"secret\"");
    }
  });

  test("rejects zero-row basic writes before audit or invalidation", async () => {
    for (const [method, invoke] of [
      ["createClient", (service: ClientService) => service.createClient(client())],
      ["updateClientByCode", (service: ClientService) => service.updateClient("portal", { clientName: "Changed" })],
      ["updateClientByCodeWithProtocolEpochs", (service: ClientService) => service.updateClientStatus("portal", ClientStatus.Disable)],
      ["softDeleteClientByCode", (service: ClientService) => service.deleteClient("portal")],
    ] as const) {
      const { service, tx, deps } = createService();
      tx.clientRepository[method].mockResolvedValueOnce(null as never);
      const failure = await invoke(service).catch(error => error);
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(AdminMutationCommittedError);
      expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
      expect(deps.clientRuntimeInvalidation.invalidateClient).not.toHaveBeenCalled();
      expect(deps.clientCache.invalidateClient).not.toHaveBeenCalled();
      expect(deps.clientCache.invalidateUpdatedClient).not.toHaveBeenCalled();
    }
  });

  test("every public mutation maps required Snapshot failure to a safe committed error", async () => {
    const config = independentCustomSsoConfig();
    const disabledProtocols = {
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "private-oidc-hash",
      customSsoConfig: config,
      customSsoSecretHash: "private-sso-hash",
    };
    const commands: Array<{
      record?: Record<string, unknown>;
      invoke: (service: ClientService) => Promise<unknown>;
    }> = [
      { invoke: service => service.createClient(client()) },
      { invoke: service => service.updateClient("portal", { clientName: "Changed" }) },
      { invoke: service => service.updateClient("portal", { clientName: "Portal" }) },
      { invoke: service => service.updateClientById({ id: 1, clientName: "Changed" }) },
      { invoke: service => service.updateClientStatus("portal", ClientStatus.Disable) },
      { invoke: service => service.deleteClient("portal") },
      { invoke: service => service.configureClientOidc("portal", oidcConfig()) },
      { record: disabledProtocols, invoke: service => service.enableClientOidc("portal") },
      { record: { ...disabledProtocols, oidcEnabled: true }, invoke: service => service.disableClientOidc("portal") },
      { record: disabledProtocols, invoke: service => service.removeClientOidc("portal") },
      { record: disabledProtocols, invoke: service => service.rotateClientOidcSecret("portal") },
      { invoke: service => service.configureClientCustomSso("portal", config) },
      { record: disabledProtocols, invoke: service => service.enableClientCustomSso("portal") },
      { record: { ...disabledProtocols, customSsoEnabled: true }, invoke: service => service.disableClientCustomSso("portal") },
      { record: disabledProtocols, invoke: service => service.removeClientCustomSso("portal") },
      { record: disabledProtocols, invoke: service => service.rotateClientCustomSsoSecret("portal") },
    ];
    for (const command of commands) {
      const { service, tx, deps } = createService();
      const existing = client(command.record);
      tx.clientRepository.getClientByCode.mockResolvedValue(existing);
      tx.clientRepository.lockClientByCode.mockResolvedValue(existing);
      tx.clientRepository.lockClientById.mockResolvedValue(existing);
      tx.clientRepository.updateClientCustomSsoByCode.mockImplementation(async (_code, data) =>
        client({ ...existing, ...data, customSsoConfigVersion: 2 }));
      tx.clientRepository.updateClientOidcByCode.mockImplementation(async (_code, data) =>
        client({ ...existing, ...data, oidcConfigVersion: 2 }));
      deps.clientRuntimeInvalidation.invalidateClient.mockRejectedValueOnce(
        new Error("redis://private-secret@cache.internal/raw-snapshot-payload"),
      );
      const failure = await command.invoke(service).catch(error => error);
      expect(failure).toBeInstanceOf(AdminMutationCommittedError);
      expect(failure).toMatchObject({ code: "ADMIN_MUTATION_COMMITTED" });
      expect(failure).not.toHaveProperty("cause");
      expect(failure).not.toHaveProperty("result");
      const serialized = JSON.stringify(failure);
      for (const secret of ["private-secret", "raw-snapshot-payload", "private-oidc-hash", "private-sso-hash", "iam_oidc_test_secret", "iam_sso_test_secret"])
        expect(serialized).not.toContain(secret);
      expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
    }
  });

  test("configures an Independent Custom SSO client with a one-time secret after commit", async () => {
    const { service, deps, tx } = createService();
    const input = independentCustomSsoConfig();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
    }));
    tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfig: input,
      customSsoSecretHash: "hashed-secret:iam_sso_test_secret",
      customSsoConfigVersion: 1,
    }));

    const result = await service.configureClientCustomSso("portal", input);

    expect(result).toMatchObject({
      changed: true,
      result: {
        client: {
          clientCode: "portal",
          status: ClientStatus.Maintenance,
          customSsoState: "disabled",
          customSsoMode: CustomSsoClientMode.Independent,
          hasCustomSsoSecret: true,
          customSsoConfigVersion: 1,
        },
        customSsoSecret: "iam_sso_test_secret",
      },
    });
    expect(deps.passwordHasher.hashSecret).toHaveBeenCalledWith("iam_sso_test_secret");
    expect(tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: false,
      customSsoConfig: input,
      customSsoSecretHash: "hashed-secret:iam_sso_test_secret",
    });
    const [audit] = tx.auditService.recordAuditLog.mock.calls[0] ?? [];
    expect(audit).toMatchObject({
      action: "admin.client.custom_sso.configure",
      details: expect.objectContaining({
        customSsoConfigVersion: 1,
        mode: CustomSsoClientMode.Independent,
      }),
    });
    expect(JSON.stringify(audit)).not.toContain("iam_sso_test_secret");
    expect(JSON.stringify(audit)).not.toContain("hashed-secret");
    expect(JSON.stringify(audit)).not.toContain("subjectClaimCatalogVersion");
    expect(deps.clientCache.invalidateClient).not.toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
      protocol: "custom-sso",
      reason: "client_config_changed",
    }));
  });

  test("enables a locally valid disabled Custom SSO configuration during maintenance", async () => {
    const { service, deps, tx } = createService();
    const config = independentCustomSsoConfig();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfig: config,
      customSsoSecretHash: "hashed-secret",
      customSsoConfigVersion: 7,
    }));
    tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoEnabled: true,
      customSsoConfig: config,
      customSsoSecretHash: "hashed-secret",
      customSsoConfigVersion: 8,
    }));

    const enabled = await service.enableClientCustomSso("portal");
    expect(enabled).toMatchObject({
      changed: true,
      result: {
        client: {
          status: ClientStatus.Maintenance,
          customSsoState: "enabled",
          customSsoConfigVersion: 8,
        },
      },
    });

    expect(tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: true,
    });
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.custom_sso.enable",
      details: expect.objectContaining({
        customSsoState: "enabled",
        customSsoConfigVersion: 8,
      }),
    }));
    expect(deps.clientCache.invalidateClient).not.toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "custom-sso",
      reason: "client_config_changed",
    }));
  });

  test("disables, removes, and rotates Custom SSO through explicit state transitions", async () => {
    const config = independentCustomSsoConfig();

    const disableCase = createService();
    disableCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoEnabled: true,
      customSsoConfig: config,
      customSsoSecretHash: "old-hash",
      customSsoConfigVersion: 3,
    }));
    disableCase.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoEnabled: false,
      customSsoConfig: config,
      customSsoSecretHash: "old-hash",
      customSsoConfigVersion: 4,
    }));
    const disabled = await disableCase.service.disableClientCustomSso("portal");
    expect(disabled).toMatchObject({
      changed: true,
      result: {
        client: { customSsoState: "disabled", customSsoConfigVersion: 4 },
      },
    });
    expect(disableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "custom-sso",
      reason: "client_protocol_disabled",
    }));
    expect(disableCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(disableCase.tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.custom_sso.disable",
    }));

    const removeCase = createService();
    removeCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfig: config,
      customSsoSecretHash: "old-hash",
      customSsoConfigVersion: 4,
    }));
    removeCase.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: null,
      customSsoSecretHash: null,
      customSsoConfigVersion: 5,
    }));
    const removed = await removeCase.service.removeClientCustomSso("portal");
    expect(removed).toMatchObject({
      changed: true,
      result: {
        client: {
          customSsoState: "unconfigured",
          customSsoMode: null,
          hasCustomSsoSecret: false,
          customSsoConfigVersion: 5,
        },
      },
    });
    expect(removeCase.tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: false,
      customSsoConfig: null,
      customSsoSecretHash: null,
    });
    expect(removeCase.tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.custom_sso.remove",
    }));
    expect(removeCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");

    const rotateCase = createService();
    rotateCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfig: config,
      customSsoSecretHash: "old-hash",
      customSsoConfigVersion: 5,
    }));
    rotateCase.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: config,
      customSsoSecretHash: "hashed-secret:iam_sso_test_secret",
      customSsoConfigVersion: 6,
    }));
    const rotated = await rotateCase.service.rotateClientCustomSsoSecret("portal");
    expect(rotated).toMatchObject({
      changed: true,
      result: {
        client: { customSsoConfigVersion: 6, hasCustomSsoSecret: true },
        customSsoSecret: "iam_sso_test_secret",
      },
    });
    const [rotateAudit] = rotateCase.tx.auditService.recordAuditLog.mock.calls[0] ?? [];
    expect(rotateAudit).toMatchObject({
      action: "admin.client.custom_sso.rotate_secret",
    });
    expect(JSON.stringify(rotateAudit)).not.toContain("iam_sso_test_secret");
    expect(JSON.stringify(rotateAudit)).not.toContain("hashed-secret");
    expect(rotateCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("applies all disabled Custom SSO mode transitions with exact secret semantics", async () => {
    const gatewayToIndependent = createService();
    const independent = independentCustomSsoConfig();
    gatewayToIndependent.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      customSsoConfig: gatewayCustomSsoConfig(),
      customSsoSecretHash: null,
      customSsoConfigVersion: 2,
    }));
    gatewayToIndependent.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: independent,
      customSsoSecretHash: "hashed-secret:iam_sso_test_secret",
      customSsoConfigVersion: 3,
    }));

    const configured = await gatewayToIndependent.service.configureClientCustomSso("portal", independent);
    expect(configured).toMatchObject({
      changed: true,
      result: {
        customSsoSecret: "iam_sso_test_secret",
        client: { customSsoConfigVersion: 3, customSsoMode: CustomSsoClientMode.Independent },
      },
    });

    const independentToGateway = createService();
    const gateway = gatewayCustomSsoConfig();
    independentToGateway.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      customSsoConfig: independent,
      customSsoSecretHash: "old-hash",
      customSsoConfigVersion: 3,
    }));
    independentToGateway.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: gateway,
      customSsoSecretHash: null,
      customSsoConfigVersion: 4,
    }));

    const gatewayResult = await independentToGateway.service.configureClientCustomSso("portal", gateway);
    expect(gatewayResult.result.customSsoSecret).toBeUndefined();
    expect(independentToGateway.deps.random.customSsoClientSecret).not.toHaveBeenCalled();
    expect(independentToGateway.tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: false,
      customSsoConfig: gateway,
      customSsoSecretHash: null,
    });

    const independentToIndependent = createService();
    const changedIndependent = {
      ...independent,
      validRedirectUrls: ["https://portal.example.com/changed/*"],
    };
    independentToIndependent.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      customSsoConfig: independent,
      customSsoSecretHash: "preserved-hash",
      customSsoConfigVersion: 4,
    }));
    independentToIndependent.tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: changedIndependent,
      customSsoSecretHash: "preserved-hash",
      customSsoConfigVersion: 5,
    }));

    const independentResult = await independentToIndependent.service.configureClientCustomSso(
      "portal",
      changedIndependent,
    );
    expect(independentResult.result.customSsoSecret).toBeUndefined();
    expect(independentToIndependent.deps.random.customSsoClientSecret).not.toHaveBeenCalled();
    expect(independentToIndependent.tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: false,
      customSsoConfig: changedIndependent,
      customSsoSecretHash: "preserved-hash",
    });
    expect(JSON.stringify(independentResult)).not.toContain("preserved-hash");
  });

  test("Custom SSO same-target commands preserve the locked epoch and secret while auditing intent and invalidating", async () => {
    const independent = independentCustomSsoConfig();
    const gateway = gatewayCustomSsoConfig();
    const cases: Array<{
      record: Record<string, unknown>;
      invoke: (service: ClientService) => Promise<unknown>;
    }> = [
      ...[false, true].flatMap(customSsoEnabled => [independent, gateway].map(config => ({
        record: {
          customSsoConfig: config,
          customSsoEnabled,
          customSsoSecretHash: config.mode === CustomSsoClientMode.Independent ? "current-hash" : null,
        },
        invoke: (service: ClientService) => service.configureClientCustomSso("portal", {
          ...config,
          subjectClaims: [...config.subjectClaims].reverse(),
        }),
      }))),
      {
        record: { customSsoEnabled: true, customSsoConfig: independent, customSsoSecretHash: "current-hash" },
        invoke: service => service.enableClientCustomSso("portal"),
      },
      {
        record: { customSsoConfig: independent, customSsoSecretHash: "current-hash" },
        invoke: service => service.disableClientCustomSso("portal"),
      },
      {
        record: { customSsoConfig: null, customSsoSecretHash: null },
        invoke: service => service.removeClientCustomSso("portal"),
      },
    ];
    for (const scenario of cases) {
      const { service, deps, tx } = createService();
      tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
        ...scenario.record,
        customSsoConfigVersion: 9,
      }));
      const result = await scenario.invoke(service);
      expect(result).toMatchObject({ changed: false, result: { client: { customSsoConfigVersion: 9 } } });
      expect(JSON.stringify(result)).not.toContain("current-hash");
      expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
      expect(deps.random.customSsoClientSecret).not.toHaveBeenCalled();
      expect(deps.passwordHasher.hashSecret).not.toHaveBeenCalled();
      expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        details: expect.objectContaining({ changed: false }),
      }));
      expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
      expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    }
  });

  test("rejects every Custom SSO mutation outside its allowed state", async () => {
    type StateCase = {
      invoke: (service: ClientService) => Promise<unknown>;
      record: Record<string, unknown>;
    };
    const independent = independentCustomSsoConfig();
    const gateway = gatewayCustomSsoConfig();
    const cases: StateCase[] = [
      {
        record: {
          status: ClientStatus.Maintenance,
          customSsoEnabled: true,
          customSsoConfig: independent,
          customSsoSecretHash: "hash",
        },
        invoke: service => service.configureClientCustomSso("portal", gateway),
      },
      {
        record: { customSsoConfig: null, customSsoSecretHash: null },
        invoke: service => service.enableClientCustomSso("portal"),
      },
      {
        record: {
          status: ClientStatus.Disable,
          customSsoConfig: independent,
          customSsoSecretHash: "hash",
        },
        invoke: service => service.enableClientCustomSso("portal"),
      },
      {
        record: { customSsoConfig: null, customSsoSecretHash: null },
        invoke: service => service.disableClientCustomSso("portal"),
      },
      {
        record: {
          status: ClientStatus.Maintenance,
          customSsoEnabled: true,
          customSsoConfig: independent,
          customSsoSecretHash: "hash",
        },
        invoke: service => service.removeClientCustomSso("portal"),
      },
      {
        record: { customSsoConfig: gateway, customSsoSecretHash: null },
        invoke: service => service.rotateClientCustomSsoSecret("portal"),
      },
      {
        record: {
          status: ClientStatus.Maintenance,
          customSsoEnabled: true,
          customSsoConfig: independent,
          customSsoSecretHash: "hash",
        },
        invoke: service => service.rotateClientCustomSsoSecret("portal"),
      },
    ];

    for (const stateCase of cases) {
      const { service, tx } = createService();
      tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client(stateCase.record));

      const failure = await stateCase.invoke(service).catch(error => error);
      expect(failure).toBeInstanceOf(CustomSsoClientStateError);
      expect(failure).toMatchObject({ httpStatus: 409 });
      expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    }
  });

  test("fails closed when enabling a corrupted persisted Custom SSO secret state", async () => {
    const { service, tx } = createService();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      customSsoConfig: independentCustomSsoConfig(),
      customSsoSecretHash: null,
    }));

    await expect(service.enableClientCustomSso("portal"))
      .rejects
      .toBeInstanceOf(CustomSsoClientConfigurationError);
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
  });

  test("reports required Custom SSO Snapshot invalidation failure after commit and still attempts revocation", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps, tx } = createService({ afterCommitLogger });
    const cacheFailure = new Error("Runtime Snapshot unavailable");
    deps.clientRuntimeInvalidation.invalidateClient.mockRejectedValueOnce(
      cacheFailure,
    );
    tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: gatewayCustomSsoConfig(),
      customSsoSecretHash: null,
      customSsoConfigVersion: 1,
    }));

    await expect(service.configureClientCustomSso("portal", gatewayCustomSsoConfig()))
      .rejects
      .toBeInstanceOf(AdminMutationCommittedError);

    expect(tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledTimes(1);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "custom-sso",
    }));
    expect(afterCommitLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      afterCommit: "admin.client.runtime_snapshot.invalidate",
      err: cacheFailure,
      mode: "required",
    }), "required afterCommit task failed");
    expect(deps.clientCache.invalidateClient).not.toHaveBeenCalled();
  });

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

    await expect(service.createClient(input as any)).resolves.toMatchObject({ changed: true, result: { clientCode: "portal" } });

    expect(tx.clientRepository.createClient).toHaveBeenCalledWith(input);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.create",
      targetCode: "portal",
    }));
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
    );
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(
      tx.clientRepository.createClient.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.invalidateClient.mock.invocationCallOrder[0]!,
    );
  });

  test("reports required cache failures after creating a client", async () => {
    const { service, deps, tx } = createService();
    deps.clientCache.invalidateClient.mockRejectedValueOnce(new Error("cache down"));

    await expect(service.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret",
      url: "https://portal.example.com",
      status: ClientStatus.Enable,
      description: null,
      extAttributes: client().extAttributes,
    } as any)).rejects.toBeInstanceOf(AdminMutationCommittedError);

    expect(tx.clientRepository.createClient).toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).toHaveBeenCalled();
    expect(deps.clientCache.invalidateClient).toHaveBeenCalled();
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
    const customSsoConfig = independentCustomSsoConfig();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 7,
    }));
    tx.clientRepository.updateClientByCodeWithProtocolEpochs.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 8,
      oidcConfigVersion: 2,
    }));

    const result = await service.updateClientStatus("portal", ClientStatus.Disable);
    expect(result).toEqual({ changed: true, result: null });

    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs).toHaveBeenCalledWith("portal", {
      status: ClientStatus.Disable,
    });
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalledWith({
      clientCode: "portal",
      reason: "client_disabled",
      committedVersions: { oidc: 2, customSso: 8 },
      auditContext: undefined,
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

    await expect(service.updateClientStatus("portal", ClientStatus.Disable, auditContext)).resolves.toEqual({ changed: true, result: null });

    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalled();
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

  test("keeps pre-disable Custom SSO artifacts invalid after best-effort revoke failure and re-enable", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps, tx } = createService({ afterCommitLogger });
    const customSsoConfig = independentCustomSsoConfig();
    const enabled = client({
      status: ClientStatus.Enable,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 7,
    });
    const disabled = client({
      status: ClientStatus.Disable,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 8,
      oidcConfigVersion: 2,
    });
    const reenabled = client({
      status: ClientStatus.Enable,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 8,
      oidcConfigVersion: 2,
    });
    tx.clientRepository.lockClientByCode
      .mockResolvedValueOnce(enabled)
      .mockResolvedValueOnce(disabled);
    tx.clientRepository.updateClientByCodeWithProtocolEpochs
      .mockResolvedValueOnce(disabled);
    tx.clientRepository.updateClientByCode.mockResolvedValueOnce(reenabled);
    deps.sessionRevocation.revokeClientAllProtocols.mockRejectedValueOnce(
      new Error("session revoke down"),
    );

    const disabledResult = await service.updateClient(
      "portal",
      { status: ClientStatus.Disable },
    );
    const reenabledResult = await service.updateClient(
      "portal",
      { status: ClientStatus.Enable },
    );

    expect(
      tx.clientRepository.updateClientByCodeWithProtocolEpochs,
    ).toHaveBeenCalledTimes(1);
    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalledWith(
      "portal",
      { status: ClientStatus.Enable },
    );
    expect(disabledResult).toEqual({ changed: true, result: null });
    expect(reenabledResult).toEqual({ changed: true, result: null });
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalledTimes(2);
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(2);
  });

  test("maintenance round trips preserve protocol epochs and do not revoke", async () => {
    const { service, deps, tx } = createService();
    const enabled = client({
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    });
    const maintenance = client({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    });
    tx.clientRepository.lockClientByCode
      .mockResolvedValueOnce(enabled)
      .mockResolvedValueOnce(maintenance);
    tx.clientRepository.updateClientByCode
      .mockResolvedValueOnce(maintenance)
      .mockResolvedValueOnce(client({
        status: ClientStatus.Enable,
        customSsoConfigVersion: 7,
        oidcConfigVersion: 4,
      }));

    await expect(
      service.updateClient("portal", { status: ClientStatus.Maintenance }),
    ).resolves.toEqual({ changed: true, result: null });
    await expect(
      service.updateClient("portal", { status: ClientStatus.Enable }),
    ).resolves.toEqual({ changed: true, result: null });

    expect(
      tx.clientRepository.updateClientByCodeWithProtocolEpochs,
    ).not.toHaveBeenCalled();
    expect(tx.clientRepository.updateClientByCode).toHaveBeenNthCalledWith(
      1,
      "portal",
      { status: ClientStatus.Maintenance },
    );
    expect(tx.clientRepository.updateClientByCode).toHaveBeenNthCalledWith(
      2,
      "portal",
      { status: ClientStatus.Enable },
    );
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("idempotent status writes preserve protocol epochs and do not revoke", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));
    tx.clientRepository.updateClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).resolves.toEqual({ changed: false, result: null });

    expect(tx.clientRepository.updateClientByCode).not.toHaveBeenCalled();
    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs)
      .not
      .toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("idempotent disable writes do not advance protocol epochs or revoke again", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));
    tx.clientRepository.updateClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));

    await expect(
      service.updateClientStatus("portal", ClientStatus.Disable),
    ).resolves.toEqual({ changed: false, result: null });

    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs)
      .not
      .toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("invalidates the shared Runtime Snapshot after committing Maintenance", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.updateClientByCode
      .mockResolvedValueOnce(client({
        status: ClientStatus.Maintenance,
        customSsoConfigVersion: 1,
        oidcConfigVersion: 2,
      }));

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).resolves.toEqual({ changed: true, result: null });

    expect(
      tx.clientRepository.updateClientByCode
        .mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientRuntimeInvalidation.invalidateClient.mock.invocationCallOrder[0]!,
    );
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("reports required shared invalidation failure after committing Maintenance", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.updateClientByCode
      .mockResolvedValueOnce(client({
        status: ClientStatus.Maintenance,
        customSsoConfigVersion: 1,
        oidcConfigVersion: 2,
      }));
    deps.clientRuntimeInvalidation.invalidateClient.mockRejectedValueOnce(
      new Error("shared Runtime Snapshot invalidation unavailable"),
    );

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).rejects.toBeInstanceOf(AdminMutationCommittedError);

    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalledWith(
      "portal",
      { status: ClientStatus.Maintenance },
    );
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
  });

  test("advances both protocol epochs for a status change through the legacy ID update path", async () => {
    const { service, deps, tx } = createService();
    const customSsoConfig = gatewayCustomSsoConfig();
    tx.clientRepository.lockClientById.mockResolvedValueOnce(client({
      customSsoEnabled: true,
      customSsoConfig,
      customSsoConfigVersion: 7,
    }));
    tx.clientRepository.updateClientByCodeWithProtocolEpochs
      .mockResolvedValueOnce(client({
        status: ClientStatus.Disable,
        customSsoEnabled: true,
        customSsoConfig,
        customSsoConfigVersion: 8,
        oidcConfigVersion: 2,
      }));

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      status: ClientStatus.Disable,
    })).resolves.toEqual({ changed: true, result: null });
    expect(
      tx.clientRepository.updateClientByCodeWithProtocolEpochs,
    ).toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("leaves disable through the legacy ID update path without advancing protocol epochs", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.lockClientById.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));
    tx.clientRepository.updateClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      status: ClientStatus.Maintenance,
    })).resolves.toEqual({ changed: true, result: null });

    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalled();
    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs)
      .not
      .toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("soft delete keeps required cache delete and revokes all protocols", async () => {
    const { service, deps, tx } = createService();
    const customSsoConfig = independentCustomSsoConfig();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 7,
    }));
    tx.clientRepository.softDeleteClientByCode.mockResolvedValueOnce(client({
      isDelete: true,
      customSsoEnabled: true,
      customSsoConfig,
      customSsoSecretHash: "custom-hash",
      customSsoConfigVersion: 8,
      oidcConfigVersion: 2,
    }));

    const result = await service.deleteClient("portal");
    expect(result).toEqual({ changed: true, result: null });

    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
    );
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalledWith({
      clientCode: "portal",
      reason: "client_deleted",
      committedVersions: { oidc: 2, customSso: 8 },
      auditContext: undefined,
    });
  });

  test("generic client secret changes do not mutate or revoke Custom SSO configuration", async () => {
    const { service, deps, tx } = createService();

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      clientSecret: "rotated-secret",
      extAttributes: {},
    } as any)).resolves.toEqual({ changed: true, result: null });

    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalled();
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "custom-sso" }),
    );
  });

  test("presentation-only client updates do not revoke sessions", async () => {
    const { service, deps } = createService();

    await expect(service.updateClient("portal", { clientName: "Portal New" } as any))
      .resolves
      .toEqual({ changed: true, result: null });

    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("configures confidential OIDC clients with a generated secret", async () => {
    const { service, deps, tx } = createService();
    const input = {
      ...oidcConfig(),
    };
    (tx.clientRepository.lockClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Maintenance,
    }));
    tx.clientRepository.updateClientOidcByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: input,
      oidcSecretHash: "hashed-secret:iam_oidc_test_secret",
      oidcConfigVersion: 2,
    }));

    const result = await service.configureClientOidc("portal", input);
    expect(result).toMatchObject({
      changed: true,
      result: {
        client: {
          clientCode: "portal",
          status: ClientStatus.Maintenance,
          hasOidcSecret: true,
          oidcConfigVersion: 2,
        },
        clientSecret: "iam_oidc_test_secret",
      },
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
      committedVersion: 2,
      reason: "client_config_changed",
      auditContext: undefined,
    });
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("reports required Snapshot propagation failure after OIDC commit and still attempts artifact revocation", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps, tx } = createService({ afterCommitLogger });
    const invalidationFailure = new Error("Runtime Snapshot unavailable");
    deps.clientRuntimeInvalidation.invalidateClient.mockRejectedValueOnce(
      invalidationFailure,
    );
    tx.clientRepository.updateClientOidcByCode.mockResolvedValueOnce(client({
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hashed-secret:iam_oidc_test_secret",
      oidcConfigVersion: 2,
    }));
    let rejected: unknown;

    try {
      await service.configureClientOidc("portal", oidcConfig());
    }
    catch (error) {
      rejected = error;
    }

    expect(rejected).toBeInstanceOf(AdminMutationCommittedError);
    expect(tx.clientRepository.updateClientOidcByCode).toHaveBeenCalledTimes(1);
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "oidc" }),
    );
    expect(afterCommitLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      afterCommit: "admin.client.runtime_snapshot.invalidate",
      err: invalidationFailure,
      mode: "required",
    }), "required afterCommit task failed");
  });

  test("OIDC enable and disable revoke OIDC protocol with expected reasons", async () => {
    const enableCase = createService();
    enableCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));
    enableCase.tx.clientRepository.updateClientOidcByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
      oidcConfigVersion: 2,
    }));

    await expect(enableCase.service.enableClientOidc("portal")).resolves.toMatchObject({
      changed: true,
      result: {
        client: {
          clientCode: "portal",
          status: ClientStatus.Maintenance,
          oidcConfigVersion: 2,
        },
      },
    });

    expect(enableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_config_changed",
    }));
    expect(enableCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");

    const disableCase = createService();
    disableCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
    }));

    await expect(disableCase.service.disableClientOidc("portal")).resolves.toMatchObject({
      changed: true,
      result: {
        client: { clientCode: "portal" },
      },
    });

    expect(disableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_protocol_disabled",
    }));
    expect(disableCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("uses the locked Client status when enabling OIDC", async () => {
    const { service, tx } = createService();
    (tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Disable,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));
    tx.clientRepository.updateClientOidcByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
      oidcConfigVersion: 2,
    }));

    await expect(service.enableClientOidc("portal")).resolves.toMatchObject({
      changed: true,
      result: {
        client: {
          status: ClientStatus.Maintenance,
          oidcState: "enabled",
        },
      },
    });
    expect(tx.clientRepository.getClientByCode).not.toHaveBeenCalled();
  });

  test("rejects enabling OIDC while the client is disabled", async () => {
    const { service, tx } = createService();
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));

    await expect(service.enableClientOidc("portal"))
      .rejects
      .toBeInstanceOf(OidcClientStateError);
    expect(tx.clientRepository.updateClientOidcByCode).not.toHaveBeenCalled();
  });

  test("OIDC remove and rotate secret revoke OIDC protocol without leaking secret material", async () => {
    const removeCase = createService();
    (removeCase.tx.clientRepository.lockClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: false,
    }));

    await expect(removeCase.service.removeClientOidc("portal")).resolves.toMatchObject({
      changed: true,
      result: {
        client: { clientCode: "portal" },
      },
    });

    expect(removeCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_protocol_disabled",
    }));
    expect(removeCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");

    const rotateCase = createService();
    (rotateCase.tx.clientRepository.lockClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Maintenance,
      oidcConfig: oidcConfig(),
      oidcSecretHash: "hash",
      oidcEnabled: true,
    }));

    rotateCase.tx.clientRepository.updateClientOidcByCode.mockImplementationOnce(async (_code, data) => client({
      oidcConfig: oidcConfig(),
      oidcEnabled: true,
      ...data,
      oidcConfigVersion: 2,
    }));

    await expect(rotateCase.service.rotateClientOidcSecret("portal")).resolves.toMatchObject({
      changed: true,
      result: {
        client: { clientCode: "portal" },
        clientSecret: "iam_oidc_test_secret",
      },
    });

    const [input] = rotateCase.deps.sessionRevocation.revokeClientProtocol.mock.calls[0] ?? [];
    expect(input).toMatchObject({
      clientCode: "portal",
      protocol: "oidc",
      reason: "client_config_changed",
    });
    expect(JSON.stringify(input)).not.toContain("iam_oidc_test_secret");
    expect(JSON.stringify(input)).not.toContain("hashed-secret");
    expect(rotateCase.deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledWith("portal");
  });

  test("normalized OIDC configuration is an audited no-op without epochs, secrets or revocation", async () => {
    const { service, tx, deps } = createService();
    const stored = {
      ...oidcConfig(),
      redirectUris: ["https://portal.example.com/b", "https://portal.example.com/a"],
      postLogoutRedirectUris: ["https://portal.example.com/out-b", "https://portal.example.com/out-a"],
      allowedScopes: [OidcScope.Profile, OidcScope.OpenId],
    };
    tx.clientRepository.lockClientByCode.mockResolvedValue(client({
      oidcConfig: stored,
      oidcSecretHash: "latest-secret-hash",
      oidcEnabled: true,
      oidcConfigVersion: 9,
    }));
    const result = await service.configureClientOidc("portal", {
      ...stored,
      redirectUris: [...stored.redirectUris].reverse(),
      postLogoutRedirectUris: [...stored.postLogoutRedirectUris].reverse(),
      allowedScopes: [...stored.allowedScopes].reverse(),
    });
    expect(result).toMatchObject({ changed: false, result: { client: { oidcConfigVersion: 9, oidcState: "enabled" } } });
    expect(result.result.clientSecret).toBeUndefined();
    expect(tx.clientRepository.updateClientOidcByCode).not.toHaveBeenCalled();
    expect(deps.passwordHasher.hashSecret).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.oidc.configure",
      details: expect.objectContaining({ changed: false }),
    }));
  });

  test("same-target OIDC lifecycle retries retain intent and required invalidation only", async () => {
    const cases = [
      { method: "enableClientOidc", config: oidcConfig(), enabled: true, hash: "hash" },
      { method: "disableClientOidc", config: oidcConfig(), enabled: false, hash: "hash" },
      { method: "removeClientOidc", config: null, enabled: false, hash: null },
    ] as const;
    for (const input of cases) {
      const { service, tx, deps } = createService();
      tx.clientRepository.lockClientByCode.mockResolvedValue(client({
        oidcConfig: input.config,
        oidcEnabled: input.enabled,
        oidcSecretHash: input.hash,
        oidcConfigVersion: 7,
      }));
      const outcome = await service[input.method]("portal");
      expect(outcome).toMatchObject({ changed: false, result: { client: { oidcConfigVersion: 7 } } });
      expect(tx.clientRepository.updateClientOidcByCode).not.toHaveBeenCalled();
      expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
      expect(deps.clientRuntimeInvalidation.invalidateClient).toHaveBeenCalledTimes(1);
      expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
        details: expect.objectContaining({ changed: false }),
      }));
    }
  });

  test("configuration uses locked disabled state and newest secret rather than an old snapshot", async () => {
    const { service, tx, deps } = createService();
    const stored = client({ oidcConfig: oidcConfig(), oidcSecretHash: "newest-hash", oidcEnabled: false });
    tx.clientRepository.getClientByCode.mockResolvedValue(client({ ...stored, oidcEnabled: true, oidcSecretHash: "old-hash" }));
    tx.clientRepository.lockClientByCode.mockResolvedValue(stored);
    tx.clientRepository.updateClientOidcByCode.mockImplementation(async (_code, patch) =>
      client({ ...stored, ...patch, oidcConfigVersion: 2 }));
    const outcome = await service.configureClientOidc("portal", { ...oidcConfig(), redirectUris: ["https://portal.example.com/new"] });
    expect(outcome).toMatchObject({ changed: true, result: { client: { oidcState: "disabled", oidcConfigVersion: 2 } } });
    expect(tx.clientRepository.updateClientOidcByCode).toHaveBeenCalledWith("portal", expect.objectContaining({ oidcEnabled: false, oidcSecretHash: "newest-hash" }));
    expect(deps.passwordHasher.hashSecret).not.toHaveBeenCalled();
    expect(tx.clientRepository.getClientByCode).not.toHaveBeenCalled();
  });

  test("rotation and removal reject locked incompatible state before writing or auditing", async () => {
    const publicConfig = {
      ...oidcConfig(),
      clientType: OidcClientType.Public,
      tokenEndpointAuthMethod: OidcTokenEndpointAuthMethod.None,
    };
    const cases = [
      { method: "rotateClientOidcSecret", config: publicConfig, enabled: false, hash: null },
      { method: "rotateClientOidcSecret", config: null, enabled: false, hash: null },
      { method: "removeClientOidc", config: oidcConfig(), enabled: true, hash: "hash" },
    ] as const;
    for (const input of cases) {
      const { service, tx, deps } = createService();
      tx.clientRepository.lockClientByCode.mockResolvedValue(client({
        oidcConfig: input.config,
        oidcEnabled: input.enabled,
        oidcSecretHash: input.hash,
      }));
      const failure = await service[input.method]("portal").catch(error => error);
      expect(failure).toBeInstanceOf(OidcClientStateError);
      expect(tx.clientRepository.updateClientOidcByCode).not.toHaveBeenCalled();
      expect(tx.auditService.recordAuditLog).not.toHaveBeenCalled();
      expect(deps.clientRuntimeInvalidation.invalidateClient).not.toHaveBeenCalled();
    }
  });

  test("explicit rotations always change and deliver a fresh secret without including it in audit", async () => {
    const { service, tx, deps } = createService();
    const stored = client({ oidcConfig: oidcConfig(), oidcSecretHash: "original-hash" });
    tx.clientRepository.lockClientByCode.mockResolvedValue(stored);
    tx.clientRepository.updateClientOidcByCode.mockImplementation(async (_code, patch) =>
      client({ ...stored, ...patch, oidcConfigVersion: 2 }));
    deps.random.oidcClientSecret.mockReturnValueOnce("one-time-first").mockReturnValueOnce("one-time-second");
    const first = await service.rotateClientOidcSecret("portal");
    const second = await service.rotateClientOidcSecret("portal");
    expect(first).toMatchObject({ changed: true, result: { clientSecret: "one-time-first" } });
    expect(second).toMatchObject({ changed: true, result: { clientSecret: "one-time-second" } });
    expect(tx.clientRepository.updateClientOidcByCode).toHaveBeenCalledTimes(2);
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledTimes(2);
    const audit = JSON.stringify(tx.auditService.recordAuditLog.mock.calls);
    expect(audit).not.toContain("one-time-first");
    expect(audit).not.toContain("one-time-second");
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      details: expect.objectContaining({ changed: true }),
    }));
  });
});
