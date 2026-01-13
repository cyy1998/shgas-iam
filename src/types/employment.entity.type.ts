import type { Prisma } from "../../generated/prisma";


export type EmploymentEntity = Prisma.EmploymentGetPayload<{
    include: {
        position: true
        deptartment: true
        company: true
        user: true
    }

}>
