import type { ClientDto, ClientInputDto } from './client.type';
import { ZodError } from 'zod';
import { prisma } from '@/db';
import redis from '@/lib/clients/redis';
import * as clientRepository from '@/services/client/client.repository';
import { ClientDtoSchema } from '@/services/client/client.schema';

async function setClientCache(clientCode: string, clientDto: ClientDto) {
  await redis.set(`cache:client:${clientCode}`, JSON.stringify(clientDto));
}

async function getClientFromCache(clientCode: string): Promise<ClientDto | null> {
  const cacheString = await redis.get(`cache:client:${clientCode}`);
  if (cacheString !== null) {
    try {
      const cacheClient = ClientDtoSchema.parse(JSON.parse(cacheString));
      return cacheClient;
    }
    catch (err) {
      if (err instanceof ZodError) {
        await redis.del(`cache:client:${clientCode}`);
        return null;
      }
      else {
        throw err;
      }
    }
  }
  return null;
}

export async function getClientByCode(clientCode: string) {
  const cachedClient = await getClientFromCache(clientCode);
  if (cachedClient !== null) {
    return cachedClient;
  }
  const client = await clientRepository.getClientByCode(clientCode);
  if (client === null) {
    return null;
  }
  const clientDto = ClientDtoSchema.parse(client);
  await setClientCache(clientCode, clientDto);
  return clientDto;
}

export async function updateClient(clientDto: ClientInputDto) {
  return await prisma.$transaction(async (tx) => {
    const client = await clientRepository.updateClient(clientDto, tx);
    const updatedClientDto = ClientDtoSchema.parse(client);
    await setClientCache(updatedClientDto.clientCode, updatedClientDto);
    return updatedClientDto;
  });
}
