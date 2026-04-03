import type { PrismaTransaction } from "@/db";
import { Status } from "@enums/status";
import { prisma } from "@/db";

export async function getDelegationsByUserAndOrganizationScopeAndPrivilege(
  usernames: string[],
  orgCode: string,
  privCode: string,
  tx: PrismaTransaction = prisma,
) {
  const now = new Date();
  return tx.privilegeDelegation.findMany({
    where: {
      delegationDetails: {
        some: {
          privilege: {
            privilegeCode: privCode,
          },
        },
      },
      organizationScope: {
        ancestorClosures: {
          some: {
            descendant: {
              orgCode,
            },
          },
        },
      },
      delegatorUser: {
        username: {
          in: usernames,
        },
      },
      status: Status.Enable,
      startTime: {
        lte: now,
      },
      endTime: {
        gte: now,
      },
    },
    include: {
      delegateeUser: true,
      delegatorUser: true,
    },
  });
}
