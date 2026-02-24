import type { Prisma } from '@prisma-client/client';

export type PrivilegeDelegationEntity = Prisma.PrivilegeDelegationGetPayload<{
  include: {
    delegateeUser: true;
    delegatorUser: true;
  };
}>;
