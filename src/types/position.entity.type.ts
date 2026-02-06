import type { Prisma } from "../../generated/prisma"

export type PositionAdminEntity = Prisma.PositionGetPayload<{
    include: {
        employments: true
    }

}>