import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientStatus } from "@iam/contracts";
import type { OidcRuntimeInvalidationTarget } from "../session-revocation/session-revocation.port";
import type { AdminClientServiceDeps } from "./client.port";
import type {
  ClientAdminListDto,
  ClientCreateDto,
  ClientDto,
  ClientInputDto,
  ClientOidcConfigureDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { adminAuditTransactionOptions } from "@admin-api/services/audit/audit.service";
import { buildAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import { ClientStatus as ClientStatusValue, OidcClientType } from "@iam/contracts";
import { oidcClientConfigSchema, oidcClientSecretStateSchema } from "@iam/db/schema";
import {
  ClientCodeExistsError,
  ClientCodeImmutableError,
  ClientInvalidRedirectUrlPatternError,
  ClientNotFoundError,
  OidcClientConfigurationError,
  OidcClientStateError,
  toClientAdminDetailDto,
  toClientAdminListDto,
  validateRedirectUrlPattern,
} from "@iam/domain/client";

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

function assertValidRedirectUrlPatterns(data: Pick<ClientCreateDto | ClientInputDto | ClientUpdateDto, "extAttributes">) {
  const patterns = data.extAttributes?.validRedirectUrls;
  if (patterns === undefined)
    return;

  for (const pattern of patterns) {
    const result = validateRedirectUrlPattern(pattern);
    if (!result.ok) {
      throw new ClientInvalidRedirectUrlPatternError(`存在非法 redirect URL pattern: ${pattern}`);
    }
  }
}

function assertValidOidcStorageState(client: { oidcConfig: unknown; oidcSecretHash: string | null }) {
  const result = oidcClientSecretStateSchema.safeParse(client);
  if (!result.success) {
    throw new OidcClientConfigurationError(result.error.issues[0]?.message);
  }
}

const customSsoSessionExtAttributeKeys = [
  "validRedirectUrls",
  "callbackEndpoint",
  "logoutEndpoint",
  "managementLevel",
  "requireOrcas",
] as const;

type AdminClientTransactionContext = Parameters<Parameters<AdminClientServiceDeps["uow"]["transaction"]>[0]>[0];

type ClientSessionRevocationDecision
  = | { scope: "all-protocols"; reason: "client_disabled" | "client_deleted" | "client_config_changed" }
    | { scope: "protocol"; protocol: "custom-sso" | "oidc"; reason: "client_protocol_disabled" | "client_config_changed" };

function resolveClientUpdateSessionRevocations(
  existing: ClientDto,
  updated: ClientDto,
  data: Pick<ClientUpdateDto | ClientInputDto, "clientSecret" | "extAttributes" | "status">,
): ClientSessionRevocationDecision[] {
  const statusChanged = data.status !== undefined && data.status !== existing.status;
  if (statusChanged && updated.status === ClientStatusValue.Disable) {
    return [{ scope: "all-protocols", reason: "client_disabled" }];
  }

  const decisions: ClientSessionRevocationDecision[] = [];
  if (statusChanged && updated.status === ClientStatusValue.Maintenance) {
    decisions.push({ scope: "protocol", protocol: "oidc", reason: "client_config_changed" });
  }
  if (hasCustomSsoSessionConfigChange(existing, data)) {
    decisions.push({ scope: "protocol", protocol: "custom-sso", reason: "client_config_changed" });
  }
  return decisions;
}

function hasCustomSsoSessionConfigChange(
  existing: ClientDto,
  data: Pick<ClientUpdateDto | ClientInputDto, "clientSecret" | "extAttributes">,
) {
  if (data.clientSecret !== undefined && data.clientSecret !== existing.clientSecret)
    return true;
  const extAttributes = data.extAttributes;
  if (!extAttributes)
    return false;

  return customSsoSessionExtAttributeKeys.some((key) => {
    if (!Object.hasOwn(extAttributes, key))
      return false;
    return JSON.stringify(extAttributes[key]) !== JSON.stringify(existing.extAttributes[key]);
  });
}

function toOidcRuntimeInvalidationTarget(client: OidcRuntimeInvalidationTarget): OidcRuntimeInvalidationTarget {
  return {
    id: client.id,
    clientCode: client.clientCode,
    oidcConfigVersion: client.oidcConfigVersion,
  };
}

export function createClientService(deps: AdminClientServiceDeps) {
  async function txClientProtocolRevocation(
    client: OidcRuntimeInvalidationTarget,
    protocol: "custom-sso" | "oidc",
    reason: "client_protocol_disabled" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientProtocol({
      clientCode: client.clientCode,
      protocol,
      reason,
      auditContext,
      oidcInvalidationClient: protocol === "oidc" ? toOidcRuntimeInvalidationTarget(client) : undefined,
    });
  }

  async function txClientAllProtocolsRevocation(
    client: OidcRuntimeInvalidationTarget,
    reason: "client_disabled" | "client_deleted" | "client_config_changed",
    auditContext?: AdminAuditContext,
  ) {
    await deps.sessionRevocation.revokeClientAllProtocols({
      clientCode: client.clientCode,
      reason,
      auditContext,
      oidcInvalidationClient: toOidcRuntimeInvalidationTarget(client),
    });
  }

  function registerClientSessionRevocations(
    tx: AdminClientTransactionContext,
    decisions: ClientSessionRevocationDecision[],
    client: OidcRuntimeInvalidationTarget,
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

  async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
    assertValidRedirectUrlPatterns(clientDto);
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getAnyClientByCode(clientDto.clientCode);
      if (existing !== null)
        throw new ClientCodeExistsError("客户端编码已存在");
      const client = await tx.clientRepository.createClient(clientDto);
      const created = ClientDtoSchema.parse(client);
      await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.create", created, {
        clientSecretProvided: clientDto.clientSecret !== undefined,
        managementLevel: clientDto.extAttributes.managementLevel,
      }, auditContext));
      tx.afterCommit.required("admin.client.cache.set", async () => {
        await deps.clientCache.setClient(created);
      });
      return created;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateClient(
    clientCode: string,
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
    actionOverride?: string,
  ) {
    assertValidRedirectUrlPatterns(data);
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      const statusChanged = data.status !== undefined && data.status !== existing.status;
      const client = statusChanged
        ? await tx.clientRepository.updateClientByCodeWithOidcVersion(clientCode, data)
        : await tx.clientRepository.updateClientByCode(clientCode, data);
      const parsedExisting = ClientDtoSchema.parse(existing);
      const parsedUpdated = ClientDtoSchema.parse(client);
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
      tx.afterCommit.required("admin.client.cache.sync", async () => {
        await deps.clientCache.syncUpdatedClient(parsedExisting, parsedUpdated);
      });
      registerClientSessionRevocations(
        tx,
        resolveClientUpdateSessionRevocations(parsedExisting, parsedUpdated, data),
        client,
        auditContext,
      );
      return parsedUpdated;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
    assertValidRedirectUrlPatterns(clientDto);
    return await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientById(clientDto.id);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      assertClientCodeUnchanged(existing.clientCode, clientDto.clientCode);
      const statusChanged = clientDto.status !== undefined && clientDto.status !== existing.status;
      const client = statusChanged
        ? await tx.clientRepository.updateClientByIdWithOidcVersion(clientDto)
        : await tx.clientRepository.updateClientById(clientDto);
      const parsedExisting = ClientDtoSchema.parse(existing);
      const parsedUpdated = ClientDtoSchema.parse(client);
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
      tx.afterCommit.required("admin.client.cache.sync", async () => {
        await deps.clientCache.syncUpdatedClient(parsedExisting, parsedUpdated);
      });
      registerClientSessionRevocations(
        tx,
        resolveClientUpdateSessionRevocations(parsedExisting, parsedUpdated, clientDto),
        client,
        auditContext,
      );
      return parsedUpdated;
    }, adminAuditTransactionOptions(auditContext));
  }

  async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
    await updateClient(clientCode, { status }, auditContext, "admin.client.status_update");
    return true;
  }

  async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
    await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      const client = await tx.clientRepository.softDeleteClientByCode(clientCode);
      const deleted = ClientDtoSchema.parse(client);
      await tx.auditService.recordAuditLog(buildAdminClientAudit(
        "admin.client.delete",
        deleted,
        { deleted: true },
        auditContext,
      ));
      tx.afterCommit.required("admin.client.cache.delete", async () => {
        await deps.clientCache.deleteClient(deleted);
      });
      tx.afterCommit.bestEffort("admin.session_revoke.client_all_protocols", async () => {
        await txClientAllProtocolsRevocation(client, "client_deleted", auditContext);
      });
    }, adminAuditTransactionOptions(auditContext));
    return true;
  }

  async function configureClientOidc(
    clientCode: string,
    input: ClientOidcConfigureDto,
    auditContext?: AdminAuditContext,
  ) {
    const oidcConfig = oidcClientConfigSchema.parse(input);
    const result = await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");

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
      await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.configure", ClientDtoSchema.parse(client), {
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
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
  }

  async function setClientOidcEnabled(
    clientCode: string,
    enabled: boolean,
    auditContext?: AdminAuditContext,
  ) {
    const result = await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      if (existing.oidcConfig === null)
        throw new OidcClientStateError("OIDC 尚未配置");
      assertValidOidcStorageState(existing);
      if (existing.oidcEnabled === enabled) {
        throw new OidcClientStateError(enabled ? "OIDC 已启用" : "OIDC 已禁用");
      }
      if (enabled && existing.status !== ClientStatusValue.Enable) {
        throw new OidcClientStateError("只有全局状态正常的客户端可以启用 OIDC");
      }
      const client = await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcEnabled: enabled });
      await tx.auditService.recordAuditLog(buildAdminClientAudit(
        enabled ? "admin.client.oidc.enable" : "admin.client.oidc.disable",
        ClientDtoSchema.parse(client),
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
    const result = await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      if (existing.oidcConfig === null)
        throw new OidcClientStateError("OIDC 尚未配置");
      if (existing.oidcEnabled)
        throw new OidcClientStateError("请先禁用 OIDC 再移除配置");
      const client = await tx.clientRepository.updateClientOidcByCode(clientCode, {
        oidcEnabled: false,
        oidcConfig: null,
        oidcSecretHash: null,
      });
      await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.remove", ClientDtoSchema.parse(client), {
        oidcConfigVersion: client.oidcConfigVersion,
      }, auditContext));
      tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
        await txClientProtocolRevocation(client, "oidc", "client_protocol_disabled", auditContext);
      });
      return client;
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result) };
  }

  async function rotateClientOidcSecret(clientCode: string, auditContext?: AdminAuditContext) {
    const result = await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getClientByCode(clientCode);
      if (existing === null)
        throw new ClientNotFoundError("客户端不存在");
      if (existing.oidcConfig?.clientType !== OidcClientType.Confidential) {
        throw new OidcClientStateError("只有 confidential OIDC client 可以轮换 secret");
      }
      const clientSecret = deps.random.oidcClientSecret();
      const oidcSecretHash = await deps.passwordHasher.hashSecret(clientSecret);
      const client = await tx.clientRepository.updateClientOidcByCode(clientCode, { oidcSecretHash });
      await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.oidc.rotate_secret", ClientDtoSchema.parse(client), {
        oidcConfigVersion: client.oidcConfigVersion,
      }, auditContext));
      tx.afterCommit.bestEffort("admin.session_revoke.client_protocol", async () => {
        await txClientProtocolRevocation(client, "oidc", "client_config_changed", auditContext);
      });
      return { client, clientSecret };
    }, adminAuditTransactionOptions(auditContext));
    return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
  }

  return {
    configureClientOidc,
    createClient,
    deleteClient,
    disableClientOidc,
    enableClientOidc,
    getClientDetailByCode,
    removeClientOidc,
    rotateClientOidcSecret,
    searchClientsForAdmin,
    updateClient,
    updateClientById,
    updateClientStatus,
  };
}

export type ClientService = ReturnType<typeof createClientService>;
