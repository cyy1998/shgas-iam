import type { ClientInputDto } from '@schemas/client.type';
import type { PrismaTransaction } from '@/db';
import { prisma } from '@/db';

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
