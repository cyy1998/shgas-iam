import type { ClientDto, ClientInputDto } from '@schemas/client.type';
import { clientMapper } from '@mapper/client.mapper';
import { clientRepository } from '@repositories/client.repository';
import { ClientDtoSchema } from '@schemas/client.type';
import { ZodError } from 'zod';
import { prisma } from '@/db';
import { redis } from '@/lib/clients/redis';

export const clientService = {
  async getClientByCode(clientCode: string) {
    const cacheString = await redis.get(`cache:client:${clientCode}`);
    if (cacheString !== null) {
      try {
        const cacheClient = ClientDtoSchema.parse(JSON.parse(cacheString));
        return cacheClient;
      }
      catch (err) {
        if (err instanceof ZodError) {
          await redis.del(`cache:client:${clientCode}`);
        }
        else {
          throw err;
        }
      }
    }
    const client = await clientRepository.getClientByCode(clientCode);
    console.log(client);
    if (client === null) {
      return null;
    }
    // const clientVo = clientMapper.dtoToVo(clientMapper.entityToDto(client))
    // const clientDto = clientMapper.entityToDto(client);
    const clientDto = ClientDtoSchema.parse(client);

    await redis.set(`cache:client:${clientCode}`, JSON.stringify(clientDto));
    return clientDto;
  },
  async updateClient(clientDto: ClientInputDto) {
    return await prisma.$transaction(async (tx) => {
      const client = await clientRepository.updateClient(clientDto, tx);
      const updatedClientDto = clientMapper.entityToDto(client);
      await redis.set(`cache:client:${updatedClientDto.clientCode}`, JSON.stringify(updatedClientDto));
      return true;
    });
  },
};
