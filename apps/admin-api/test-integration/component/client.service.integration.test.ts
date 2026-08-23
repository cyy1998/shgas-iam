import type { ClientService } from "@admin-api/services/client/client.service";
import type { ClientCustomSsoConfigureDto } from "@admin-api/services/client/client.type";
import { createClientService } from "@admin-api/services/client/client.service";
import { createFakePasswordHasher, createFakeRandom, createImmediateUnitOfWork } from "@admin-api/test/fakes";
import {
  AfterCommitRequiredTaskError,
  markTransactionRollbackConfirmed,
} from "@iam/api-core/uow";
import {
  ClientStatus,
  CustomSsoClientMode,
  CustomSsoClientState,
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
    subjectClaims: ["subjectIdentifier", "profile:name"],
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
      beginTrafficGateMutation: mock(async (clientCode: string) => ({
        clientCode,
        fenceTtlMs: 120_000,
        mutationId: "00000000-0000-4000-8000-000000000002",
      })),
      startTrafficGateMutationHeartbeat: mock(() => ({
        assertOwned: mock(async () => undefined),
        stopAndSettle: mock(async <T>(settle: () => Promise<T>) =>
          await settle()),
      })),
      publishTrafficGateMutation: mock(async () => "published" as const),
      abortTrafficGateMutation: mock(async () => "aborted" as const),
      beginRuntimeMutation: mock(async (clientCode: string) => ({
        clientCode,
        fenceTtlMs: 120_000,
        mutationId: "00000000-0000-4000-8000-000000000001",
      })),
      startRuntimeMutationHeartbeat: mock(() => ({
        assertOwned: mock(async () => undefined),
        stopAndSettle: mock(async <T>(settle: () => Promise<T>) =>
          await settle()),
      })),
      completeRuntimeMutation: mock(async () => "completed" as const),
      abortRuntimeMutation: mock(async () => "aborted" as const),
      invalidateClient: mock(async () => undefined),
      invalidateUpdatedClient: mock(async () => undefined),
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
  test("does not commit when the runtime mutation heartbeat loses ownership", async () => {
    let committed = false;
    const { service, deps } = createService({
      uowFactory: tx => ({
        async transaction(
          callback: (input: Record<string, unknown>) => Promise<unknown>,
        ) {
          try {
            const result = await callback({
              ...tx,
              afterCommit: {
                bestEffort: () => undefined,
                required: () => undefined,
              },
            });
            committed = true;
            return result;
          }
          catch (error) {
            markTransactionRollbackConfirmed(error);
            throw error;
          }
        },
      }),
    });
    const heartbeat = {
      assertOwned: mock(async () => {
        throw new Error("runtime mutation ownership lost");
      }),
      stopAndSettle: mock(async <T>(settle: () => Promise<T>) =>
        await settle()),
    };
    deps.clientCache.startRuntimeMutationHeartbeat
      .mockReturnValueOnce(heartbeat);

    await expect(
      service.configureClientCustomSso(
        "portal",
        gatewayCustomSsoConfig(),
      ),
    ).rejects.toThrow("runtime mutation ownership lost");

    expect(committed).toBe(false);
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).toHaveBeenCalledTimes(1);
  });

  test("does not mutate PostgreSQL when the runtime mutation fence cannot begin", async () => {
    const { service, deps, tx } = createService();
    deps.clientCache.beginRuntimeMutation.mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

    await expect(
      service.configureClientCustomSso(
        "portal",
        gatewayCustomSsoConfig(),
      ),
    ).rejects.toThrow("redis unavailable");

    expect(tx.clientRepository.updateClientCustomSsoByCode)
      .not
      .toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
  });

  test("aborts the runtime mutation fence when the database transaction rolls back", async () => {
    const { service, deps, tx } = createService();
    let releaseHeartbeat!: () => void;
    let markHeartbeatStopped!: () => void;
    const heartbeatStopped = new Promise<void>((resolve) => {
      markHeartbeatStopped = resolve;
    });
    const heartbeatGate = new Promise<void>((resolve) => {
      releaseHeartbeat = resolve;
    });
    deps.clientCache.startRuntimeMutationHeartbeat.mockReturnValueOnce({
      assertOwned: mock(async () => undefined),
      stopAndSettle: mock(async <T>(settle: () => Promise<T>) => {
        markHeartbeatStopped();
        await heartbeatGate;
        return await settle();
      }),
    });
    tx.clientRepository.updateClientCustomSsoByCode.mockRejectedValueOnce(
      new Error("database write failed"),
    );

    const operation = service.configureClientCustomSso(
      "portal",
      gatewayCustomSsoConfig(),
    );
    await heartbeatStopped;
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
    releaseHeartbeat();
    await expect(operation).rejects.toThrow("database write failed");

    expect(deps.clientCache.abortRuntimeMutation).toHaveBeenCalledWith({
      clientCode: "portal",
      fenceTtlMs: 120_000,
      mutationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
  });

  test("reports both the transaction and abort failures after a confirmed rollback", async () => {
    const { service, deps, tx } = createService();
    const databaseFailure = new Error("database write failed");
    const abortFailure = new Error("redis abort failed");
    tx.clientRepository.updateClientCustomSsoByCode.mockRejectedValueOnce(
      databaseFailure,
    );
    deps.clientCache.abortRuntimeMutation.mockRejectedValueOnce(
      abortFailure,
    );

    const caught = await service.configureClientCustomSso(
      "portal",
      gatewayCustomSsoConfig(),
    ).catch(error => error);

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([
      databaseFailure,
      abortFailure,
    ]);
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
  });

  test("keeps the runtime fenced when required completion fails after commit", async () => {
    const { service, deps, tx } = createService({
      afterCommitLogger: createAfterCommitLogger(),
    });
    tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoEnabled: true,
      customSsoConfig: gatewayCustomSsoConfig(),
      customSsoConfigVersion: 1,
    }));
    deps.clientCache.completeRuntimeMutation.mockRejectedValueOnce(
      new Error("redis completion failed"),
    );

    await expect(
      service.disableClientCustomSso("portal"),
    ).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(tx.clientRepository.updateClientCustomSsoByCode)
      .toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
  });

  test("stops the heartbeat without settling the fence when the transaction outcome is unknown", async () => {
    const commitOutcomeUnknown = new Error("commit response lost");
    const { service, deps } = createService({
      uowFactory: tx => ({
        async transaction(
          callback: (input: Record<string, unknown>) => Promise<unknown>,
        ) {
          await callback({
            ...tx,
            afterCommit: {
              bestEffort: () => undefined,
              required: () => undefined,
            },
          });
          throw commitOutcomeUnknown;
        },
      }),
    });
    const stopAndSettle = mock(async <T>(settle: () => Promise<T>) =>
      await settle());
    deps.clientCache.startRuntimeMutationHeartbeat.mockReturnValueOnce({
      assertOwned: mock(async () => undefined),
      stopAndSettle,
    });

    await expect(
      service.configureClientCustomSso(
        "portal",
        gatewayCustomSsoConfig(),
      ),
    ).rejects.toBe(commitOutcomeUnknown);

    expect(stopAndSettle).toHaveBeenCalledTimes(1);
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
  });

  test("uses the documented pre-commit fence only after the client row lock", async () => {
    const { service, deps, tx } = createService();

    await service.configureClientCustomSso(
      "portal",
      gatewayCustomSsoConfig(),
    );

    expect(
      tx.clientRepository.lockClientByCode.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.beginRuntimeMutation.mock.invocationCallOrder[0]!,
    );
    expect(
      deps.clientCache.beginRuntimeMutation.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.clientRepository.updateClientCustomSsoByCode
        .mock
        .invocationCallOrder[0]!,
    );
    expect(
      tx.clientRepository.updateClientCustomSsoByCode
        .mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.completeRuntimeMutation.mock.invocationCallOrder[0]!,
    );
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
      client: {
        clientCode: "portal",
        status: ClientStatus.Maintenance,
        customSsoState: "disabled",
        customSsoMode: CustomSsoClientMode.Independent,
        hasCustomSsoSecret: true,
        customSsoConfigVersion: 1,
      },
      customSsoSecret: "iam_sso_test_secret",
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
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(expect.objectContaining({
      clientCode: "portal",
    }));
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

    await expect(service.enableClientCustomSso("portal")).resolves.toMatchObject({
      client: {
        status: ClientStatus.Maintenance,
        customSsoState: "enabled",
        customSsoConfigVersion: 8,
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
    expect(deps.clientCache.invalidateClient).toHaveBeenCalled();
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
    await expect(disableCase.service.disableClientCustomSso("portal")).resolves.toMatchObject({
      client: { customSsoState: "disabled", customSsoConfigVersion: 4 },
    });
    expect(disableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "custom-sso",
      reason: "client_protocol_disabled",
    }));
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
    await expect(removeCase.service.removeClientCustomSso("portal")).resolves.toMatchObject({
      client: {
        customSsoState: "unconfigured",
        customSsoMode: null,
        hasCustomSsoSecret: false,
        customSsoConfigVersion: 5,
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
      client: { customSsoConfigVersion: 6, hasCustomSsoSecret: true },
      customSsoSecret: "iam_sso_test_secret",
    });
    const [rotateAudit] = rotateCase.tx.auditService.recordAuditLog.mock.calls[0] ?? [];
    expect(rotateAudit).toMatchObject({
      action: "admin.client.custom_sso.rotate_secret",
    });
    expect(JSON.stringify(rotateAudit)).not.toContain("iam_sso_test_secret");
    expect(JSON.stringify(rotateAudit)).not.toContain("hashed-secret");
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

    await expect(gatewayToIndependent.service.configureClientCustomSso("portal", independent))
      .resolves
      .toMatchObject({
        customSsoSecret: "iam_sso_test_secret",
        client: { customSsoConfigVersion: 3, customSsoMode: CustomSsoClientMode.Independent },
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
    expect(gatewayResult).not.toHaveProperty("customSsoSecret");
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
    expect(independentResult).not.toHaveProperty("customSsoSecret");
    expect(independentToIndependent.deps.random.customSsoClientSecret).not.toHaveBeenCalled();
    expect(independentToIndependent.tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledWith("portal", {
      customSsoEnabled: false,
      customSsoConfig: changedIndependent,
      customSsoSecretHash: "preserved-hash",
    });
    expect(JSON.stringify(independentResult)).not.toContain("preserved-hash");
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
        record: { customSsoEnabled: true, customSsoConfig: independent, customSsoSecretHash: "hash" },
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
        record: { customSsoConfig: independent, customSsoSecretHash: "hash" },
        invoke: service => service.disableClientCustomSso("portal"),
      },
      {
        record: { customSsoConfig: null, customSsoSecretHash: null },
        invoke: service => service.removeClientCustomSso("portal"),
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

      await expect(stateCase.invoke(service)).rejects.toBeInstanceOf(CustomSsoClientStateError);
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

  test("reports required Custom SSO cache invalidation failure after commit and still attempts revocation", async () => {
    const afterCommitLogger = createAfterCommitLogger();
    const { service, deps, tx } = createService({ afterCommitLogger });
    const cacheFailure = new Error("cache unavailable");
    deps.clientCache.invalidateClient.mockRejectedValueOnce(cacheFailure);
    tx.clientRepository.updateClientCustomSsoByCode.mockResolvedValueOnce(client({
      customSsoConfig: gatewayCustomSsoConfig(),
      customSsoSecretHash: null,
      customSsoConfigVersion: 1,
    }));

    await expect(service.configureClientCustomSso("portal", gatewayCustomSsoConfig()))
      .rejects
      .toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(tx.clientRepository.updateClientCustomSsoByCode).toHaveBeenCalledTimes(1);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "custom-sso",
    }));
    expect(afterCommitLogger.error).toHaveBeenCalledWith(expect.objectContaining({
      afterCommit: "admin.client.custom_sso.cache.invalidate",
      err: cacheFailure,
      mode: "required",
    }), "required afterCommit task failed");
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
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

    await expect(service.createClient(input as any)).resolves.toMatchObject({ clientCode: "portal" });

    expect(tx.clientRepository.createClient).toHaveBeenCalledWith(input);
    expect(tx.auditService.recordAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "admin.client.create",
      targetCode: "portal",
    }));
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
    );
    expect(
      tx.clientRepository.createClient.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.invalidateClient.mock.invocationCallOrder[0]!,
    );
    expect(deps.clientCache.beginRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.startRuntimeMutationHeartbeat)
      .not
      .toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
  });

  test("does not acquire an existing-client runtime fence while creating a client", async () => {
    const { service, deps, tx } = createService();
    deps.clientCache.beginRuntimeMutation.mockRejectedValueOnce(
      new Error("redis unavailable"),
    );

    await expect(service.createClient({
      clientCode: "portal",
      clientName: "Portal",
      clientSecret: "secret",
      url: "https://portal.example.com",
      status: ClientStatus.Enable,
      description: null,
      extAttributes: client().extAttributes,
    } as any)).resolves.toMatchObject({ clientCode: "portal" });

    expect(tx.clientRepository.createClient).toHaveBeenCalled();
    expect(deps.clientCache.beginRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
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
    } as any)).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(tx.clientRepository.createClient).toHaveBeenCalled();
    expect(tx.auditService.recordAuditLog).toHaveBeenCalled();
    expect(deps.clientCache.invalidateClient).toHaveBeenCalled();
    expect(deps.clientCache.beginRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).not.toHaveBeenCalled();
    expect(deps.clientCache.abortRuntimeMutation).not.toHaveBeenCalled();
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

    await expect(service.updateClientStatus("portal", ClientStatus.Disable)).resolves.toBe(true);

    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs).toHaveBeenCalledWith("portal", {
      status: ClientStatus.Disable,
    });
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalled();
    expect(deps.clientCache.beginRuntimeMutation).toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).toHaveBeenCalled();
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
    expect(disabledResult).toMatchObject({
      customSsoConfigVersion: 8,
      customSsoConfig,
      customSsoState: CustomSsoClientState.Enabled,
    });
    expect(reenabledResult).toMatchObject({
      customSsoConfigVersion: 8,
      oidcConfigVersion: 2,
      customSsoConfig,
      customSsoState: CustomSsoClientState.Enabled,
    });
    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalledTimes(2);
    expect(deps.clientCache.completeRuntimeMutation).toHaveBeenCalledTimes(2);
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
    ).resolves.toMatchObject({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    });
    await expect(
      service.updateClient("portal", { status: ClientStatus.Enable }),
    ).resolves.toMatchObject({
      status: ClientStatus.Enable,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    });

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
    ).resolves.toBe(true);

    expect(tx.clientRepository.updateClientByCode).toHaveBeenCalledWith(
      "portal",
      { status: ClientStatus.Maintenance },
    );
    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs)
      .not
      .toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
    expect(deps.clientCache.publishTrafficGateMutation).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
      ClientStatus.Maintenance,
    );
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
    ).resolves.toBe(true);

    expect(tx.clientRepository.updateClientByCodeWithProtocolEpochs)
      .not
      .toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("publishes the committed maintenance state through the traffic gate", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.updateClientByCode
      .mockResolvedValueOnce(client({
        status: ClientStatus.Maintenance,
        customSsoConfigVersion: 1,
        oidcConfigVersion: 2,
      }));

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).resolves.toBe(true);

    expect(deps.clientCache.beginTrafficGateMutation).toHaveBeenCalledWith(
      "portal",
      expect.any(String),
    );
    expect(deps.clientCache.publishTrafficGateMutation).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
      ClientStatus.Maintenance,
    );
    expect(
      tx.clientRepository.lockClientByCode.mock.invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.beginTrafficGateMutation.mock.invocationCallOrder[0]!,
    );
    expect(
      deps.clientCache.beginTrafficGateMutation.mock.invocationCallOrder[0],
    ).toBeLessThan(
      tx.clientRepository.updateClientByCode
        .mock
        .invocationCallOrder[0]!,
    );
    expect(
      tx.clientRepository.updateClientByCode
        .mock
        .invocationCallOrder[0],
    ).toBeLessThan(
      deps.clientCache.publishTrafficGateMutation.mock.invocationCallOrder[0]!,
    );
  });

  test("reports a required traffic gate publish failure after committing the status", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.updateClientByCode
      .mockResolvedValueOnce(client({
        status: ClientStatus.Maintenance,
        customSsoConfigVersion: 1,
        oidcConfigVersion: 2,
      }));
    deps.clientCache.publishTrafficGateMutation.mockRejectedValueOnce(
      new Error("traffic gate publish unavailable"),
    );

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).rejects.toBeInstanceOf(AfterCommitRequiredTaskError);

    expect(deps.clientCache.abortTrafficGateMutation).not.toHaveBeenCalled();
  });

  test("aborts both runtime fences when a status update rolls back", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.updateClientByCode
      .mockRejectedValueOnce(new Error("database write failed"));

    await expect(
      service.updateClientStatus("portal", ClientStatus.Maintenance),
    ).rejects.toThrow("database write failed");

    expect(deps.clientCache.abortTrafficGateMutation).toHaveBeenCalledTimes(1);
    expect(deps.clientCache.abortRuntimeMutation).toHaveBeenCalledTimes(1);
    expect(deps.clientCache.publishTrafficGateMutation).not.toHaveBeenCalled();
  });

  test("advances both protocol epochs for a status change through the legacy ID update path", async () => {
    const { service, tx } = createService();
    const customSsoConfig = gatewayCustomSsoConfig();
    tx.clientRepository.lockClientById.mockResolvedValueOnce(client({
      customSsoEnabled: true,
      customSsoConfig,
      customSsoConfigVersion: 7,
    }));
    tx.clientRepository.updateClientByIdWithProtocolEpochs
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
    })).resolves.toMatchObject({
      customSsoConfigVersion: 8,
      customSsoState: CustomSsoClientState.Enabled,
      oidcConfigVersion: 2,
    });
    expect(
      tx.clientRepository.updateClientByIdWithProtocolEpochs,
    ).toHaveBeenCalled();
  });

  test("leaves disable through the legacy ID update path without advancing protocol epochs", async () => {
    const { service, deps, tx } = createService();
    tx.clientRepository.lockClientById.mockResolvedValueOnce(client({
      status: ClientStatus.Disable,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));
    tx.clientRepository.updateClientById.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    }));

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      status: ClientStatus.Maintenance,
    })).resolves.toMatchObject({
      status: ClientStatus.Maintenance,
      customSsoConfigVersion: 7,
      oidcConfigVersion: 4,
    });

    expect(tx.clientRepository.updateClientById).toHaveBeenCalled();
    expect(tx.clientRepository.updateClientByIdWithProtocolEpochs)
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

    await expect(service.deleteClient("portal")).resolves.toBe(true);

    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.clientCache.beginRuntimeMutation).toHaveBeenCalled();
    expect(deps.clientCache.completeRuntimeMutation).toHaveBeenCalled();
    expect(deps.clientCache.invalidateClient).toHaveBeenCalledWith(
      expect.objectContaining({ clientCode: "portal" }),
    );
    expect(deps.sessionRevocation.revokeClientAllProtocols).toHaveBeenCalledWith({
      clientCode: "portal",
      reason: "client_deleted",
      auditContext: undefined,
      oidcInvalidationClient: expect.objectContaining({ clientCode: "portal" }),
    });
  });

  test("generic client secret changes do not mutate or revoke Custom SSO configuration", async () => {
    const { service, deps, tx } = createService();

    await expect(service.updateClientById({
      id: 1,
      clientCode: "portal",
      clientSecret: "rotated-secret",
      extAttributes: {},
    } as any)).resolves.toMatchObject({ clientCode: "portal" });

    expect(tx.clientRepository.updateClientById).toHaveBeenCalled();
    expect(tx.clientRepository.updateClientCustomSsoByCode).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalledWith(
      expect.objectContaining({ protocol: "custom-sso" }),
    );
  });

  test("presentation-only client updates do not revoke sessions", async () => {
    const { service, deps } = createService();

    await expect(service.updateClient("portal", { clientName: "Portal New" } as any))
      .resolves
      .toMatchObject({ clientName: "Portal New" });

    expect(deps.clientCache.invalidateUpdatedClient).toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientProtocol).not.toHaveBeenCalled();
    expect(deps.sessionRevocation.revokeClientAllProtocols).not.toHaveBeenCalled();
  });

  test("configures confidential OIDC clients with a generated secret", async () => {
    const { service, deps, tx } = createService();
    const input = {
      ...oidcConfig(),
    };
    (tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Maintenance,
    }));
    tx.clientRepository.updateClientOidcByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
      oidcConfig: input,
      oidcSecretHash: "hashed-secret:iam_oidc_test_secret",
      oidcConfigVersion: 2,
    }));

    await expect(service.configureClientOidc("portal", input)).resolves.toMatchObject({
      client: {
        clientCode: "portal",
        status: ClientStatus.Maintenance,
        hasOidcSecret: true,
        oidcConfigVersion: 2,
      },
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
      client: {
        clientCode: "portal",
        status: ClientStatus.Maintenance,
        oidcConfigVersion: 2,
      },
    });

    expect(enableCase.deps.sessionRevocation.revokeClientProtocol).toHaveBeenCalledWith(expect.objectContaining({
      protocol: "oidc",
      reason: "client_config_changed",
    }));

    const disableCase = createService();
    disableCase.tx.clientRepository.lockClientByCode.mockResolvedValueOnce(client({
      status: ClientStatus.Maintenance,
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
      client: {
        status: ClientStatus.Maintenance,
        oidcState: "enabled",
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
    (removeCase.tx.clientRepository.getClientByCode as any).mockResolvedValue(client({
      status: ClientStatus.Maintenance,
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
      status: ClientStatus.Maintenance,
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
