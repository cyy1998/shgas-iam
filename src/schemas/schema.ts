import { z } from '@hono/zod-openapi'

export const ResponseSchema = z.object({
    code: z.int().openapi({ example: 200 }),
    data: z.object().openapi({ example: {} }),
    message: z.string().openapi({ example: 'success' })
}).openapi('Response')

export const OrganizationInputSchema = z.object({
    orgCode: z.string().openapi({ example: 'SR23' }),
}).openapi('Username')

export const UserOutSchema = z.object({
    userId: z.int().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '蔡奕阳' }),
    mobile: z.string().openapi({ example: '17721462865' }),
}).openapi('UserOut')