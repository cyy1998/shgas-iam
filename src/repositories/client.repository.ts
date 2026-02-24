import type { PrismaTransaction } from '@database/db';
import type { ClientInputDto } from '@schemas/client.type';
import { prisma } from '@database/db';

export const clientRepository = {
  async getClientByCode(clientCode: string, tx: PrismaTransaction = prisma) {
    return await tx.client.findFirst({
      where: {
        clientCode,
      },
    });
  },
  async updateClient(clientDto: ClientInputDto, tx: PrismaTransaction = prisma) {
    return await tx.client.update({
      data: clientDto,
      where: {
        id: clientDto.id,
      },
    });
  },
};
