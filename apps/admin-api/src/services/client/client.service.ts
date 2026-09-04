import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { ClientStatus } from "@iam/contracts";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { AdminClientServiceDeps } from "./client.port";
import type {
  AdminClientRecord,
  ClientAdminListDto,
  ClientCreateDto,
  ClientCustomSsoConfigureDto,
  ClientInputDto,
  ClientOidcConfigureDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import {
  ClientCustomSsoConfigureDtoSchema,
} from "@admin-api/services/client/client.schema";
import {
  ClientStatus as ClientStatusValue,
  CustomSsoClientMode,
  CustomSsoClientState,
  OidcClientType,
} from "@iam/contracts";
import {
  customSsoClientConfigSchema,
  customSsoClientStorageStateSchema,
  oidcClientConfigSchema,
  oidcClientSecretStateSchema,
} from "@iam/db/schema";
import {
  ClientCodeExistsError,
  ClientCodeImmutableError,
  ClientNotFoundError,
  CustomSsoClientConfigurationError,
  CustomSsoClientStateError,
  OidcClientConfigurationError,
  OidcClientStateError,
  toClientAdminDetailDto,
  toClientAdminListDto,
  toGenericClientRuntimeDto,
} from "@iam/domain/client";
import { createAdminClientMutation } from "./client-mutation";

function toPageResult(rows: ClientAdminListDto[], total: number, query: ClientPaginationQueryDto) {
  return {
    result: rows,
    total,
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    pages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

function assertClientCodeUnchanged(currentClientCode: string, nextClientCode: string | undefined) {
  if (nextClientCode !== undefined && nextClientCode !== currentClientCode) {
    throw new ClientCodeImmutableError();
  }
}

function assertValidOidcStorageState(client: { oidcConfig: unknown; oidcSecretHash: string | null }) {
  const result = oidcClientSecretStateSchema.safeParse(client);
  if (!result.success) {
    throw new OidcClientConfigurationError(result.error.issues[0]?.message);
  }
}

function assertValidCustomSsoStorageState(client: {
  customSsoEnabled: boolean;
  customSsoConfig: unknown;
  customSsoSecretHash: string | null;
}) {
  const result = customSsoClientStorageStateSchema.safeParse(client);
  if (!result.success) {
    throw new CustomSsoClientConfigurationError(result.error.issues[0]?.message);
  }
}

function allowsProtocolEnable(status: ClientStatus) {
  return status === ClientStatusValue.Enable
    || status === ClientStatusValue.Maintenance;
}

function parseValidCustomSsoConfig(input: unknown) {
  const result = ClientCustomSsoConfigureDtoSchema.safeParse(input);
  if (!result.success) {
    throw new CustomSsoClientConfigurationError(result.error.issues[0]?.message);
  }
  return customSsoClientConfigSchema.parse(result.data);
}

function parseStoredCustomSsoConfig(input: unknown) {
  const result = customSsoClientConfigSchema.safeParse(input);
  if (!result.success) {
    throw new CustomSsoClientConfigurationError(result.error.issues[0]?.message);
  }
  return result.data;
}

type AdminClientTransactionContext = Parameters<Parameters<AdminClientServiceDeps["uow"]["transaction"]>[0]>[0];

type ClientSessionRevocationDecision
  = | { scope: "all-protocols"; reason: "client_disabled" | "client_deleted" | "client_config_changed" }
    | { scope: "protocol"; protocol: "custom-sso" | "oidc"; reason: "client_protocol_disabled" | "client_config_changed" };

function isEnteringClientDisable(current: ClientStatus, next: ClientStatus | undefined) {
  return next === ClientStatusValue.Disable
    && current !== ClientStatusValue.Disable;
}

function resolveClientUpdateSessionRevocations(
  existing: GenericClientRuntimeDto,
  data: Pick<ClientUpdateDto | ClientInputDto, "status">,
): ClientSessionRevocationDecision[] {
  if (isEnteringClientDisable(existing.status, data.status)) {
    return [{ scope: "all-protocols", reason: "client_disabled" }];
  }
  return [];
}

export function createClientService(deps: AdminClientServiceDeps) {
  const clientMutation = createAdminClientMutation({
    invalidation: deps.clientRuntimeInvalidation,
    logger: deps.clientMutationLogger,
    uow: deps.uow,
  });

  async function runLockedClientRuntimeMutation<T>(
    target: string | { readonly id: number },
    operation: (
      tx: AdminClientTransactionContext,
      existing: AdminClientRecord,
    ) => Promise<T>,
    transactionOptions: Parameters<
      AdminClientServiceDeps["uow"]["transaction"]
    >[1],
  ): Promise<T> {
    return await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = typeof target === "string"
        ? await tx.clientRepository.lockClientByCode(target)
        : await tx.clientRepository.lockClientById(target.id);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");

      return await bindTarget(existing.clientCode, async () => {
        return await operation(tx, existing);
      });
    }, transactionOptions);
  }

  async function txClientProtocolRevocation(
    client: Pick<AdminClientRecord, "clientCode">,
    protocol: "custom-sso" | "oidc",
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientProtocol({
      clientCode: client.clientCode,
      protocol,
      reason,
      auditContext,
    });
  }

  async function txClientAllProtocolsRevocation(
    client: Pick<AdminClientRecord, "clientCode">,
    reason: "client_disabled" | "client_deleted" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientAllProtocols({
      clientCode: client.clientCode,
      reason,
      auditContext,
    });
  }

  function registerClientSessionRevocations(
    tx: AdminClientTransactionContext,
    decisions: ClientSessionRevocationDecision[],
    client: Pick<AdminClientRecord, "clientCode">,
    auditContext?: AdminAuditContext,
  ) {
    for (const decision of decisions) {
      if (decision.scope === "all-protocols") {
        tx.afterCommit.bestEffort("admin.session_revoke.client_all_protocols", async () => {
          await txClientAllProtocolsRevocation(client, decision.reason, auditContext);
        });
        continue;
      }

      tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
        await txClientProtocolRevocation(client, decision.protocol, decision.reason, auditContext);
      });
    }
  }

  function registerCustomSsoInvalidation(
    tx: AdminClientTransactionContext,
    client: Pick<AdminClientRecord, "clientCode">,
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
      await txClientProtocolRevocation(client, "custom-sso", reason, auditContext);
    });
  }

  async function searchClientsForAdmin(query: ClientPaginationQueryDto) {
    const { rows, total } = await deps.clientRepository.searchClientsPaged(query);
    return toPageResult(rows.map(toClientAdminListDto), total, query);
  }

  async function getClientDetailByCode(clientCode: string) {
    const client = await deps.clientRepository.getClientByCode(clientCode);
    if (client === null)
      throw new ClientNotFoundError("客户端不存在");
    return toClientAdminDetailDto(client);
  }

  async function configureClientCustomSso(
    clientCode: string,
    input: ClientCustomSsoConfigureDto,
    auditContext?: AdminAuditContext,
  ) {
    const customSsoConfig = parseValidCustomSsoConfig(input);
    const result = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        if (existing.customSsoEnabled) {
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再修改配置");
        }

        let customSsoSecret: string | undefined;
        let customSsoSecretHash = existing.customSsoSecretHash;
        if (customSsoConfig.mode === CustomSsoClientMode.Gateway) {
          customSsoSecretHash = null;
        }
        else if (
          existing.customSsoConfig?.mode !== CustomSsoClientMode.Independent
          || customSsoSecretHash === null
        ) {
          customSsoSecret = deps.random.customSsoClientSecret();
          customSsoSecretHash = await deps.passwordHasher.hashSecret(customSsoSecret);
        }

        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
          customSsoEnabled: false,
          customSsoConfig,
          customSsoSecretHash,
        });
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.configure",
          toGenericClientRuntimeDto(client),
          {
            mode: customSsoConfig.mode,
            validRedirectUrls: customSsoConfig.validRedirectUrls,
            subjectClaims: customSsoConfig.subjectClaims,
            orcas: customSsoConfig.mode === CustomSsoClientMode.Gateway
              ? customSsoConfig.orcas
              : undefined,
            callbackEndpoint: customSsoConfig.mode === CustomSsoClientMode.Independent
              ? customSsoConfig.callbackEndpoint
              : undefined,
            logoutEndpoint: customSsoConfig.mode === CustomSsoClientMode.Independent
              ? customSsoConfig.logoutEndpoint
              : undefined,
            customSsoState: CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoInvalidation(tx, client, "client_config_changed", auditContext);
        return { client, customSsoSecret };
      },
      adminAuditTransactionOptions(auditContext),
    );
    const client = toClientAdminDetailDto(result.client);
    return result.customSsoSecret === undefined
      ? { client }
      : { client, customSsoSecret: result.customSsoSecret };
  }

  async function enableClientCustomSso(
    clientCode: string,
    auditContext?: AdminAuditContext,
  ) {
    const result = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        if (existing.customSsoConfig === null)
          throw new CustomSsoClientStateError("Custom SSO 尚未配置");
        if (existing.customSsoEnabled)
          throw new CustomSsoClientStateError("Custom SSO 已启用");
        if (!allowsProtocolEnable(existing.status)) {
          throw new CustomSsoClientStateError("全局状态停用的客户端不能启用 Custom SSO");
        }

        parseStoredCustomSsoConfig(existing.customSsoConfig);
        assertValidCustomSsoStorageState(existing);
        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
          customSsoEnabled: true,
        });
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.enable",
          toGenericClientRuntimeDto(client),
          {
            mode: client.customSsoConfig?.mode,
            subjectClaims: client.customSsoConfig?.subjectClaims,
            customSsoState: CustomSsoClientState.Enabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoInvalidation(
          tx,
          client,
          "client_config_changed",
          auditContext,
        );
        return client;
      },
      adminAuditTransactionOptions(auditContext),
    );
    return { client: toClientAdminDetailDto(result) };
  }

  async function disableClientCustomSso(
    clientCode: string,
    auditContext?: AdminAuditContext,
  ) {
    const result = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        if (existing.customSsoConfig === null)
          throw new CustomSsoClientStateError("Custom SSO 尚未配置");
        if (!existing.customSsoEnabled)
          throw new CustomSsoClientStateError("Custom SSO 已禁用");

        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
          customSsoEnabled: false,
        });
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.disable",
          toGenericClientRuntimeDto(client),
          {
            mode: client.customSsoConfig?.mode,
            subjectClaims: client.customSsoConfig?.subjectClaims,
            customSsoState: CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoInvalidation(
          tx,
          client,
          "client_protocol_disabled",
          auditContext,
        );
        return client;
      },
      adminAuditTransactionOptions(auditContext),
    );
    return { client: toClientAdminDetailDto(result) };
  }

  async function removeClientCustomSso(
    clientCode: string,
    auditContext?: AdminAuditContext,
  ) {
    const result = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        if (existing.customSsoConfig === null)
          throw new CustomSsoClientStateError("Custom SSO 尚未配置");
        if (existing.customSsoEnabled)
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再移除配置");

        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
          customSsoEnabled: false,
          customSsoConfig: null,
          customSsoSecretHash: null,
        });
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.remove",
          toGenericClientRuntimeDto(client),
          {
            previousMode: existing.customSsoConfig.mode,
            previousSubjectClaims: existing.customSsoConfig.subjectClaims,
            customSsoState: CustomSsoClientState.Unconfigured,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoInvalidation(
          tx,
          client,
          "client_protocol_disabled",
          auditContext,
        );
        return client;
      },
      adminAuditTransactionOptions(auditContext),
    );
    return { client: toClientAdminDetailDto(result) };
  }

  async function rotateClientCustomSsoSecret(
    clientCode: string,
    auditContext?: AdminAuditContext,
  ) {
    const result = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        if (existing.customSsoConfig?.mode !== CustomSsoClientMode.Independent) {
          throw new CustomSsoClientStateError("只有 Independent Custom SSO client 可以轮换 secret");
        }
        if (existing.customSsoEnabled)
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再轮换 secret");
        parseStoredCustomSsoConfig(existing.customSsoConfig);
        assertValidCustomSsoStorageState(existing);

        const customSsoSecret = deps.random.customSsoClientSecret();
        const customSsoSecretHash = await deps.passwordHasher.hashSecret(customSsoSecret);
        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
          customSsoSecretHash,
        });
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.rotate_secret",
          toGenericClientRuntimeDto(client),
          {
            mode: existing.customSsoConfig.mode,
            subjectClaims: existing.customSsoConfig.subjectClaims,
            customSsoState: CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoInvalidation(
          tx,
          client,
          "client_config_changed",
          auditContext,
        );
        return { client, customSsoSecret };
      },
      adminAuditTransactionOptions(auditContext),
    );
    return {
      client: toClientAdminDetailDto(result.client),
      customSsoSecret: result.customSsoSecret,
    };
  }

  async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
    const client = await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = await tx.clientRepository.getAnyClientByCode(clientDto.clientCode);
      if (existing !== null)
        throw new ClientCodeExistsError("客户端编码已存在");

      return await bindTarget(clientDto.clientCode, async () => {
        const client = await tx.clientRepository.createClient(clientDto);
        const created = toGenericClientRuntimeDto(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.create", created, {
          clientSecretProvided: clientDto.clientSecret !== undefined,
        }, auditContext));
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateClient(created);
        });
        return client;
      });
    }, adminAuditTransactionOptions(auditContext));
    return toClientAdminDetailDto(client);
  }

  async function updateClient(
    clientCode: string,
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
    actionOverride?: string,
  ) {
    const updatedClient = await runLockedClientRuntimeMutation(
      clientCode,
      async (tx, existing) => {
        const entersDisable = isEnteringClientDisable(existing.status, data.status);
        const client = entersDisable
          ? await tx.clientRepository.updateClientByCodeWithProtocolEpochs(
              clientCode,
              data,
            )
          : await tx.clientRepository.updateClientByCode(clientCode, data);
        const parsedExisting = toGenericClientRuntimeDto(existing);
        const parsedUpdated = toGenericClientRuntimeDto(client);
        const secretRotated = data.clientSecret !== undefined && data.clientSecret !== parsedExisting.clientSecret;
        const auditPatch: Record<string, unknown> = { ...data };
        if ("clientSecret" in auditPatch) {
          delete auditPatch.clientSecret;
          auditPatch.clientSecretRotated = secretRotated;
        }
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          actionOverride ?? (secretRotated ? "admin.client.rotate_secret" : "admin.client.update"),
          parsedUpdated,
          { previousClientCode: parsedExisting.clientCode, patch: auditPatch },
          auditContext,
        ));
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateUpdatedClient(
            parsedExisting,
            parsedUpdated,
          );
        });
        registerClientSessionRevocations(
          tx,
          resolveClientUpdateSessionRevocations(parsedExisting, data),
          client,
          auditContext,
        );
        return client;
      },
      adminAuditTransactionOptions(auditContext),
    );
    return toClientAdminDetailDto(updatedClient);
  }

  async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
    const updatedClient = await runLockedClientRuntimeMutation(
      { id: clientDto.id },
      async (tx, existing) => {
        assertClientCodeUnchanged(existing.clientCode, clientDto.clientCode);
        const entersDisable = isEnteringClientDisable(existing.status, clientDto.status);
        const client = entersDisable
          ? await tx.clientRepository
              .updateClientByIdWithProtocolEpochs(clientDto)
          : await tx.clientRepository.updateClientById(clientDto);
        const parsedExisting = toGenericClientRuntimeDto(existing);
        const parsedUpdated = toGenericClientRuntimeDto(client);
        const secretRotated = clientDto.clientSecret !== undefined
          && clientDto.clientSecret !== parsedExisting.clientSecret;
        const auditPatch: Record<string, unknown> = { ...clientDto };
        delete auditPatch.id;
        delete auditPatch.clientSecret;
        auditPatch.clientSecretRotated = secretRotated;
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          secretRotated ? "admin.client.rotate_secret" : "admin.client.update",
          parsedUpdated,
          {
            previousClientCode: parsedExisting.clientCode,
            patch: auditPatch,
          },
          auditContext,
        ));
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateUpdatedClient(
            parsedExisting,
            parsedUpdated,
          );
        });
        registerClientSessionRevocations(
          tx,
          resolveClientUpdateSessionRevocations(parsedExisting, clientDto),
          client,
          auditContext,
        );
        return client;
      },
      adminAuditTransactionOptions(auditContext),
    );
    return toClientAdminDetailDto(updatedClient);
  }

  async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
    await updateClient(clientCode, { status }, auditContext, "admin.client.status_update");
    return true;
  }

  async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
    await runLockedClientRuntimeMutation(
      clientCode,
      async (tx) => {
        const client = await tx.clientRepository.softDeleteClientByCode(clientCode);
        const deleted = toGenericClientRuntimeDto(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.delete",
          deleted,
          { deleted: true },
          auditContext,
        ));
        tx.afterCommit.required("admin.client.cache.delete", async () => {
          await deps.clientCache.invalidateClient(deleted);
        });
        tx.afterCommit.bestEffort("admin.session_revoke.client_all_protocols", async () => {
          await txClientAllProtocolsRevocation(client, "client_deleted", auditContext);
        });
      },
      adminAuditTransactionOptions(auditContext),
    );
    return true;
  }

  async function configureClientOidc(
    clientCode: string,
    input: ClientOidcConfigureDto,
    auditContext?: AdminAuditContext,
  ) {
    const oidcConfig = oidcClientConfigSchema.parse(input);
    const result = await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");

      return await bindTarget(existing.clientCode, async () => {
        let clientSecret: string | undefined;
        let oidcSecretHash = existing.oidcSecretHash;
        if (oidcConfig.clientType === OidcClientType.Public) {
          oidcSecretHash = null;
        }
        else if (existing.oidcConfig?.clientType !== OidcClientType.Confidential || oidcSecretHash === null) {
          clientSecret = deps.random.oidcClientSecret();
          oidcSecretHash = await deps.passwordHasher.hashSecret(clientSecret);
        }

        const client = await tx.clientRepository.updateClientOidcByCode(clientCode, {
          oidcConfig,
          oidcSecretHash,
          oidcEnabled: existing.oidcConfig === null ? false : existing.oidcEnabled,
        });
        assertValidOidcStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.configure", toGenericClientRuntimeDto(client), {
          clientType: oidcConfig.clientType,
          redirectUris: oidcConfig.redirectUris,
          postLogoutRedirectUris: oidcConfig.postLogoutRedirectUris,
          allowedScopes: oidcConfig.allowedScopes,
          oidcEnabled: client.oidcEnabled,
          oidcConfigVersion: client.oidcConfigVersion,
        }, auditContext));
        tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
          await txClientProtocolRevocation(client, "oidc", "client_config_changed", auditContext);
        });
        return { client, clientSecret };
      });
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
  }

  async function setClientOidcEnabled(
    clientCode: string,
    enabled: boolean,
    auditContext?: AdminAuditContext,
  ) {
    const result = await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = await tx.clientRepository.lockClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      return await bindTarget(existing.clientCode, async () => {
        if (existing.oidcConfig === null)
          throw new OidcClientStateError("OIDC 尚未配置");
        assertValidOidcStorageState(existing);
        if (existing.oidcEnabled === enabled) {
          throw new OidcClientStateError(enabled ? "OIDC 已启用" : "OIDC 已禁用");
        }
        if (enabled && !allowsProtocolEnable(existing.status)) {
          throw new OidcClientStateError("全局状态停用的客户端不能启用 OIDC");
        }
        const client = await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcEnabled: enabled });
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          enabled ? "admin.client.oidc.enable" : "admin.client.oidc.disable",
          toGenericClientRuntimeDto(client),
          { oidcEnabled: enabled, oidcConfigVersion: client.oidcConfigVersion },
          auditContext,
        ));
        tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
          await txClientProtocolRevocation(
            client,
            "oidc",
            enabled ? "client_config_changed" : "client_protocol_disabled",
            auditContext,
          );
        });
        return client;
      });
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result) };
  }

  async function enableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientOidcEnabled(clientCode, true, auditContext);
  }

  async function disableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientOidcEnabled(clientCode, false, auditContext);
  }

  async function removeClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    const result = await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      return await bindTarget(existing.clientCode, async () => {
        if (existing.oidcConfig === null)
          throw new OidcClientStateError("OIDC 尚未配置");
        if (existing.oidcEnabled)
          throw new OidcClientStateError("请先禁用 OIDC 再移除配置");
        const client = await tx.clientRepository.updateClientOidcByCode(clientCode, {
          oidcEnabled: false,
          oidcConfig: null,
          oidcSecretHash: null,
        });
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.remove", toGenericClientRuntimeDto(client), {
          oidcConfigVersion: client.oidcConfigVersion,
        }, auditContext));
        tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
          await txClientProtocolRevocation(client, "oidc", "client_protocol_disabled", auditContext);
        });
        return client;
      });
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result) };
  }

  async function rotateClientOidcSecret(clientCode: string, auditContext?: AdminAuditContext) {
    const result = await clientMutation.transaction(async (tx, bindTarget) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      return await bindTarget(existing.clientCode, async () => {
        if (existing.oidcConfig?.clientType !== OidcClientType.Confidential) {
          throw new OidcClientStateError("只有 confidential OIDC client 可以轮换 secret");
        }
        const clientSecret = deps.random.oidcClientSecret();
        const oidcSecretHash = await deps.passwordHasher.hashSecret(clientSecret);
        const client = await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcSecretHash });
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.oidc.rotate_secret",
          toGenericClientRuntimeDto(client),
          {
            oidcConfigVersion: client.oidcConfigVersion,
          },
          auditContext,
        ));
        tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
          await txClientProtocolRevocation(client, "oidc", "client_config_changed", auditContext);
        });
        return { client, clientSecret };
      });
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
  }

  return {
    configureClientCustomSso,
    configureClientOidc,
    createClient,
    deleteClient,
    disableClientCustomSso,
    disableClientOidc,
    enableClientCustomSso,
    enableClientOidc,
    getClientDetailByCode,
    removeClientCustomSso,
    removeClientOidc,
    rotateClientCustomSsoSecret,
    rotateClientOidcSecret,
    searchClientsForAdmin,
    updateClient,
    updateClientById,
    updateClientStatus,
  };
}

export type ClientService = ReturnType<typeof createClientService>;
