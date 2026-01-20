import type { Prisma } from "../../generated/prisma"

export type PrivilegeDelegationEntity = Prisma.PrivilegeDelegationGetPayload<{
    include: {
        delegateeUser: true,
        delegatorUser: true
    }
}>
