import type { ClientCreateDto, ClientDto, ClientInputDto } from "./client.type";
import { prisma } from "@api/db";
import redis from "@api/lib/clients/redis";
import * as clientRepository from "@api/services/client/client.repository";
import { ClientDtoSchema } from "@api/services/client/client.schema";
import { reviveIsoDates } from "@api/utils/common.utils";
import { ZodError } from "zod";

async function setClientCache(clientDto: ClientDto) {
  await Promise.all([
    redis.set(`cache:client:code:${clientDto.clientCode}`, JSON.stringify(clientDto)),
    redis.set(`cache:client:secret:${clientDto.clientSecret}`, JSON.stringify(clientDto)),
  ]);
}

async function getClientFromCache(key: string, type: string): Promise<ClientDto | null> {
  const cacheString = await redis.get(`cache:client:${type}:${key}`);
  if (cacheString !== null) {
    try {
      const cacheClient = ClientDtoSchema.parse(JSON.parse(cacheString, reviveIsoDates));
      return cacheClient;
    }
    catch (err) {
      if (err instanceof ZodError) {
        await redis.del(`cache:client:${type}:${key}`);
        return null;
      }
      else {
        throw err;
      }
    }
  }
  return null;
}

export async function getClientByCode(clientCode: string): Promise<ClientDto | null> {
  const cachedClient = await getClientFromCache(clientCode, "code");
  if (cachedClient !== null) {
    return cachedClient;
  }
  const client = await clientRepository.getClientByCode(clientCode);
  if (client === null) {
    return null;
  }
  const clientDto = ClientDtoSchema.parse(client);
  await setClientCache(clientDto);
  return clientDto;
}

export async function getClientBySecret(clientSecret: string): Promise<ClientDto | null> {
  const cachedClient = await getClientFromCache(clientSecret, "secret");
  if (cachedClient !== null) {
    return cachedClient;
  }
  const client = await clientRepository.getClientBySecret(clientSecret);
  if (client === null) {
    return null;
  }
  const clientDto = ClientDtoSchema.parse(client);
  await setClientCache(clientDto);
  return clientDto;
}

export async function createClient(clientDto: ClientCreateDto) {
  return await prisma.$transaction(async (tx) => {
    const client = await clientRepository.createClient(clientDto, tx);
    const createdClientDto = ClientDtoSchema.parse(client);
    await setClientCache(createdClientDto);
    return createdClientDto;
  });
}

export async function updateClient(clientDto: ClientInputDto) {
  return await prisma.$transaction(async (tx) => {
    const client = await clientRepository.updateClient(clientDto, tx);
    const updatedClientDto = ClientDtoSchema.parse(client);
    await setClientCache(updatedClientDto);
    return updatedClientDto;
  });
}
