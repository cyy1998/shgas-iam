import type { Prisma } from '@/db/generated/prisma/client';

export type PrivilegeDelegationEntity = Prisma.PrivilegeDelegationGetPayload<{
  include: {
    delegateeUser: true;
    delegatorUser: true;
  };
}>;
