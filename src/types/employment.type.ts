import { Prisma } from "../../generated/prisma"

export type EmploymentDTO = {
    id: number
    posId: number
    posCode: string
    posName: string
    orgId: number
    orgCode: string
    orgName: string
    compId: number
    compCode: string
    compName: string
    isPrimary: boolean
    isPrimaryText: string
}

export type EmploymentEntity = Prisma.EmploymentGetPayload<{
    include: {
        position: true,
        deptartment: true,
        company: true,
        user: true
    }

}>
