import type { Prisma } from "@database/client"

export type PrivilegeDelegationEntity = Prisma.PrivilegeDelegationGetPayload<{
    include: {
        delegateeUser: true,
        delegatorUser: true
    }
}>
