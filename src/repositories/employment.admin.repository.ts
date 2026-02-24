import type { PrismaTransaction } from '@database/db';
import { prisma } from '@database/db';

export const employmentAdminRepository = {
  async getEmploymentsByUserId(userId: number, tx: PrismaTransaction = prisma) {
    return await tx.employment.findMany({
      where: {
        userId,
        isDelete: false,
      },
      include: {
        user: true,
        deptartment: true,
        company: true,
        position: true,
      },
    });
  },
};
