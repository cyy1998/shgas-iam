import { z } from "@hono/zod-openapi"

export const EmploymentDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    userId: z.number().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '138550' }),
    posId: z.number().openapi({ example: 1 }),
    posCode: z.string().openapi({ example: 'E033' }),
    posName: z.string().openapi({ example: '职员' }),
    orgId: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgType: z.string().openapi({ example: '部门' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    compId: z.number().openapi({ example: 1 }),
    compCode: z.string().openapi({ example: 'SR' }),
    compName: z.string().openapi({ example: '上海燃气' }),
    isPrimary: z.boolean().openapi({ example: true })
}).openapi('EmploymentDto')

export type EmploymentDto = z.infer<typeof EmploymentDtoSchema>

export const EmploymentDetailDtoSchema = EmploymentDtoSchema.extend({
    privileges: z.array(z.string()).default([]).openapi({ example: ['ui:button:tender:create-GYBG'] }),
    roles: z.array(z.string()).default([]).openapi({ example: ['tender:default-user'] })
}).openapi('EmploymentDetailDto')

export type EmploymentDetailDto = z.infer<typeof EmploymentDetailDtoSchema>


