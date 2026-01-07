import { z } from "@hono/zod-openapi"

export const OrganizationDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    orgType: z.string().openapi({ example: '组织类型' }),
    level: z.number().openapi({ example: 2 }),
}).openapi('OrganizationDto')

export type OrganizationDto = z.infer<typeof OrganizationDtoSchema>

export const OrganizationCreateDtoSchema = OrganizationDtoSchema.partial().required({
    orgCode: true,
    orgType: true,
    orgName: true
}).extend({
    parentCode: z.string().openapi({ example: 'SR' })
}).openapi('OrganizationCreateDto')

export type OrganizationCreateDto = z.infer<typeof OrganizationCreateDtoSchema>

export const FormalOrganizationVoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    orgCode: z.string().openapi({ example: 'SR23' }),
    orgName: z.string().openapi({ example: '信息中心' }),
    orgType: z.string().openapi({ example: '组织类型' }),
    level: z.number().openapi({ example: 2 }),
    compCode: z.string().openapi({ example: 'SR' }),
    compName: z.string().openapi({ example: '上海燃气' })
})

export type FormalOrganizationVo = z.infer<typeof FormalOrganizationVoSchema>

