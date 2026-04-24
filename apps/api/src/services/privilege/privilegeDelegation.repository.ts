import type { PrivilegeDelegationCreateDto, PrivilegeDelegationQueryDto } from "./privilegeDelegation.type";
import type { PrismaTransaction } from "@/db";
import type { Prettify } from "@/utils/lint.util";
import { Status } from "@enums/status";
import { prisma } from "@/db";
import { CustomError } from "@/errors/CustomError";

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
      organizationScope: {
        include: {
          parent: true,
          children: true,
        },
      },
      delegationDetails: {
        include: {
          privilege: true,
        },
      },
    },
  });
}

export async function searchDelegations(
  query: Prettify<PrivilegeDelegationQueryDto>,
  tx: PrismaTransaction = prisma,
) {
  return tx.privilegeDelegation.findMany({
    where: {
      delegateeUser: {
        username: {
          in: query.delegateeUsernames,
        },
      },
      delegatorUser: {
        username: {
          in: query.delegatorUsernames,
        },
      },
      organizationScope: {
        ancestorClosures: {
          some: {
            descendant: {
              orgCode: {
                in: query.orgCodes,
              },
            },
          },
        },
      },
      startTime: {
        lte: query.validTime,
      },
      endTime: {
        gte: query.validTime,
      },
      delegationDetails: {
        some: {
          privilege: {
            privilegeCode: {
              in: query.privCodes,
            },
          },
        },
      },
      isDelete: false,
    },
    include: {
      delegateeUser: true,
      delegatorUser: true,
      organizationScope: {
        include: {
          parent: true,
          children: true,
        },
      },
      delegationDetails: {
        include: {
          privilege: true,
        },
      },

    },
  });
}

export async function getActiveDelegationsByDelegatorAndPrivileges(
  delegatorUserId: number,
  privilegeIds: number[],
  startTime: Date,
  endTime: Date,
  tx: PrismaTransaction = prisma,
) {
  return tx.privilegeDelegation.findMany({
    where: {
      delegatorUserId,
      isDelete: false,
      status: { not: Status.Disable },
      NOT: {
        OR: [
          { endTime: { lt: startTime } },
          { startTime: { gt: endTime } },
        ],
      },
      delegationDetails: {
        some: {
          privilegeId: { in: privilegeIds },
        },
      },
    },
    include: {
      delegationDetails: {
        include: { privilege: true },
      },
    },
  });
}

export async function updateDelegationStatus(
  id: number,
  status: Status,
  tx: PrismaTransaction = prisma,
) {
  return tx.privilegeDelegation.update({
    where: { id },
    data: { status },
  });
}

export async function setPrivilegeDelegation(
  dto: Prettify<PrivilegeDelegationCreateDto>,
  tx: PrismaTransaction = prisma,
) {
  if (!dto.delegateeUserId || !dto.delegatorUserId || !dto.organizationScopeId || !dto.privilegeIds) {
    throw new CustomError("缺少必要参数");
  }
  return await tx.privilegeDelegation.create({
    data: {
      delegatorUserId: dto.delegatorUserId,
      delegateeUserId: dto.delegateeUserId,
      organizationScopeId: dto.organizationScopeId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      status: Status.Enable,
      description: dto.description,
      delegationDetails: {
        create: dto.privilegeIds.map(p => ({
          privilegeId: p,
        })),
      },
    },
    include: {
      delegateeUser: true,
      delegatorUser: true,
      organizationScope: {
        include: {
          parent: true,
          children: true,
        },
      },
      delegationDetails: {
        include: {
          privilege: true,
        },
      },
    },
  });
}
