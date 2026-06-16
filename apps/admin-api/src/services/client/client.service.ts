import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientStatus } from "@iam/contracts";
import type {
  ClientAdminListDto,
  ClientCreateDto,
  ClientDto,
  ClientInputDto,
  ClientOidcConfigureDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import { randomBytes } from "node:crypto";
import config from "@admin-api/env";
import redis from "@admin-api/lib/infra/redis";
import { logger } from "@admin-api/lib/logger";
import { recordAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import * as clientRepository from "@admin-api/services/client/client.repository";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import { SystemLogEvent } from "@iam/api-core/logger";
import { invalidateOidcClient } from "@iam/api-core/oidc";
import { hashSecret } from "@iam/api-core/security";
import { ClientStatus as ClientStatusValue, OidcClientType } from "@iam/contracts";
import db from "@iam/db";
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

async function setClientCache(clientDto: ClientDto) {
  await Promise.all([
    redis.set(`cache:client:code:${clientDto.clientCode}`, JSON.stringify(clientDto)),
    redis.set(`cache:client:secret:${clientDto.clientSecret}`, JSON.stringify(clientDto)),
  ]);
}

async function deleteClientCache(clientDto: Pick<ClientDto, "clientCode" | "clientSecret">) {
  await Promise.all([
    redis.del(`cache:client:code:${clientDto.clientCode}`),
    redis.del(`cache:client:secret:${clientDto.clientSecret}`),
  ]);
}

async function syncUpdatedClientCache(oldClientDto: ClientDto, newClientDto: ClientDto) {
  await Promise.all([
    oldClientDto.clientCode === newClientDto.clientCode
      ? Promise.resolve()
      : redis.del(`cache:client:code:${oldClientDto.clientCode}`),
    oldClientDto.clientSecret === newClientDto.clientSecret
      ? Promise.resolve()
      : redis.del(`cache:client:secret:${oldClientDto.clientSecret}`),
    setClientCache(newClientDto),
  ]);
}

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

function generateOidcClientSecret() {
  return `iam_oidc_${randomBytes(32).toString("base64url")}`;
}

function assertValidOidcStorageState(client: { oidcConfig: unknown; oidcSecretHash: string | null }) {
  const result = oidcClientSecretStateSchema.safeParse(client);
  if (!result.success) {
    throw new OidcClientConfigurationError(result.error.issues[0]?.message);
  }
}

async function bestEffortInvalidateOidcClient(client: {
  id: number;
  clientCode: string;
  oidcConfigVersion: number;
}) {
  try {
    await invalidateOidcClient(redis, {
      clientId: client.id,
      clientCode: client.clientCode,
      oidcConfigVersion: client.oidcConfigVersion,
    });
  }
  catch (error) {
    logger.warn({
      event: SystemLogEvent.IntegrationCallFailed,
      err: error,
      clientCode: client.clientCode,
      integration: "oidc-provider",
    }, "failed to invalidate OIDC client runtime");
  }
}

export async function searchClientsForAdmin(query: ClientPaginationQueryDto) {
  const { rows, total } = await clientRepository.searchClientsPaged(query);
  return toPageResult(rows.map(toClientAdminListDto), total, query);
}

export async function getClientDetailByCode(clientCode: string) {
  const client = await clientRepository.getClientByCode(clientCode);
  if (client === null)
    throw new ClientNotFoundError("客户端不存在");
  return toClientAdminDetailDto(client);
}

export async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
  assertValidRedirectUrlPatterns(clientDto);
  const createdClientDto = await db.transaction(async (tx) => {
    const existing = await clientRepository.getAnyClientByCode(clientDto.clientCode, tx);
    if (existing !== null)
      throw new ClientCodeExistsError("客户端编码已存在");
    const client = await clientRepository.createClient(clientDto, tx);
    const created = ClientDtoSchema.parse(client);
    await recordAdminClientAudit("admin.client.create", created, {
      clientSecretProvided: clientDto.clientSecret !== undefined,
      managementLevel: clientDto.extAttributes.managementLevel,
    }, tx, auditContext);
    return created;
  });
  await setClientCache(createdClientDto);
  return createdClientDto;
}

export async function updateClient(
  clientCode: string,
  data: ClientUpdateDto,
  auditContext?: AdminAuditContext,
  actionOverride?: string,
) {
  assertValidRedirectUrlPatterns(data);
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");
    const statusChanged = data.status !== undefined && data.status !== existing.status;
    const client = statusChanged
      ? await clientRepository.updateClientByCodeWithOidcVersion(clientCode, data, tx)
      : await clientRepository.updateClientByCode(clientCode, data, tx);
    const parsedExisting = ClientDtoSchema.parse(existing);
    const parsedUpdated = ClientDtoSchema.parse(client);
    const secretRotated = data.clientSecret !== undefined && data.clientSecret !== parsedExisting.clientSecret;
    const auditPatch: Record<string, unknown> = { ...data };
    if ("clientSecret" in auditPatch) {
      delete auditPatch.clientSecret;
      auditPatch.clientSecretRotated = secretRotated;
    }
    await recordAdminClientAudit(
      actionOverride ?? (secretRotated ? "admin.client.rotate_secret" : "admin.client.update"),
      parsedUpdated,
      { previousClientCode: parsedExisting.clientCode, patch: auditPatch },
      tx,
      auditContext,
    );
    return { oldClientDto: parsedExisting, updatedClientDto: parsedUpdated, client, statusChanged };
  });
  await syncUpdatedClientCache(result.oldClientDto, result.updatedClientDto);
  if (result.statusChanged)
    await bestEffortInvalidateOidcClient(result.client);
  return result.updatedClientDto;
}

