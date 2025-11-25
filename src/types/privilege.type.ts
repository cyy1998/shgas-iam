import { Prisma } from "../../generated/prisma"

export type PrivilegeDTO = {
    id: number
    privCode: string
    privName: string
    objType: string
    path: string
}

export type PrivilegeEntity = Prisma.PrivilegeGetPayload<{
    include: {
        object: true
    }
}>