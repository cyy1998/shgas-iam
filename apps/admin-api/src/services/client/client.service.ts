import type { AdminAuditContext } from "@admin-api/services/audit/audit.service";
import type { ClientStatus } from "@iam/contracts";
import type {
  ClientCreateDto,
  ClientDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import redis from "@admin-api/lib/infra/redis";
import { recordAdminClientAudit } from "@admin-api/services/audit/events/client.audit";
import * as clientRepository from "@admin-api/services/client/client.repository";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import db from "@iam/db";
import { ClientCodeExistsError, ClientNotFoundError } from "@iam/domain/client";

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

function toPageResult(rows: ClientDto[], total: number, query: ClientPaginationQueryDto) {
  return {
    result: rows,
    total,
    pageNum: query.pageNum,
    pageSize: query.pageSize,
    pages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
  };
}

async function assertRenamedClientCodeAvailable(
  currentClientCode: string,
  nextClientCode: string | undefined,
  tx: Parameters<typeof clientRepository.getClientByCode>[1],
) {
  if (nextClientCode === undefined || nextClientCode === currentClientCode) {
    return;
  }
  const existing = await clientRepository.getAnyClientByCode(nextClientCode, tx);
  if (existing !== null) {
    throw new ClientCodeExistsError("重命名客户端编码失败：客户端编码已存在");
  }
}

export async function searchClientsForAdmin(query: ClientPaginationQueryDto) {
  const { rows, total } = await clientRepository.searchClientsPaged(query);
  return toPageResult(rows.map(row => ClientDtoSchema.parse(row)), total, query);
}

export async function getClientDetailByCode(clientCode: string) {
  const client = await clientRepository.getClientByCode(clientCode);
  if (client === null) {
    throw new ClientNotFoundError("客户端不存在");
  }
  return ClientDtoSchema.parse(client);
}

export async function createClient(clientDto: ClientCreateDto, auditContext?: AdminAuditContext) {
  const createdClientDto = await db.transaction(async (tx) => {
    const existing = await clientRepository.getAnyClientByCode(clientDto.clientCode, tx);
    if (existing !== null) {
      throw new ClientCodeExistsError("客户端编码已存在");
    }
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
  const { oldClientDto, updatedClientDto } = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    await assertRenamedClientCodeAvailable(clientCode, data.clientCode, tx);
    const client = await clientRepository.updateClientByCode(clientCode, data, tx);
    const parsedExisting = ClientDtoSchema.parse(existing);
    const parsedUpdated = ClientDtoSchema.parse(client);
    const secretRotated = data.clientSecret !== undefined && data.clientSecret !== parsedExisting.clientSecret;
    const patch: Record<string, unknown> = { ...data };
    if ("clientSecret" in patch) {
      delete patch.clientSecret;
      patch.clientSecretRotated = secretRotated;
    }
    await recordAdminClientAudit(
      actionOverride ?? (secretRotated ? "admin.client.rotate_secret" : "admin.client.update"),
      parsedUpdated,
      {
        previousClientCode: parsedExisting.clientCode,
        patch,
      },
      tx,
      auditContext,
    );
    return {
      oldClientDto: parsedExisting,
      updatedClientDto: parsedUpdated,
    };
  });
  await syncUpdatedClientCache(oldClientDto, updatedClientDto);
  return updatedClientDto;
}

export async function updateClientById(clientDto: ClientInputDto, auditContext?: AdminAuditContext) {
  const { oldClientDto, updatedClientDto } = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientById(clientDto.id, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    await assertRenamedClientCodeAvailable(existing.clientCode, clientDto.clientCode, tx);
    const client = await clientRepository.updateClientById(clientDto, tx);
    const parsedExisting = ClientDtoSchema.parse(existing);
    const parsedUpdated = ClientDtoSchema.parse(client);
    const secretRotated = clientDto.clientSecret !== parsedExisting.clientSecret;
    const patch: Record<string, unknown> = { ...clientDto };
    delete patch.id;
    delete patch.clientSecret;
    patch.clientSecretRotated = secretRotated;
    await recordAdminClientAudit(secretRotated ? "admin.client.rotate_secret" : "admin.client.update", parsedUpdated, {
      previousClientCode: parsedExisting.clientCode,
      patch,
    }, tx, auditContext);
    return {
      oldClientDto: parsedExisting,
      updatedClientDto: parsedUpdated,
    };
  });
  await syncUpdatedClientCache(oldClientDto, updatedClientDto);
  return updatedClientDto;
}

export async function updateClientStatus(clientCode: string, status: ClientStatus, auditContext?: AdminAuditContext) {
  await updateClient(clientCode, { status }, auditContext, "admin.client.status_update");
  return true;
}

export async function deleteClient(clientCode: string, auditContext?: AdminAuditContext) {
  const deletedClientDto = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    const client = await clientRepository.softDeleteClientByCode(clientCode, tx);
    const deleted = ClientDtoSchema.parse(client);
    await recordAdminClientAudit("admin.client.delete", deleted, {
      deleted: true,
    }, tx, auditContext);
    return deleted;
  });
  await deleteClientCache(deletedClientDto);
  return true;
}