export async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
  assertValidRedirectUrlPatterns(clientDto);
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientById(clientDto.id, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");
    assertClientCodeUnchanged(existing.clientCode, clientDto.clientCode);
    const statusChanged = clientDto.status !== undefined && clientDto.status !== existing.status;
    const client = statusChanged
      ? await clientRepository.updateClientByIdWithOidcVersion(clientDto, tx)
      : await clientRepository.updateClientById(clientDto, tx);
    const parsedExisting = ClientDtoSchema.parse(existing);
    const parsedUpdated = ClientDtoSchema.parse(client);
    const secretRotated = clientDto.clientSecret !== undefined
      && clientDto.clientSecret !== parsedExisting.clientSecret;
    const auditPatch: Record<string, unknown> = { ...clientDto };
    delete auditPatch.id;
    delete auditPatch.clientSecret;
    auditPatch.clientSecretRotated = secretRotated;
    await recordAdminClientAudit(secretRotated ? "admin.client.rotate_secret" : "admin.client.update", parsedUpdated, {
      previousClientCode: parsedExisting.clientCode,
      patch: auditPatch,
    }, tx, auditContext);
    return { oldClientDto: parsedExisting, updatedClientDto: parsedUpdated, client, statusChanged };
  });
  await syncUpdatedClientCache(result.oldClientDto, result.updatedClientDto);
  if (result.statusChanged)
    await bestEffortInvalidateOidcClient(result.client);
  return result.updatedClientDto;
}

export async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
  await updateClient(clientCode, { status }, auditContext, "admin.client.status_update");
  return true;
}

export async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");
    const client = await clientRepository.softDeleteClientByCode(clientCode, tx);
    const deleted = ClientDtoSchema.parse(client);
    await recordAdminClientAudit("admin.client.delete", deleted, { deleted: true }, tx, auditContext);
    return { deleted, client };
  });
  await Promise.all([deleteClientCache(result.deleted), bestEffortInvalidateOidcClient(result.client)]);
  return true;
}

