import { Prisma } from "../../generated/prisma"

export type PrivilegeDTO = {
    id: number
    privCode: string
    privName: string
    // path: string
}