import type { ClientStatus } from "@iam/contracts";
import type {
  ClientCreateDto,
  ClientDto,
  ClientInputDto,
  ClientPaginationQueryDto,
  ClientUpdateDto,
} from "./client.type";
import redis from "@admin-api/lib/infra/redis";
import * as clientRepository from "@admin-api/services/client/client.repository";
import { ClientDtoSchema } from "@admin-api/services/client/client.schema";
import { ClientCodeExistsError } from "@iam/api-core/errors/ClientCodeExistsError";
import { ClientNotFoundError } from "@iam/api-core/errors/ClientNotFoundError";
import db from "@iam/db";

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

export async function createClient(clientDto: ClientCreateDto) {
  const createdClientDto = await db.transaction(async (tx) => {
    const existing = await clientRepository.getAnyClientByCode(clientDto.clientCode, tx);
    if (existing !== null) {
      throw new ClientCodeExistsError("客户端编码已存在");
    }
    const client = await clientRepository.createClient(clientDto, tx);
    return ClientDtoSchema.parse(client);
  });
  await setClientCache(createdClientDto);
  return createdClientDto;
}

export async function updateClient(clientCode: string, data: ClientUpdateDto) {
  const { oldClientDto, updatedClientDto } = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    await assertRenamedClientCodeAvailable(clientCode, data.clientCode, tx);
    const client = await clientRepository.updateClientByCode(clientCode, data, tx);
    return {
      oldClientDto: ClientDtoSchema.parse(existing),
      updatedClientDto: ClientDtoSchema.parse(client),
    };
  });
  await syncUpdatedClientCache(oldClientDto, updatedClientDto);
  return updatedClientDto;
}

export async function updateClientById(clientDto: ClientInputDto) {
  const { oldClientDto, updatedClientDto } = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientById(clientDto.id, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    await assertRenamedClientCodeAvailable(existing.clientCode, clientDto.clientCode, tx);
    const client = await clientRepository.updateClientById(clientDto, tx);
    return {
      oldClientDto: ClientDtoSchema.parse(existing),
      updatedClientDto: ClientDtoSchema.parse(client),
    };
  });
  await syncUpdatedClientCache(oldClientDto, updatedClientDto);
  return updatedClientDto;
}

export async function updateClientStatus(clientCode: string, status: ClientStatus) {
  await updateClient(clientCode, { status });
  return true;
}

export async function deleteClient(clientCode: string) {
  const deletedClientDto = await db.transaction(async (tx) => {
    const existing = await clientRepository.getClientByCode(clientCode, tx);
    if (existing === null) {
      throw new ClientNotFoundError("客户端不存在");
    }
    const client = await clientRepository.softDeleteClientByCode(clientCode, tx);
    return ClientDtoSchema.parse(client);
  });
  await deleteClientCache(deletedClientDto);
  return true;
}
