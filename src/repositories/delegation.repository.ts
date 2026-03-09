import type { PrismaTransaction } from '@/db';
import { prisma } from '@/db';
import { Status } from '@enums/status';

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
