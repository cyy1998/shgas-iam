import type { Prisma } from "@prisma-client/client"
// import { Prisma } from '@prisma/client'


export type EmploymentEntity = Prisma.EmploymentGetPayload<{
    include: {
        position: true
        deptartment: true
        company: true
        user: true
    }

}>
