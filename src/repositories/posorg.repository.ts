import type { PrismaTransaction } from "@/db";
import { prisma } from "@/db";

export const posorgRepository = {
  async getPosOrgById(posId: number, orgId: number, tx: PrismaTransaction = prisma) {
    return await tx.posOrgComposition.findFirst({
      where: {
        posId,
        orgId,
      },
    });
  },
  async setPosOrg(posId: number, orgId: number, tx: PrismaTransaction = prisma) {
    return await tx.posOrgComposition.create({
      data: {
        posId,
        orgId,
      },
    });
  },
};
