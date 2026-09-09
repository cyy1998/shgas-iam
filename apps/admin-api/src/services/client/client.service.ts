import type { AdminAuditContext } from "@admin-api/services/audit/audit.context";
import type { ClientStatus } from "@iam/contracts";
import type { GenericClientRuntimeDto } from "@iam/domain/client";
import type { BindAdminClientMutationTarget } from "./client-mutation";
import type { AdminClientServiceDeps, AdminClientTransactionPorts } from "./client.port";
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
import { createAdminMutation } from "@admin-api/services/admin-mutation/admin-mutation";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.context";
import { buildAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import {
  ClientCustomSsoConfigureDtoSchema,
} from "@admin-api/services/client/client.schema";
import { BadRequestError } from "@iam/api-core/errors";
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

function normalizeOidcConfig(input: ClientOidcConfigureDto) {
  const config = oidcClientConfigSchema.parse(input);
  return {
    ...config,
    redirectUris: [...config.redirectUris].sort(),
    postLogoutRedirectUris: [...config.postLogoutRedirectUris].sort(),
    allowedScopes: [...config.allowedScopes].sort(),
  };
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

function normalizeStoredCustomSsoConfig(input: unknown) {
  const result = customSsoClientConfigSchema.safeParse(input);
  if (!result.success) {
    throw new CustomSsoClientConfigurationError(result.error.issues[0]?.message);
  }
  return {
    ...result.data,
    validRedirectUrls: [...new Set(result.data.validRedirectUrls)].sort(),
    subjectClaims: [...result.data.subjectClaims].sort(),
  };
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

  const basicMutation = createAdminMutation<AdminClientTransactionPorts & {
    bindTarget: BindAdminClientMutationTarget;
  }>({
    transaction: (command, options) => clientMutation.transaction(
      (tx, bindTarget) => command({ ...tx, bindTarget }),
      options,
    ),
  });

  async function txClientProtocolRevocation(
    client: Pick<AdminClientRecord, "clientCode" | "oidcConfigVersion" | "customSsoConfigVersion">,
    protocol: "custom-sso" | "oidc",
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientProtocol({
      clientCode: client.clientCode,
      protocol,
      committedVersion: protocol === "oidc" ? client.oidcConfigVersion : client.customSsoConfigVersion,
      reason,
      auditContext,
    });
  }

  async function txClientAllProtocolsRevocation(
    client: Pick<AdminClientRecord, "clientCode" | "oidcConfigVersion" | "customSsoConfigVersion">,
    reason: "client_disabled" | "client_deleted" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientAllProtocols({
      clientCode: client.clientCode,
      committedVersions: { oidc: client.oidcConfigVersion, customSso: client.customSsoConfigVersion },
      reason,
      auditContext,
    });
  }

  function registerClientSessionRevocations(
    tx: AdminClientTransactionContext,
    decisions: ClientSessionRevocationDecision[],
    client: Pick<AdminClientRecord, "clientCode" | "oidcConfigVersion" | "customSsoConfigVersion">,
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

  function registerCustomSsoRevocation(
    tx: AdminClientTransactionContext,
    client: Pick<AdminClientRecord, "clientCode" | "oidcConfigVersion" | "customSsoConfigVersion">,
    changed: boolean,
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    if (!changed)
      return;
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
    const customSsoConfig = normalizeStoredCustomSsoConfig(parseValidCustomSsoConfig(input));
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        const sameConfig = existing.customSsoConfig !== null
          && JSON.stringify(normalizeStoredCustomSsoConfig(existing.customSsoConfig)) === JSON.stringify(customSsoConfig);
        if (existing.customSsoEnabled && !sameConfig)
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再修改配置");
        if (existing.customSsoEnabled)
          assertValidCustomSsoStorageState(existing);

        let customSsoSecret: string | undefined;
        let customSsoSecretHash = existing.customSsoSecretHash;
        if (customSsoConfig.mode === CustomSsoClientMode.Gateway) {
          customSsoSecretHash = null;
        }
        else if (existing.customSsoConfig?.mode !== CustomSsoClientMode.Independent || customSsoSecretHash === null) {
          customSsoSecret = deps.random.customSsoClientSecret();
          customSsoSecretHash = await deps.passwordHasher.hashSecret(customSsoSecret);
        }
        const changed = !sameConfig || existing.customSsoSecretHash !== customSsoSecretHash;
        const client = changed
          ? await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
              customSsoEnabled: false,
              customSsoConfig,
              customSsoSecretHash,
            })
          : existing;
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.configure",
          toGenericClientRuntimeDto(client),
          {
            changed,
            ...customSsoConfig,
            customSsoState: client.customSsoEnabled ? CustomSsoClientState.Enabled : CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoRevocation(tx, client, changed, "client_config_changed", auditContext);
        return { changed, result: { client: toClientAdminDetailDto(client), customSsoSecret } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function setClientCustomSsoEnabled(
    clientCode: string,
    enabled: boolean,
    auditContext?: AdminAuditContext,
  ) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.customSsoConfig === null)
          throw new CustomSsoClientStateError("Custom SSO 尚未配置");
        assertValidCustomSsoStorageState(existing);
        const changed = existing.customSsoEnabled !== enabled;
        if (changed && enabled && !allowsProtocolEnable(existing.status))
          throw new CustomSsoClientStateError("全局状态停用的客户端不能启用 Custom SSO");
        const client = changed
          ? await tx.clientRepository.updateClientCustomSsoByCode(clientCode, { customSsoEnabled: enabled })
          : existing;
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          enabled ? "admin.client.custom_sso.enable" : "admin.client.custom_sso.disable",
          toGenericClientRuntimeDto(client),
          {
            changed,
            mode: client.customSsoConfig?.mode,
            subjectClaims: client.customSsoConfig?.subjectClaims,
            customSsoState: enabled ? CustomSsoClientState.Enabled : CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoRevocation(tx, client, changed, enabled ? "client_config_changed" : "client_protocol_disabled", auditContext);
        return { changed, result: { client: toClientAdminDetailDto(client) } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function enableClientCustomSso(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientCustomSsoEnabled(clientCode, true, auditContext);
  }

  async function disableClientCustomSso(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientCustomSsoEnabled(clientCode, false, auditContext);
  }

  async function removeClientCustomSso(clientCode: string, auditContext?: AdminAuditContext) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.customSsoEnabled)
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再移除配置");
        const changed = existing.customSsoConfig !== null || existing.customSsoSecretHash !== null;
        const client = changed
          ? await tx.clientRepository.updateClientCustomSsoByCode(clientCode, {
              customSsoEnabled: false,
              customSsoConfig: null,
              customSsoSecretHash: null,
            })
          : existing;
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.remove",
          toGenericClientRuntimeDto(client),
          {
            changed,
            previousMode: existing.customSsoConfig?.mode,
            previousSubjectClaims: existing.customSsoConfig?.subjectClaims,
            customSsoState: CustomSsoClientState.Unconfigured,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoRevocation(tx, client, changed, "client_protocol_disabled", auditContext);
        return { changed, result: { client: toClientAdminDetailDto(client) } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function rotateClientCustomSsoSecret(clientCode: string, auditContext?: AdminAuditContext) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.customSsoConfig?.mode !== CustomSsoClientMode.Independent)
          throw new CustomSsoClientStateError("只有 Independent Custom SSO client 可以轮换 secret");
        if (existing.customSsoEnabled)
          throw new CustomSsoClientStateError("请先禁用 Custom SSO 再轮换 secret");
        assertValidCustomSsoStorageState(existing);
        const customSsoSecret = deps.random.customSsoClientSecret();
        const customSsoSecretHash = await deps.passwordHasher.hashSecret(customSsoSecret);
        const client = await tx.clientRepository.updateClientCustomSsoByCode(clientCode, { customSsoSecretHash });
        assertValidCustomSsoStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.custom_sso.rotate_secret",
          toGenericClientRuntimeDto(client),
          {
            changed: true,
            mode: existing.customSsoConfig.mode,
            subjectClaims: existing.customSsoConfig.subjectClaims,
            customSsoState: CustomSsoClientState.Disabled,
            customSsoConfigVersion: client.customSsoConfigVersion,
          },
          auditContext,
        ));
        registerCustomSsoRevocation(tx, client, true, "client_config_changed", auditContext);
        return { changed: true, result: { client: toClientAdminDetailDto(client), customSsoSecret } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
    return await basicMutation.transaction(async (tx) => {
      const existing = await tx.clientRepository.getAnyClientByCode(clientDto.clientCode);
      if (existing !== null)
        throw new ClientCodeExistsError("客户端编码已存在");

      return await tx.bindTarget(clientDto.clientCode, async () => {
        const client = await tx.clientRepository.createClient(clientDto);
        if (client === null)
          throw new Error("Client insert returned no row");
        const created = toGenericClientRuntimeDto(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.create", created, {
          changed: true,
          clientSecretProvided: clientDto.clientSecret !== undefined,
        }, auditContext));
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateClient(created);
        });
        return { changed: true, result: toClientAdminDetailDto(client) };
      });
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateClientTarget(
    target: string | { id: number; clientCode?: string },
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
    actionOverride?: string,
  ) {
    if (!Object.values(data).some(value => value !== undefined))
      throw new BadRequestError("至少提交一个客户端更新字段");
    return await basicMutation.locked(
      tx => typeof target === "string"
        ? tx.clientRepository.lockClientByCode(target)
        : tx.clientRepository.lockClientById(target.id),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (typeof target !== "string")
          assertClientCodeUnchanged(existing.clientCode, target.clientCode);
        const changed = (data.clientName !== undefined && data.clientName !== existing.clientName)
          || (data.clientSecret !== undefined && data.clientSecret !== existing.clientSecret)
          || (data.url !== undefined && data.url !== existing.url)
          || (data.description !== undefined && data.description !== existing.description)
          || (data.status !== undefined && data.status !== existing.status);
        const entersDisable = isEnteringClientDisable(existing.status, data.status);
        const client = changed
          ? entersDisable
            ? await tx.clientRepository.updateClientByCodeWithProtocolEpochs(existing.clientCode, data)
            : await tx.clientRepository.updateClientByCode(existing.clientCode, data)
          : existing;
        if (client === null)
          throw new Error("Locked Client update returned no row");
        const parsedExisting = toGenericClientRuntimeDto(existing);
        const parsedUpdated = toGenericClientRuntimeDto(client);
        const secretRotated = data.clientSecret !== undefined && data.clientSecret !== existing.clientSecret;
        if (changed || data.status !== undefined || data.clientSecret !== undefined) {
          const auditPatch: Record<string, unknown> = { ...data };
          if ("clientSecret" in auditPatch) {
            delete auditPatch.clientSecret;
            auditPatch.clientSecretRotated = secretRotated;
          }
          await tx.auditService.recordAuditLog(buildAdminClientAudit(
            actionOverride ?? (secretRotated ? "admin.client.rotate_secret" : "admin.client.update"),
            parsedUpdated,
            { changed, previousClientCode: existing.clientCode, patch: auditPatch },
            auditContext,
          ));
        }
        tx.afterCommit.required("admin.client.cache.invalidate", async () => {
          await deps.clientCache.invalidateUpdatedClient(parsedExisting, parsedUpdated);
        });
        registerClientSessionRevocations(
          tx,
          resolveClientUpdateSessionRevocations(parsedExisting, data),
          client,
          auditContext,
        );
        return { changed, result: null };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function updateClient(
    clientCode: string,
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
  ) {
    return await updateClientTarget(clientCode, data, auditContext);
  }

  async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
    const { id, clientCode, ...data } = clientDto;
    return await updateClientTarget({ id, clientCode }, data, auditContext);
  }

  async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
    return await updateClientTarget(clientCode, { status }, auditContext, "admin.client.status_update");
  }

  async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        const client = await tx.clientRepository.softDeleteClientByCode(existing.clientCode);
        if (client === null)
          throw new Error("Locked Client delete returned no row");
        const deleted = toGenericClientRuntimeDto(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.delete",
          deleted,
          { deleted: true, changed: true },
          auditContext,
        ));
        tx.afterCommit.required("admin.client.cache.delete", async () => {
          await deps.clientCache.invalidateClient(deleted);
        });
        tx.afterCommit.bestEffort("admin.session_revoke.client_all_protocols", async () => {
          await txClientAllProtocolsRevocation(client, "client_deleted", auditContext);
        });
        return { changed: true, result: null };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  function registerOidcRevocation(
    tx: AdminClientTransactionContext,
    client: AdminClientRecord,
    changed: boolean,
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    if (!changed)
      return;
    tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
      await txClientProtocolRevocation(client, "oidc", reason, auditContext);
    });
  }

  async function configureClientOidc(
    clientCode: string,
    input: ClientOidcConfigureDto,
    auditContext?: AdminAuditContext,
  ) {
    const oidcConfig = normalizeOidcConfig(input);
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        let clientSecret: string | undefined;
        let oidcSecretHash = existing.oidcSecretHash;
        if (oidcConfig.clientType === OidcClientType.Public) {
          oidcSecretHash = null;
        }
        else if (existing.oidcConfig?.clientType !== OidcClientType.Confidential || oidcSecretHash === null) {
          clientSecret = deps.random.oidcClientSecret();
          oidcSecretHash = await deps.passwordHasher.hashSecret(clientSecret);
        }
        const oidcEnabled = existing.oidcConfig === null ? false : existing.oidcEnabled;
        const changed = existing.oidcConfig === null
          || JSON.stringify(normalizeOidcConfig(existing.oidcConfig)) !== JSON.stringify(oidcConfig)
          || existing.oidcSecretHash !== oidcSecretHash
          || existing.oidcEnabled !== oidcEnabled;
        const client = changed
          ? await tx.clientRepository.updateClientOidcByCode(clientCode, {
              oidcConfig,
              oidcSecretHash,
              oidcEnabled,
            })
          : existing;
        assertValidOidcStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.configure", toGenericClientRuntimeDto(client), {
          changed,
          clientType: oidcConfig.clientType,
          redirectUris: oidcConfig.redirectUris,
          postLogoutRedirectUris: oidcConfig.postLogoutRedirectUris,
          allowedScopes: oidcConfig.allowedScopes,
          oidcEnabled: client.oidcEnabled,
          oidcConfigVersion: client.oidcConfigVersion,
        }, auditContext));
        registerOidcRevocation(tx, client, changed, "client_config_changed", auditContext);
        return { changed, result: { client: toClientAdminDetailDto(client), clientSecret } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function setClientOidcEnabled(
    clientCode: string,
    enabled: boolean,
    auditContext?: AdminAuditContext,
  ) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.oidcConfig === null)
          throw new OidcClientStateError("OIDC 尚未配置");
        assertValidOidcStorageState(existing);
        if (enabled && !allowsProtocolEnable(existing.status)) {
          throw new OidcClientStateError("全局状态停用的客户端不能启用 OIDC");
        }
        const changed = existing.oidcEnabled !== enabled;
        const client = changed
          ? await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcEnabled: enabled })
          : existing;
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          enabled ? "admin.client.oidc.enable" : "admin.client.oidc.disable",
          toGenericClientRuntimeDto(client),
          { changed, oidcEnabled: enabled, oidcConfigVersion: client.oidcConfigVersion },
          auditContext,
        ));
        registerOidcRevocation(
          tx,
          client,
          changed,
          enabled ? "client_config_changed" : "client_protocol_disabled",
          auditContext,
        );
        return { changed, result: { client: toClientAdminDetailDto(client) } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function enableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientOidcEnabled(clientCode, true, auditContext);
  }

  async function disableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    return await setClientOidcEnabled(clientCode, false, auditContext);
  }

  async function removeClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.oidcEnabled)
          throw new OidcClientStateError("请先禁用 OIDC 再移除配置");
        const changed = existing.oidcConfig !== null || existing.oidcSecretHash !== null;
        const client = changed
          ? await tx.clientRepository.updateClientOidcByCode(clientCode, {
              oidcEnabled: false,
              oidcConfig: null,
              oidcSecretHash: null,
            })
          : existing;
        assertValidOidcStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.remove", toGenericClientRuntimeDto(client), {
          changed,
          oidcConfigVersion: client.oidcConfigVersion,
        }, auditContext));
        registerOidcRevocation(tx, client, changed, "client_protocol_disabled", auditContext);
        return { changed, result: { client: toClientAdminDetailDto(client) } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
  }

  async function rotateClientOidcSecret(clientCode: string, auditContext?: AdminAuditContext) {
    return await basicMutation.locked(
      tx => tx.clientRepository.lockClientByCode(clientCode),
      () => new ClientNotFoundError("客户端不存在"),
      async (tx, existing) => tx.bindTarget(existing.clientCode, async () => {
        if (existing.oidcConfig?.clientType !== OidcClientType.Confidential) {
          throw new OidcClientStateError("只有 confidential OIDC client 可以轮换 secret");
        }
        const clientSecret = deps.random.oidcClientSecret();
        const oidcSecretHash = await deps.passwordHasher.hashSecret(clientSecret);
        const client = await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcSecretHash });
        assertValidOidcStorageState(client);
        await tx.auditService.recordAuditLog(buildAdminClientAudit(
          "admin.client.oidc.rotate_secret",
          toGenericClientRuntimeDto(client),
          { changed: true, oidcConfigVersion: client.oidcConfigVersion },
          auditContext,
        ));
        registerOidcRevocation(tx, client, true, "client_config_changed", auditContext);
        return { changed: true, result: { client: toClientAdminDetailDto(client), clientSecret } };
      }),
      adminAuditTransactionOptions(auditContext),
    );
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
