import { Prisma } from "../../generated/prisma"

export type PrivilegeDto = {
    id: number
    privCode: string
    privName: string
    // path: string
}