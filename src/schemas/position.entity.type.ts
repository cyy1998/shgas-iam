import type { Prisma } from '@/db/generated/prisma/client';

export type PositionAdminEntity = Prisma.PositionGetPayload<{
  include: {
    employments: true;
  };

}>;
