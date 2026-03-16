import type { PrismaTransaction } from "@/db";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export const delegationRepository = {
  async getDelegationsBydelegatorsAndprivCode(usernames: string[], privCode: string, tx: PrismaTransaction = prisma) {
    await tx.privilegeDelegation.findMany({
      where: {
        status: Status.Enable,
        delegatorUser: {
          username: {
            in: usernames,
          },
        },
        delegationDetails: {
          some: {
            privilege: {
              privilegeCode: privCode,
            },
          },
        },
      },
    });
  },
};
