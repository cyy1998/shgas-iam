import { z } from "@hono/zod-openapi"
import { createPageQuerySchema } from "./page.type"
import { UserStatus } from "../constants/user.status"
import { EmploymentAdminDtoSchema, EmploymentAdminVoSchema } from "./employment.admin.type"


export const UserAdminQueryDtoSchema = createPageQuerySchema(
    z.object({
        fuzzyConditions: z.object({
            text: z.string().optional().openapi({ example: '138550' })
        }),
        exactConditions: z.object({
            userTypes: z.array(z.string()).optional().openapi({ example: ['正式员工'] }),
            usernames: z.array(z.string()).optional().openapi({ example: ['138550', '136163'] }),
            phones: z.array(z.string()).optional().openapi({ example: ['17721462865'] }),
            wxIds: z.array(z.string()).optional().openapi({ example: ['1592677631'] }),
            names: z.array(z.string()).optional().openapi({ example: ['蔡奕阳'] })
        })
    })
).openapi('UserAdminQueryDto')

export type UserAdminQueryDto = z.infer<typeof UserAdminQueryDtoSchema>


export const UserAdminDtoSchema = z.object({
    id: z.number().openapi({ example: 1 }),
    username: z.string().openapi({ example: '138550' }),
    name: z.string().openapi({ example: '蔡奕阳' }),
    mobile: z.string().nullable().openapi({ example: '17721462865' }),
    wxId: z.string().nullable().openapi({ example: '1592677631' }),
    userType: z.string().nullable().openapi({ example: '正式员工' }),
    orcasId: z.string().nullable().openapi({ example: 'ada8wf89w83b2' }),
    status: z.enum(UserStatus).openapi({ example: 1 }),
    orderNum: z.number().openapi({ example: 1 }),
    createTime: z.iso.datetime(),
    updateTime: z.iso.datetime()
}).openapi('UserAdminDto')

export type UserAdminDto = z.infer<typeof UserAdminDtoSchema>

export const UserAdminDetailDtoSchema = UserAdminDtoSchema.extend({
    employments: z.array(EmploymentAdminDtoSchema).optional(),
    // privileges: z.array(z.string()).default([]).openapi({ example: ['ui:button:tender:create-GYBG'] }),
    // roles: z.array(z.string()).default([]).openapi({ example: ['tender:default-user'] })
})

export const UserAdminVoSchema = UserAdminDtoSchema.extend({
    statusText: z.string().openapi({ example: '正常' })
}).openapi('UserAdminVo')

export type UserAdminVo = z.infer<typeof UserAdminVoSchema>

export const UserAdminDetailVoSchema = UserAdminVoSchema.extend({
    employments: z.array(EmploymentAdminVoSchema).optional(),
    // privileges: z.array(z.string()).default([]).openapi({ example: ['ui:button:tender:create-GYBG'] }),
    // roles: z.array(z.string()).default([]).openapi({ example: ['tender:default-user'] })
})

