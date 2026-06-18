import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientStatus } from "@iam/contracts";
import type { AdminClientServiceDeps } from "./client.port";
import type {
  ClientAdminListDto,
  ClientCreateDto,
  ClientInputDto,
  ClientOidcConfigureDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { buildAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import { SystemLogEvent } from "@iam/api-core/logger";
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

export function createClientService(deps: AdminClientServiceDeps) {
  async function bestEffortInvalidateOidcClient(client: {
    id: number;
    clientCode: string;
    oidcConfigVersion: number;
  }) {
    try {
      await deps.oidcInvalidation.invalidateClient(client);
    }
    catch (error) {
      deps.logger.warn({
        event: SystemLogEvent.IntegrationCallFailed,
        err: error,
        clientCode: client.clientCode,
        integration: "oidc-provider",
      }, "failed to invalidate OIDC client runtime");
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
    const createdClientDto = await deps.uow.transaction(async (tx) => {
      const existing = await tx.clientRepository.getAnyClientByCode(clientDto.clientCode);
      if (existing !== null)
        throw new ClientCodeExistsError("客户端编码已存在");
      const client = await tx.clientRepository.createClient(clientDto);
      const created = ClientDtoSchema.parse(client);
      await tx.auditService.recordAuditLog(buildAdminClientAudit("admin.client.create", created, {
        clientSecretProvided: clientDto.clientSecret !== undefined,
        managementLevel: clientDto.extAttributes.managementLevel,
      }, auditContext));
      return created;
    });
    await deps.clientCache.setClient(createdClientDto);
    return createdClientDto;
  }

  async function updateClient(
    clientCode: string,
    data: ClientUpdateDto,
    auditContext?: AdminAuditContext,
    actionOverride?: string,
  ) {
    assertValidRedirectUrlPatterns(data);
    const result = await deps.uow.transaction(async (tx) => {
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
      return { oldClientDto: parsedExisting, updatedClientDto: parsedUpdated, client, statusChanged };
    });
    await deps.clientCache.syncUpdatedClient(result.oldClientDto, result.updatedClientDto);
    if (result.statusChanged)
      await bestEffortInvalidateOidcClient(result.client);
    return result.updatedClientDto;
  }

  async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
    assertValidRedirectUrlPatterns(clientDto);
    const result = await deps.uow.transaction(async (tx) => {
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
      return { oldClientDto: parsedExisting, updatedClientDto: parsedUpdated, client, statusChanged };
    });
    await deps.clientCache.syncUpdatedClient(result.oldClientDto, result.updatedClientDto);
    if (result.statusChanged)
      await bestEffortInvalidateOidcClient(result.client);
    return result.updatedClientDto;
  }

  async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
    await updateClient(clientCode, { status }, auditContext, "admin.client.status_update");
    return true;
  }

  async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
    const result = await deps.uow.transaction(async (tx) => {
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
      return { deleted, client };
    });
    await Promise.all([
      deps.clientCache.deleteClient(result.deleted),
      bestEffortInvalidateOidcClient(result.client),
    ]);
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
      return { client, clientSecret };
    });
    await bestEffortInvalidateOidcClient(result.client);
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
      return client;
    });
    await bestEffortInvalidateOidcClient(result);
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
      return client;
    });
    await bestEffortInvalidateOidcClient(result);
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
      return { client, clientSecret };
    });
    await bestEffortInvalidateOidcClient(result.client);
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
