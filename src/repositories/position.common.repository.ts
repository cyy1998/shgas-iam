import type { PrismaTransaction } from '@/db';
import { prisma } from '@/db';

export const positionRepository = {
  async getPositionByCode(posCode: string, tx: PrismaTransaction = prisma) {
    return await tx.position.findFirst({
      where: {
        posCode,
      },
    });
  },
  async getPositionById(posId: number, tx: PrismaTransaction = prisma) {
    return await tx.position.findFirst({
      where: {
        id: posId,
      },
    });
  },
};