export async function configureClientOidc(
  clientCode: string,
  input: ClientOidcConfigureDto,
  auditContext?: AdminAuditContext,
) {
  const oidcConfig = oidcClientConfigSchema.parse(input);
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");

    let clientSecret: string | undefined;
    let oidcSecretHash = existing.oidcSecretHash;
    if (oidcConfig.clientType === OidcClientType.Public) {
      oidcSecretHash = null;
    }
    else if (existing.oidcConfig?.clientType !== OidcClientType.Confidential || oidcSecretHash === null) {
      clientSecret = generateOidcClientSecret();
      oidcSecretHash = await hashSecret(clientSecret, config.PASSWORD_HASH_ROUNDS);
    }

    const client = await clientRepository.updateClientOidcByCode(clientCode, {
      oidcConfig,
      oidcSecretHash,
      oidcEnabled: existing.oidcConfig === null ? false : existing.oidcEnabled,
    }, tx);
    assertValidOidcStorageState(client);
    await recordAdminClientAudit("admin.client.oidc.configure", ClientDtoSchema.parse(client), {
      clientType: oidcConfig.clientType,
      redirectUris: oidcConfig.redirectUris,
      postLogoutRedirectUris: oidcConfig.postLogoutRedirectUris,
      allowedScopes: oidcConfig.allowedScopes,
      oidcEnabled: client.oidcEnabled,
      oidcConfigVersion: client.oidcConfigVersion,
    }, tx, auditContext);
    return { client, clientSecret };
  });
  await bestEffortInvalidateOidcClient(result.client);
  return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
}

export async function enableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
  return await setClientOidcEnabled(clientCode, true, auditContext);
}

export async function disableClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
  return await setClientOidcEnabled(clientCode, false, auditContext);
}

async function setClientOidcEnabled(
  clientCode: string,
  enabled: boolean,
  auditContext?: AdminAuditContext,
) {
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
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
    const client = await clientRepository.updateClientOidcByCode(clientCode, { oidcEnabled: enabled }, tx);
    await recordAdminClientAudit(
      enabled ? "admin.client.oidc.enable" : "admin.client.oidc.disable",
      ClientDtoSchema.parse(client),
      { oidcEnabled: enabled, oidcConfigVersion: client.oidcConfigVersion },
      tx,
      auditContext,
    );
    return client;
  });
  await bestEffortInvalidateOidcClient(result);
  return { client: toClientAdminDetailDto(result) };
}

export async function removeClientOidc(clientCode: string, auditContext?: AdminAuditContext) {
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");
    if (existing.oidcConfig === null)
      throw new OidcClientStateError("OIDC 尚未配置");
    if (existing.oidcEnabled)
      throw new OidcClientStateError("请先禁用 OIDC 再移除配置");
    const client = await clientRepository.updateClientOidcByCode(clientCode, {
      oidcEnabled: false,
      oidcConfig: null,
      oidcSecretHash: null,
    }, tx);
    await recordAdminClientAudit("admin.client.oidc.remove", ClientDtoSchema.parse(client), {
      oidcConfigVersion: client.oidcConfigVersion,
    }, tx, auditContext);
    return client;
  });
  await bestEffortInvalidateOidcClient(result);
  return { client: toClientAdminDetailDto(result) };
}

export async function rotateClientOidcSecret(clientCode: string, auditContext?: AdminAuditContext) {
  const result = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null)
      throw new ClientNotFoundError("客户端不存在");
    if (existing.oidcConfig?.clientType !== OidcClientType.Confidential) {
      throw new OidcClientStateError("只有 confidential OIDC client 可以轮换 secret");
    }
    const clientSecret = generateOidcClientSecret();
    const oidcSecretHash = await hashSecret(clientSecret, config.PASSWORD_HASH_ROUNDS);
    const client = await clientRepository.updateClientOidcByCode(clientCode, { oidcSecretHash }, tx);
    await recordAdminClientAudit("admin.client.oidc.rotate_secret", ClientDtoSchema.parse(client), {
      oidcConfigVersion: client.oidcConfigVersion,
    }, tx, auditContext);
    return { client, clientSecret };
  });
  await bestEffortInvalidateOidcClient(result.client);
  return { client: toClientAdminDetailDto(result.client), clientSecret: result.clientSecret };
}
