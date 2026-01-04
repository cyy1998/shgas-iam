import { z } from "@hono/zod-openapi"

export const OrganizationDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    orgType: z.string().openapi({ example: '信息中心' }),
    level: z.number().openapi({ example: 2 }),
    compCode: z.string().optional().openapi({ example: 'SR' }),
    compName: z.string().optional().openapi({ example: '上海燃气有限公司' })
}).openapi('OrganizationDto')



export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>

export type OrganizationVo = {
    id: number
    orgCode: string
    orgName: string
    orgType: string
    compCode: string
    compName: string
    level: number
}