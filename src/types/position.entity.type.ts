import type { Prisma } from '@prisma-client/client';

export type PositionAdminEntity = Prisma.PositionGetPayload<{
  include: {
    employments: true;
  };

}>;
