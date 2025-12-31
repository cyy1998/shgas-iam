import { z } from "@hono/zod-openapi"
import { Prisma } from "../../generated/prisma"
import { EmploymentStatus } from "../constants/employment.status"

export type EmploymentEntity = Prisma.EmploymentGetPayload<{
    include: {
        position: true,
        deptartment: true,
        company: true,
        user: true
    }

}>

export const EmploymentDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    posId: z.number().openapi({ example: 1 }),
    posCode: z.string().openapi({ example: 'E033' }),
    posName: z.string().openapi({ example: '职员' }),
    orgId: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    compId: z.number().openapi({ example: 1 }),
    compCode: z.string().openapi({ example: 'SR' }),
    compName: z.string().openapi({ example: '上海燃气' }),
    isPrimary: z.boolean().openapi({ example: true }),
    roles: z.array(z.string()).optional(),
    privileges: z.array(z.string()).optional()
}).openapi('EmploymentDto')

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>


