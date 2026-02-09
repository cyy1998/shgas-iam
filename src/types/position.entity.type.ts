import type { Prisma } from "@database/client"

export type PositionAdminEntity = Prisma.PositionGetPayload<{
    include: {
        employments: true
    }

}>