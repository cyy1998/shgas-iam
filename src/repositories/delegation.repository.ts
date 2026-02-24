import type { PrismaTransaction } from '@database/db';
import { DelegationStatus } from '@constants/delegation.status';
import { prisma } from '@database/db';

export const delegationRepository = {
  async getDelegationsBydelegatorsAndprivCode(usernames: string[], privCode: string, tx: PrismaTransaction = prisma) {
    await tx.privilegeDelegation.findMany({
      where: {
        status: DelegationStatus.Enable,
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
